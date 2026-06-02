import { fetchMemoryCatalog, materializeMemoryValues } from '@mercuryo-ai/magicpay-sdk/core';
import type { MagicPayGatewayConfig } from '@mercuryo-ai/magicpay-sdk';
import {
  applyFill,
  planFill,
  type ApplyFillResult,
  type MemoryTargetMatch,
  type FillTargetDescriptor,
  type TargetValueWriter,
  type ValueFreeMemoryCatalogSnapshot,
} from '@mercuryo-ai/magicpay-sdk/fill-plan-apply';

export interface MemoryPlanApplyExampleParams {
  gateway: MagicPayGatewayConfig;
  sessionId: string;
  targetSet: {
    fingerprint: string;
    targets: FillTargetDescriptor[];
    context?: {
      url?: string;
    };
  };
  targetMatches: MemoryTargetMatch[];
  targetWriter: TargetValueWriter;
}

export async function planAndApplyMemoryFill(
  params: MemoryPlanApplyExampleParams
): Promise<ApplyFillResult> {
  const catalog = await fetchMemoryCatalog(
    params.gateway,
    params.sessionId,
    params.targetSet.context?.url ?? ''
  );
  const memoryCatalog: ValueFreeMemoryCatalogSnapshot = {
    valueVisibility: catalog.valueVisibility,
    handles: catalog.handles.map((handle) => ({
      ...handle,
      valueHandle: { ...handle.valueHandle },
    })),
    missing: catalog.missing,
    conflicts: catalog.conflicts,
    availability: catalog.availability,
    unavailable: catalog.unavailable,
    policies: catalog.policies,
  };

  const plan = await planFill({
    sessionId: params.sessionId,
    targetSet: params.targetSet,
    targetMatches: params.targetMatches,
    memoryCatalog,
  });

  return applyFill({
    plan,
    currentTargetState: {
      fingerprint: params.targetSet.fingerprint,
      targets: params.targetSet.targets,
    },
    materializeValue: async (handle) => {
      const response = await materializeMemoryValues(params.gateway, params.sessionId, [handle]);
      const value = response.values.find((entry) => entry.handle === handle);
      if (!value || value.status !== 'ready') {
        throw new Error(`Memory handle is not ready: ${handle}`);
      }
      return String(value.value ?? value.text ?? '');
    },
    targetWriter: params.targetWriter,
  });
}

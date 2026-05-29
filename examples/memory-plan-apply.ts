import {
  fetchMemoryCatalog,
  materializeMemoryValues,
} from '@mercuryo-ai/magicpay-sdk/core';
import type { MagicPayGatewayConfig } from '@mercuryo-ai/magicpay-sdk';
import {
  applyFill,
  planFill,
  type ApplyFillResult,
  type MemoryTargetMatch,
  type ObservedTarget,
  type ValueFreeMemoryCatalogSnapshot,
} from '@mercuryo-ai/magicpay-sdk/fill-plan-apply';

export interface BrowserFieldWriter {
  fill(input: { targetRef: string; value: string }): Promise<{ status: 'filled' } | void>;
}

export interface MemoryPlanApplyExampleParams {
  gateway: MagicPayGatewayConfig;
  sessionId: string;
  page: {
    url: string;
    fingerprint: string;
    targets: ObservedTarget[];
  };
  targetMatches: MemoryTargetMatch[];
  browserWriter: BrowserFieldWriter;
}

export async function planAndApplyMemoryFill(
  params: MemoryPlanApplyExampleParams
): Promise<ApplyFillResult> {
  const catalog = await fetchMemoryCatalog(params.gateway, params.sessionId, params.page.url);
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
    page: params.page,
    targetMatches: params.targetMatches,
    memoryCatalog,
  });

  return applyFill({
    plan,
    currentPageState: {
      fingerprint: params.page.fingerprint,
      targets: params.page.targets,
    },
    materializeValue: async (handle) => {
      const response = await materializeMemoryValues(params.gateway, params.sessionId, [handle]);
      const value = response.values.find((entry) => entry.handle === handle);
      if (!value || value.status !== 'ready') {
        throw new Error(`Memory handle is not ready: ${handle}`);
      }
      return String(value.value ?? value.text ?? '');
    },
    browserWriter: params.browserWriter,
  });
}

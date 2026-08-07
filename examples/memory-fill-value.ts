import { materializeMemoryValues } from '@nuanu-ai/magicpay-sdk/core';
import type { MagicPayGatewayConfig } from '@nuanu-ai/magicpay-sdk';
import {
  fillMemoryValue,
  type FillMemoryValueResult,
  type TargetValueWriteResult,
} from '@nuanu-ai/magicpay-sdk/fill-plan-apply';

export interface MemoryFillValueExampleParams {
  gateway: MagicPayGatewayConfig;
  sessionId: string;
  handle: string;
  write: (value: string) => Promise<TargetValueWriteResult | void> | TargetValueWriteResult | void;
}

export async function fillOneMemoryValue(
  params: MemoryFillValueExampleParams
): Promise<FillMemoryValueResult> {
  return fillMemoryValue({
    handle: params.handle,
    materializeValue: async (handle) => {
      const response = await materializeMemoryValues(params.gateway, params.sessionId, [handle]);
      const value = response.values.find((entry) => entry.handle === handle);
      if (!value || value.status !== 'ready') {
        throw new Error(`Memory handle is not ready: ${handle}`);
      }
      return String(value.value ?? value.text ?? '');
    },
    write: params.write,
  });
}

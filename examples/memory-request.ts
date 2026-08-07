import {
  createMagicPayClient,
  type MagicPayGatewayConfig,
  type MagicPayMemoryRequestedField,
  type MagicPayWaitForResultOptions,
} from '@nuanu-ai/magicpay-sdk';

export interface MemoryRequestExampleParams {
  gateway: MagicPayGatewayConfig;
  sessionId: string;
  clientRequestId: string;
  url: string;
  merchantName?: string;
  fields: MagicPayMemoryRequestedField[];
  wait?: MagicPayWaitForResultOptions;
}

export async function requestMissingMemoryValues(params: MemoryRequestExampleParams) {
  const client = createMagicPayClient({
    gateway: params.gateway,
  });

  const handle = await client.memory.createRequest(params.sessionId, {
    clientRequestId: params.clientRequestId,
    kind: 'memory.provide_missing',
    fields: params.fields,
    context: {
      url: params.url,
      ...(params.merchantName ? { merchantName: params.merchantName } : {}),
    },
  });

  const result = await client.memory.waitForResult(params.sessionId, handle, params.wait);
  if (!result.ok) {
    throw new Error(`Memory request failed: ${result.reason}`);
  }

  return result;
}

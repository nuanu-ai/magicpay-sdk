import {
  createMagicPayClient,
  type MagicPayGatewayConfig,
  type MagicPayMemoryRequestedField,
  type MagicPayRequestResult,
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

export type FulfilledMemoryRequestResult = Extract<MagicPayRequestResult, { ok: true }>;

export type MemoryRequestExampleOutcome =
  | { status: 'fulfilled'; result: FulfilledMemoryRequestResult }
  | { status: 'declined'; requestId: string }
  | { status: 'pending'; requestId: string };

export async function requestMissingMemoryValues(
  params: MemoryRequestExampleParams
): Promise<MemoryRequestExampleOutcome> {
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
  if (result.ok) {
    return { status: 'fulfilled', result };
  }

  switch (result.reason) {
    case 'denied':
      // The user refused. That is a business outcome, not a failure.
      return { status: 'declined', requestId: result.requestId };
    case 'timeout':
      // Local waiter timeout only: the request is still open in the user's
      // MagicPay UI. Keep the request id and resume waiting from any process.
      return { status: 'pending', requestId: result.requestId };
    default:
      // 'expired' | 'failed' | 'canceled' are terminal.
      throw new Error(`Memory request ${result.reason}: ${result.message ?? 'no details'}`);
  }
}

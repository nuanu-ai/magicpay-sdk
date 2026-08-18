import { createMagicPayClient, type MagicPayGatewayConfig } from '@nuanu-ai/magicpay-sdk';

export function createMagicPayTestClient(params: {
  gateway?: MagicPayGatewayConfig;
  responses: Map<string, Response>;
}) {
  return createMagicPayClient({
    gateway: params.gateway ?? {
      apiKey: 'test_api_key',
      apiUrl: 'https://durcottggsiesxxqzvbb.supabase.co/functions/v1/api',
    },
    fetchImpl: async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toUpperCase();
      const key = `${method} ${String(input)}`;
      const response = params.responses.get(key);

      if (!response) {
        throw new Error(`Unexpected ${key}`);
      }

      return response;
    },
  });
}

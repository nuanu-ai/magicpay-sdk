# Testing

Inject `fetchImpl` to test SDK integrations without live network calls.

```ts
import { createMagicPayClient } from '@mercuryo-ai/magicpay-sdk';

const responses = new Map<string, Response>();
responses.set(
  'GET https://agents-api.mercuryo.io/functions/v1/api/memory-items',
  new Response(JSON.stringify({ facts: { preferred_name: 'Ada' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
);

const client = createMagicPayClient({
  gateway: {
    apiKey: 'test_api_key',
    apiUrl: 'https://agents-api.mercuryo.io/functions/v1/api',
  },
  fetchImpl: async (input, init = {}) => {
    const key = `${(init.method ?? 'GET').toUpperCase()} ${String(input)}`;
    const response = responses.get(key);
    if (!response) {
      throw new Error(`Unexpected ${key}`);
    }
    return response;
  },
});
```

For fill-plan tests, keep the browser writer as a small fake that records
`targetRef` and `value`, then assert the result status and field outcomes.

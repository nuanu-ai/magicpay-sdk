# Testing

Inject `fetchImpl` to test SDK integrations without live network calls.

```ts
import { createMagicPayClient } from '@nuanu-ai/magicpay-sdk';

const responses = new Map<string, Response>();
responses.set(
  'GET https://api.magicpay.nuanu.ai/functions/v1/api/memory-items?all_sites=true',
  new Response(JSON.stringify({ items: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
);

const client = createMagicPayClient({
  gateway: {
    apiKey: 'test_api_key',
    apiUrl: 'https://api.magicpay.nuanu.ai/functions/v1/api',
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

For `fillMemoryValue(...)` tests, pass a fake `materializeValue` callback and
a fake `write` callback that records the value locally. Assert the returned
status and avoid logging the recorded value.

For `applyFill(...)` tests, keep the target writer as a small fake that records
`targetRef`, `fieldRef` when present, the display `fieldLabel`, and `value`,
then assert the result status and field outcomes.

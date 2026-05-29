# Getting Started

## 1. Create a client

```ts
import { createMagicPayClient } from '@mercuryo-ai/magicpay-sdk';

export const client = createMagicPayClient({
  gateway: {
    apiKey: process.env.MAGICPAY_API_KEY!,
    apiUrl: 'https://agents-api.mercuryo.io/functions/v1/api',
  },
});
```

The SDK is intended for trusted runtime code. Do not expose the API key to an
untrusted browser.

## 2. Create a session

```ts
const { session } = await client.sessions.create({
  type: 'payment',
  description: 'Book a flight',
  merchantName: 'Airline Example',
});
```

The session groups Memory requests, action requests, choice requests, browser
telemetry, and completion state.

## 3. Create a Memory request

```ts
const handle = await client.memory.createRequest(session.id, {
  clientRequestId: 'checkout-email-1',
  kind: 'memory.provide_missing',
  fields: [{ key: 'email', label: 'Email', required: true, type: 'email' }],
  context: {
    url: 'https://airline.example.com/login',
    merchantName: 'Airline Example',
  },
});

const result = await client.memory.waitForResult(session.id, handle);

if (!result.ok) {
  throw new Error(result.reason);
}
```

Memory request kinds:

| Kind | Use when |
| --- | --- |
| `memory.ask_before_use` | A stored Memory handle requires explicit use approval. |
| `memory.provide_missing` | A needed field has no usable Memory handle yet. |
| `memory.runtime_value` | The runtime needs one current-run value reference. |
| `memory.choose_candidate` | Several Memory candidates can satisfy the same target. |
| `memory.provider_reauth` | A provider-backed handle needs reauthentication. |
| `memory.provider_unavailable` | A provider-backed handle cannot be used now. |
| `memory.stale_target` | The browser target changed and the user must choose how to continue. |

## 5. Plan and apply browser fill

```ts
import { fetchMemoryCatalog, materializeMemoryValues } from '@mercuryo-ai/magicpay-sdk/core';
import { applyFill, planFill } from '@mercuryo-ai/magicpay-sdk/fill-plan-apply';

const page = {
  url: 'https://airline.example.com/login',
  fingerprint: 'page-fingerprint',
  targets: [{ targetRef: 'email', label: 'Email', fieldName: 'email', fillable: true }],
};

const catalog = await fetchMemoryCatalog(client.gateway, session.id, page.url);

const plan = await planFill({
  sessionId: session.id,
  page,
  targetMatches: [
    {
      status: 'matched',
      targetRef: 'email',
      fieldRef: 'profile.email',
      fieldName: 'email',
      confidence: 'high',
    },
  ],
  memoryCatalog: catalog,
});

const applyResult = await applyFill({
  plan,
  currentPageState: {
    fingerprint: page.fingerprint,
    targets: page.targets,
  },
  materializeValue: async (handle) => {
    const response = await materializeMemoryValues(client.gateway, session.id, [handle]);
    const entry = response.values.find((value) => value.handle === handle);
    return entry?.value ?? entry?.text ?? '';
  },
  browserWriter: {
    async fill(input) {
      await yourBrowser.fill(input.targetRef, input.value);
      return { status: 'filled' };
    },
  },
});
```

`planFill(...)` is value-free. `applyFill(...)` materializes only handles that
are ready for the current page state and stops before final commitment actions.
If the catalog says a provider-backed payment card exists but needs payment
authorization, `planFill(...)` returns a non-blocking blocker with
`kind: 'payment_card.authorization_required'`,
`status: 'authorization_required'`, and
`reason: 'payment_authorization_required'`. Treat that as machine state:
collect visible payment facts, run the `authorize_payment` action flow, fetch
a fresh catalog for the same active session, and plan again.

## 6. Confirm an action

```ts
const action = await client.actions.run(session.id, {
  clientRequestId: 'confirm-checkout-1',
  capability: 'confirm',
  params: {
    summary: 'Confirm checkout',
  },
  context: {
    url: 'https://airline.example.com/pay',
    merchantName: 'Airline Example',
  },
});

const actionResult = await client.actions.waitForResult(session.id, action);
```

Use actions for explicit user-confirmed operations. Field fill and final
commitment should stay separate.

## 7. Ask the user to choose

```ts
const choice = await client.choice.request(session.id, {
  prompt: 'Choose a flight',
  options: [
    { id: 'flight-1', title: '08:00 direct flight', price: { amount: 320, currency: 'USD' } },
    { id: 'flight-2', title: '12:00 direct flight', price: { amount: 350, currency: 'USD' } },
  ],
});

const choiceResult = await client.choice.waitForResult(session.id, choice);
```

Choice requests are for runtime options. They are not a replacement for Memory
requests or action confirmations.

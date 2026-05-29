# @mercuryo-ai/magicpay-sdk

[![npm version](https://img.shields.io/npm/v/@mercuryo-ai/magicpay-sdk)](https://www.npmjs.com/package/@mercuryo-ai/magicpay-sdk) [![License](https://img.shields.io/badge/license-proprietary-red.svg)](LICENSE.md) [![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

TypeScript SDK for MagicPay workflow sessions, Memory, Memory-backed
runtime value requests, user-confirmed actions, and user choices.

Use this package from trusted Node or TypeScript code when your runtime needs
to:

- read or save reusable Memory;
- ask the user for a Memory decision or missing Memory value;
- fill browser fields from runtime-only Memory handles;
- detect that a provider-backed payment card exists but needs payment
  authorization before card handles can be revealed;
- ask the user to confirm an action;
- ask the user to choose from runtime-provided options;
- wait for request results without writing polling code.

The SDK talks to the MagicPay API. Browser observation, UI, final business
steps, and any provider calls remain in your runtime.

## Install

```bash
npm i @mercuryo-ai/magicpay-sdk
```

Create an API key at
[`agents.mercuryo.io/signup`](https://agents.mercuryo.io/signup).

Default API base URL:

```text
https://agents-api.mercuryo.io/functions/v1/api
```

## Entrypoints

| Entrypoint | Purpose |
| --- | --- |
| `@mercuryo-ai/magicpay-sdk` | Root client for sessions, Memory, Memory requests, actions, choices, and request waiting. |
| `@mercuryo-ai/magicpay-sdk/core` | Lower-level helpers such as Memory catalog fetch and runtime materialization. |
| `@mercuryo-ai/magicpay-sdk/fill-plan-apply` | Pure plan/apply helpers for Memory-backed browser field fill. |
| `@mercuryo-ai/magicpay-sdk/magicsearch` | MagicSearch client helpers. |

## Quick Start

```ts
import { createMagicPayClient } from '@mercuryo-ai/magicpay-sdk';

const client = createMagicPayClient({
  gateway: {
    apiKey: process.env.MAGICPAY_API_KEY!,
    apiUrl: 'https://agents-api.mercuryo.io/functions/v1/api',
  },
});

const { session } = await client.sessions.create({
  type: 'payment',
  description: 'Book a flight',
  merchantName: 'Airline Example',
});

const handle = await client.memory.createRequest(session.id, {
  clientRequestId: 'airline-login-email-1',
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

if (result.artifact.kind !== 'reference') {
  throw new Error(`Unexpected artifact kind: ${result.artifact.kind}`);
}

await yourRuntime.continueWithMemoryReference(result.artifact.reference, facts);
```

Memory request results return references, not reusable raw values. For browser
field fill, fetch the Memory catalog, plan against observed targets, then
materialize only the handles needed for the current run.
Provider-backed payment cards are not returned as ordinary catalog handles
until payment authorization succeeds in the active session. Before approval,
the catalog keeps `valueVisibility: 'handles_only'` and reports the card under
`unavailable` with `availability.status: 'authorization_required'`.

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

const paymentCardBlocker = plan.blockers.find(
  (blocker) =>
    blocker.kind === 'payment_card.authorization_required' &&
    blocker.status === 'authorization_required'
);

if (paymentCardBlocker) {
  await yourRuntime.collectPaymentFactsAndAuthorizePayment();
}

const applyResult = await applyFill({
  plan,
  currentPageState: {
    fingerprint: page.fingerprint,
    targets: page.targets,
  },
  materializeValue: async (handle) => {
    const response = await materializeMemoryValues(client.gateway, session.id, [handle]);
    const value = response.values.find((entry) => entry.handle === handle);
    return value?.value ?? value?.text ?? '';
  },
  browserWriter: {
    async fill(input) {
      await yourBrowser.fill(input.targetRef, input.value);
      return { status: 'filled' };
    },
  },
});

if (applyResult.status !== 'filled' && applyResult.status !== 'partial') {
  throw new Error(applyResult.status);
}
```

## Main Client Surface

- `client.memory.createRequest(...)` reads reusable Memory.
- `client.memory.createRequest(...)` saves explicit reusable Memory.
- `client.memory.createRequest(sessionId, input)` creates a Memory request.
- `client.memory.submitDecision(sessionId, requestId, input)` submits a Memory decision.
- `client.memory.claim(sessionId, requestId)` claims a completed Memory request.
- `client.memory.waitForResult(sessionId, handle)` waits and claims.
- `client.memoryItems.list(...)` lists value-free Memory item records.
- `client.memoryItems.create(...)` creates a Memory item with encrypted value handles.
- `client.memoryItems.update(...)` patches an existing Memory item, for example the global `Facts about user` profile item.
- `client.actions.run(...)` and `client.actions.waitForResult(...)` handle user-confirmed actions.
- `client.choice.request(...)` and `client.choice.waitForResult(...)` handle option selection.
- `client.requests.waitForResult(...)` waits on non-Memory request handles.
- `client.sessions.*` creates, reads, describes, and completes workflow sessions.

See [Getting Started](./docs/getting-started.md), [API Reference](./docs/api-reference.md),
and [Examples](./docs/examples.md) for the full integration guide.

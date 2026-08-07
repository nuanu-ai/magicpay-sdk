# @nuanu-ai/magicpay-sdk

[![npm version](https://img.shields.io/npm/v/@nuanu-ai/magicpay-sdk)](https://www.npmjs.com/package/@nuanu-ai/magicpay-sdk) [![License](https://img.shields.io/badge/license-proprietary-red.svg)](LICENSE.md) [![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

TypeScript SDK for MagicPay workflow sessions, Memory, target-agnostic
Memory fill, user-confirmed actions, and user choices.

MagicPay lets a personal AI agent act on a user's behalf — sign in, fill
checkout and identity forms, and pay — **without raw secrets, card numbers, or
credentials ever entering the model's context**. Your runtime keeps the agent,
the browser, and any provider calls; MagicPay owns the user's reusable data, the
human approvals, and the value-free planning between them. New here? Start with
[Core Concepts](./docs/concepts.md).

Use this package from trusted Node or TypeScript code when your runtime needs
to:

- read or save reusable Memory;
- ask the user for a Memory decision or missing Memory value;
- fill any trusted runtime target from runtime-only Memory handles, for example
  API headers, provider SDK calls, or browser fields;
- detect that a provider-backed payment card exists but needs payment
  authorization before card handles can be revealed;
- ask the user to confirm an action;
- ask the user to choose from runtime-provided options;
- wait for request results without writing polling code.

The SDK talks to the MagicPay API. Browser observation, UI, final business
steps, and any provider calls remain in your runtime.

## Core concepts

The model the rest of this README assumes (full version in
[Core Concepts](./docs/concepts.md)):

- **Session** — the container for one workflow; create it, then complete it.
- **Request** — a waitable, human-in-the-loop task. Your runtime creates and
  waits; the user's MagicPay UI answers. A local `waitForResult` timeout is not
  terminal.
- **Handles, not values** — planning and catalogs carry opaque handles; raw
  values are materialized only inside your callbacks, never logged or sent to a
  model.
- **Two "handles"** — a _request handle_ goes to `waitForResult(...)`; a _Memory
  value handle_ (a string) goes to `materializeValue(...)`.
- **`memoryItems` vs `memory`** — `client.memoryItems` is CRUD over saved
  records (`list`, `get`, `create`, `update`, `delete`); `client.memory` is
  waitable user requests.
- **Fill is not commit** — fill helpers write values into targets but never
  submit, pay, or book. Final commitment is a separate `client.actions` request.

## Install

```bash
npm i @nuanu-ai/magicpay-sdk
```

Create an API key at
[`agents.mercuryo.io/signup`](https://agents.mercuryo.io/signup).

Default API base URL:

```text
https://agents-api.mercuryo.io/functions/v1/api
```

## Entrypoints

| Entrypoint                                  | Purpose                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@nuanu-ai/magicpay-sdk`                 | Root client for sessions, Memory, Memory requests, actions, choices, and request waiting.           |
| `@nuanu-ai/magicpay-sdk/core`            | Lower-level helpers such as Memory catalog fetch and runtime materialization.                       |
| `@nuanu-ai/magicpay-sdk/fill-plan-apply` | Target-agnostic Memory fill helpers: `fillMemoryValue(...)`, `applyFill(...)`, and `planFill(...)`. |
| `@nuanu-ai/magicpay-sdk/magicsearch`     | MagicSearch client helpers.                                                                         |

## Quick Start

```ts
import { createMagicPayClient } from '@nuanu-ai/magicpay-sdk';

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

Memory request results return references, not reusable raw values.

## Memory Fill

Use the fill helpers when your runtime has a Memory handle and needs to write
the current-run value into a trusted target. The target can be an API request,
a provider SDK call, a database write, or a browser field. Raw values are not
returned from the helper results and should not be sent to model prompts.

### Fill One Known Handle

Use `fillMemoryValue(...)` when your code already knows the handle. The value
exists only inside your `materializeValue` and `write` callbacks.

```ts
import { materializeMemoryValues } from '@nuanu-ai/magicpay-sdk/core';
import { fillMemoryValue } from '@nuanu-ai/magicpay-sdk/fill-plan-apply';

await fillMemoryValue({
  handle: 'handle_api_token',
  materializeValue: async (handle) => {
    const response = await materializeMemoryValues(client.gateway, session.id, [handle]);
    const entry = response.values.find((value) => value.handle === handle);
    if (!entry || entry.status !== 'ready') {
      throw new Error(`Memory handle is not ready: ${handle}`);
    }
    return String(entry.value ?? entry.text ?? '');
  },
  write: async (value) => {
    request.headers.authorization = `Bearer ${value}`;
  },
});
```

### Apply A Ready Plan

Use `applyFill(...)` when your runtime already has a `FillPlan`. The plan can
come from your own code, a stored artifact, or `planFill(...)`. The plan must
contain handles, not raw values.

```ts
import { materializeMemoryValues } from '@nuanu-ai/magicpay-sdk/core';
import { applyFill, type FillPlan } from '@nuanu-ai/magicpay-sdk/fill-plan-apply';

const plan: FillPlan = {
  id: 'api-auth-plan',
  valueVisibility: 'handles_only',
  targetSetFingerprint: 'api-request-v1',
  fields: [
    {
      targetRef: 'authorization-header',
      fieldName: 'authorization',
      fieldRef: 'api.bearer_token',
      state: 'ready',
      valueHandle: 'handle_api_token',
    },
  ],
  blockers: [],
  finalCommitmentTargets: [],
};

const applyResult = await applyFill({
  plan,
  currentTargetState: { fingerprint: 'api-request-v1' },
  materializeValue: async (handle) => {
    const response = await materializeMemoryValues(client.gateway, session.id, [handle]);
    const entry = response.values.find((value) => value.handle === handle);
    if (!entry || entry.status !== 'ready') {
      throw new Error(`Memory handle is not ready: ${handle}`);
    }
    return String(entry.value ?? entry.text ?? '');
  },
  targetWriter: {
    async write({ value }) {
      request.headers.authorization = `Bearer ${value}`;
      return { status: 'filled' };
    },
  },
});
```

### Plan, Then Apply

Use `planFill(...)` when you want the SDK to build the `FillPlan` from a
value-free Memory catalog, your target descriptors, and Memory target matches.
Provider-backed payment cards are not returned as ordinary catalog handles
until payment authorization succeeds in the active session. Before approval,
the catalog keeps `valueVisibility: 'handles_only'` and reports the card under
`unavailable` with `availability.status: 'authorization_required'`.

```ts
import { fetchMemoryCatalog, materializeMemoryValues } from '@nuanu-ai/magicpay-sdk/core';
import { applyFill, planFill } from '@nuanu-ai/magicpay-sdk/fill-plan-apply';

const targetSet = {
  fingerprint: 'login-form-v1',
  targets: [{ targetRef: 'email', label: 'Email', fieldName: 'email', writable: true }],
  context: { url: 'https://airline.example.com/login' },
};

const catalog = await fetchMemoryCatalog(client.gateway, session.id, targetSet.context.url);

const plan = await planFill({
  sessionId: session.id,
  targetSet,
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
  currentTargetState: {
    fingerprint: targetSet.fingerprint,
    targets: targetSet.targets,
  },
  materializeValue: async (handle) => {
    const response = await materializeMemoryValues(client.gateway, session.id, [handle]);
    const value = response.values.find((entry) => entry.handle === handle);
    if (!value || value.status !== 'ready') {
      throw new Error(`Memory handle is not ready: ${handle}`);
    }
    return String(value.value ?? value.text ?? '');
  },
  targetWriter: {
    async write(input) {
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

- `client.memoryItems.list({ url })` lists value-free Memory item records for the current site; use `{ allSites: true }` only for explicit global review.
- `client.memoryItems.get(itemId)` reads one value-free Memory item by stable item id.
- `client.memoryItems.create(...)` creates a Memory item with human-readable field labels.
- `client.memoryItems.update(itemId, ...)` patches an existing Memory item. Address existing fields by `fieldRef`, not by label.
- `client.memoryItems.delete(itemId)` soft-deletes one editable Memory item.
- A Memory item is a user-owned reusable record with a human-readable label and
  related fields. Use labels like `Airline login`, `Traveler profile`,
  `Home shipping address`, or `Facts about user`; do not put raw values in the
  label.
- Field labels are human display and matcher evidence, not stable identity.
  Use `fieldRef` for existing-field updates and deletes.
- Memory item fields may include `valueType` / `value_type` when the stored
  value should be normalized for projection. Public editable value types are
  `date`, `phone_number`, and `person_name`. Omit the type for ordinary direct
  fill. Card value types are internal provider-backed fill types and are not
  accepted by public Memory CRUD.
- `secret` / `isSecret` is mutable display and logging metadata for a field. It
  is not a value type and not an encryption mode.
- `client.memory.createRequest(sessionId, input)` creates a Memory request.
- `client.memory.submitDecision(sessionId, requestId, input)` submits a Memory decision.
- `client.memory.claim(sessionId, requestId)` claims a completed Memory request.
- `client.memory.waitForResult(sessionId, handle)` waits and claims.
- `client.actions.run(...)` and `client.actions.waitForResult(...)` handle user-confirmed actions.
- `client.choice.request(...)` and `client.choice.waitForResult(...)` handle option selection.
- `client.requests.waitForResult(...)` waits on non-Memory request handles.
- `client.sessions.*` creates, reads, describes, and completes workflow sessions.

See [Getting Started](./docs/getting-started.md), [API Reference](./docs/api-reference.md),
and [Examples](./docs/examples.md) for the full integration guide.

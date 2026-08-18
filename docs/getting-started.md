# Getting Started

New to MagicPay? Read [Core Concepts](./concepts.md) first — it explains
sessions, requests, handles vs values, and why fill is not commit.

## 1. Create a client

```ts
import { createMagicPayClient } from '@nuanu-ai/magicpay-sdk';

export const client = createMagicPayClient({
  gateway: {
    apiKey: process.env.MAGICPAY_API_KEY!,
    apiUrl: 'https://durcottggsiesxxqzvbb.supabase.co/functions/v1/api',
  },
});
```

The SDK is intended for trusted runtime code. Do not expose the API key to an
untrusted browser.

Before wiring anything else, confirm the key works: `getAuthenticatedAgent(...)`
returns the agent the key belongs to, and throws a `MagicPayRequestError` with
`status: 401` when the key is wrong or revoked. The runnable version of that
check is [`examples/hello-world.ts`](../examples/hello-world.ts).

## 2. Create a session

```ts
const { session } = await client.sessions.create({
  type: 'payment',
  description: 'Book a flight',
  merchantName: 'Airline Example',
});
```

The session groups Memory requests, action requests, choice requests, runtime
telemetry, and completion state.

## 3. Ask for missing Memory

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
  if (result.reason === 'timeout') {
    // Local waiter timeout — not terminal. The request is still open in the
    // user's MagicPay UI: persist result.requestId and resume waiting later.
    await yourRuntime.resumeRequestLater(session.id, result.requestId);
  } else if (result.reason === 'denied') {
    // The user refused: a business outcome, not a failure.
    await yourRuntime.continueWithoutSavedEmail();
  } else {
    // 'expired' | 'failed' | 'canceled' are terminal.
    throw new Error(`Memory request ${result.reason}`);
  }
}
```

`waitForResult(...)` waits up to 5 minutes by default and polls every 3 seconds;
pass `timeoutMs`, `intervalMs`, or an `AbortSignal` to change that — see
[Waiting for results](./api-reference.md#waiting-for-results).

Nothing in your process answers this request. Your runtime only creates it and
waits; the person answers it in their own MagicPay UI — web, mobile, or a chat
surface such as ChatGPT, Claude, or Telegram — where it appears with the context
you sent. `submitDecision(...)` and `claim(...)` are the answering side's calls,
so a runtime integration normally never uses them; a test harness that plays
both sides is the exception (see [Testing](./testing.md)). Because a human is on
the other end, minutes of waiting are normal, and a local `timeout` means your
waiter gave up rather than the person.

Memory request kinds:

| Kind                          | Use when                                                     |
| ----------------------------- | ------------------------------------------------------------ |
| `memory.ask_before_use`       | A stored Memory handle requires explicit use approval.       |
| `memory.provide_missing`      | A needed field has no usable Memory handle yet.              |
| `memory.runtime_value`        | The runtime needs one current-run value reference.           |
| `memory.choose_candidate`     | Several Memory candidates can satisfy the same target.       |
| `memory.provider_reauth`      | A provider-backed handle needs reauthentication.             |
| `memory.provider_unavailable` | A provider-backed handle cannot be used now.                 |
| `memory.stale_target`         | The target changed and the user must choose how to continue. |

## 4. Save typed Memory when the value has a known shape

Saved Memory fields can be untyped strings for direct fill, or they can carry
one public `valueType` when deterministic projection should be available during
fill. The public editable value types are `date`, `phone_number`, and
`person_name`.

```ts
await client.memoryItems.create({
  label: 'Traveler profile',
  askBeforeUse: true,
  fields: [
    {
      label: 'Full name',
      value: 'Dmitry Ivanov',
      valueType: 'person_name',
      hint: 'Full legal name for identity and booking forms',
    },
    {
      label: 'Date of birth',
      value: '1990-05-10',
      valueType: 'date',
      hint: 'Date of birth in YYYY-MM-DD',
    },
    {
      label: 'Phone',
      value: '+14155550100',
      valueType: 'phone_number',
      hint: 'Phone number in E.164 format',
    },
  ],
});
```

Omit `valueType` for ordinary direct fill. Public Memory CRUD rejects internal
card value types; provider-backed payment cards expose card fill handles only
through the session catalog after payment authorization.

When editing saved Memory later, list or get the item first and use the
returned `fieldRef` for existing fields. Field labels are human display and
matcher evidence, not stable identity. `secret` / `isSecret` is mutable
display/logging metadata for any field, not a value type or encryption mode.

## 5. Fill one known handle

This is the shortest path when your runtime already knows which Memory handle
to use. The raw value exists only inside the `materializeValue` and `write`
callbacks.

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
    const expected = `Bearer ${value}`;
    request.headers.authorization = expected;
    return request.headers.authorization === expected
      ? { status: 'filled', verification: { verified: true, strategy: 'exact' } }
      : { status: 'blocked', reason: 'postcondition_mismatch' };
  },
});
```

The writer must re-read the destination and return only value-free verification.
Void or unverified results fail closed and never enter the completion ledger.
For resumable browser fills, also return the current per-write `scope` with
`pageRef`, `documentRef`, and a screened origin+pathname `pageUrl`. A later SPA
route must not overwrite the scope of an earlier completion.

Use this for one-value writes such as API auth headers, provider SDK inputs,
or a single browser field.

## 6. Apply a plan you already have

Use `applyFill(...)` when the handle-only plan already exists. The plan may be
authored by your runtime, loaded from storage, or returned by `planFill(...)`.

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
      fieldRef: 'api.bearer_token',
      fieldLabel: 'Bearer token',
      fieldName: 'authorization',
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
      const expected = `Bearer ${value}`;
      request.headers.authorization = expected;
      return request.headers.authorization === expected
        ? { status: 'filled', verification: { verified: true, strategy: 'exact' } }
        : { status: 'blocked', reason: 'postcondition_mismatch' };
    },
  },
});
```

`applyFill(...)` verifies the target-set fingerprint before materializing
handles. It returns statuses such as `filled`, `partial`, `waiting_for_user`,
`needs_replan`, `blocked`, and `no_progress`; it never performs final submit,
purchase, booking, signing, or payment actions.

## 7. Plan, then apply

Use `planFill(...)` when you want the SDK to build the `FillPlan` from a
value-free Memory catalog, your target descriptors, and Memory target matches.
This example uses a browser target adapter, but the SDK API is the same for any
trusted target writer. Each entry in `targets` is a `FillTargetDescriptor` and
is free text by default; set `writeCapability` to `{ kind: 'choice', options }`
for a select target, `{ kind: 'toggle' }` for a checkbox or switch, or
`{ kind: 'unavailable', reason }` for one that cannot be written.

```ts
import { fetchMemoryCatalog, materializeMemoryValues } from '@nuanu-ai/magicpay-sdk/core';
import { applyFill, planFill } from '@nuanu-ai/magicpay-sdk/fill-plan-apply';

const targetSet = {
  fingerprint: 'login-form-v1',
  targets: [{ targetRef: 'email', label: 'Email', fieldName: 'email' }],
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
      fieldLabel: 'Email',
      fieldName: 'email',
      confidence: 'high',
    },
  ],
  memoryCatalog: catalog,
});

const applyResult = await applyFill({
  plan,
  currentTargetState: {
    fingerprint: targetSet.fingerprint,
    targets: targetSet.targets,
  },
  materializeValue: async (handle) => {
    const response = await materializeMemoryValues(client.gateway, session.id, [handle]);
    const entry = response.values.find((value) => value.handle === handle);
    if (!entry || entry.status !== 'ready') {
      throw new Error(`Memory handle is not ready: ${handle}`);
    }
    return String(entry.value ?? entry.text ?? '');
  },
  targetWriter: {
    async write(input) {
      await yourBrowser.fill(input.targetRef, input.value);
      const observed = await yourBrowser.readValue(input.targetRef);
      return observed === input.value
        ? { status: 'filled', verification: { verified: true, strategy: 'exact' } }
        : { status: 'blocked', reason: 'postcondition_mismatch' };
    },
  },
});
```

`planFill(...)` is value-free. If the catalog says a provider-backed payment
card exists but needs payment authorization, `planFill(...)` returns a
non-blocking blocker with `kind: 'payment_card.authorization_required'`,
`status: 'authorization_required'`, and
`reason: 'payment_authorization_required'`. Treat that as machine state:
collect visible payment facts, run the `authorize_payment` action flow, fetch
a fresh catalog for the same active session, and plan again.

## 8. Confirm an action

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

## 9. Ask the user to choose

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

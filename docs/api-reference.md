# API Reference

## `createMagicPayClient(options)`

```ts
import { createMagicPayClient } from '@mercuryo-ai/magicpay-sdk';

const client = createMagicPayClient({
  gateway: {
    apiKey: '...',
    apiUrl: 'https://agents-api.mercuryo.io/functions/v1/api',
  },
  fetchImpl,
});
```

`fetchImpl` is optional and is useful in tests.

## Memory APIs

```ts
const items = await client.memoryItems.list({ status: 'active' });
const handle = await client.memory.createRequest(sessionId, input);
```

Use `client.memoryItems` for saved Memory records. Use `client.memory` for
waitable user requests such as missing values, ask-before-use decisions,
candidate selection, reauth, and runtime value references.

## `client.memoryItems`

Use `client.memoryItems` when trusted runtime code needs to list, create, or
update saved Memory item records directly. Responses are value-free: field
records include names, useful hints, sparse `secret: true` markers, and item
`readOnly` state, not reusable raw values.

A Memory item is a user-owned reusable data record. Its `label` is the
human-readable name for the record, while `fields` hold reusable facts inside
that record. Use short stable labels that describe the group, for example
`Airline login`, `Traveler profile`, `Home shipping address`, `Wallet`, or
`Facts about user`. Use `Facts about user` only for global profile facts with no
narrower record; use narrower labels for site/account-specific logins, traveler
profiles, addresses, wallets, payment-related records, and other coherent
groups. Do not include raw values in labels.

```ts
const items = await client.memoryItems.list({ status: 'active' });

const item = items.find(
  (candidate) =>
    candidate.label === 'Facts about user' &&
    candidate.readOnly === false &&
    candidate.scope.length === 0
);

if (item) {
  await client.memoryItems.update(item.id, {
    updateMode: 'update_existing',
    fields: [
      {
        name: 'family_name',
        value: 'Ivanov',
        hint: 'Family name for identity and booking forms',
      },
    ],
  });
} else {
  await client.memoryItems.create({
    label: 'Facts about user',
    scope: [],
    askBeforeUse: true,
    fields: [
      {
        name: 'given_name',
        value: 'Dmitry',
        hint: 'Given name for identity and booking forms',
      },
      {
        name: 'full_name',
        value: 'Dmitry Ivanov',
        valueType: 'person_name',
        hint: 'Full legal name for identity and booking forms',
      },
      {
        name: 'date_of_birth',
        value: '1990-05-10',
        valueType: 'date',
        hint: 'Date of birth in YYYY-MM-DD',
      },
      {
        name: 'phone',
        value: '+14155550100',
        valueType: 'phone_number',
        hint: 'Phone number in E.164 format',
      },
    ],
  });
}
```

`create(...)` accepts simple field values and sends them as encrypted Memory
value payloads. Use `isSecret` or `secret` for passwords, API keys, tokens,
card PAN/CVV, document numbers, and values unsafe for logs. `update(...)` only
sends the fields provided by the caller; use `updateMode: 'update_existing'`
to preserve existing fields while adding or replacing named fields. A field can
be sent with only `name` and `hint` to update the hint of an existing field.

`valueType` / `value_type` is optional. When present, it enables deterministic
normalization and projection for that field during fill. Public editable value
types are:

- `date` — canonical value must be `YYYY-MM-DD`;
- `phone_number` — canonical value must be E.164, for example
  `+14155550100`;
- `person_name` — canonical value must be a non-empty full name string.

Omit `valueType` for ordinary direct fill. Public Memory item create/update
rejects internal card value types such as `payment_card_number` and
`payment_card_expiry`; provider-backed payment cards expose those only through
the session catalog after payment authorization.

## `client.memory`

```ts
const handle = await client.memory.createRequest(sessionId, {
  clientRequestId: 'request-1',
  kind: 'memory.provide_missing',
  fields: [{ key: 'email', label: 'Email', required: true, type: 'email' }],
  context: { url: 'https://example.com/login' },
});

await client.memory.submitDecision(sessionId, handle.requestId, {
  decision: 'provided',
  save: 'new',
  values: [{ fieldRef: 'profile.email', value: 'ada@example.com' }],
});

const result = await client.memory.waitForResult(sessionId, handle);
```

### `MagicPayMemoryRequestInput`

```ts
interface MagicPayMemoryRequestInput {
  clientRequestId?: string;
  kind:
    | 'memory.ask_before_use'
    | 'memory.provide_missing'
    | 'memory.runtime_value'
    | 'memory.choose_candidate'
    | 'memory.provider_reauth'
    | 'memory.provider_unavailable'
    | 'memory.stale_target';
  ttlMs?: number;
  itemRef?: string;
  handleRef?: string;
  fieldKey?: string;
  fieldName?: string;
  fieldRef?: string;
  targetRef?: string;
  fields?: MagicPayMemoryRequestedField[];
  candidates?: readonly Record<string, unknown>[];
  availability?: Record<string, unknown>;
  context?: Record<string, unknown>;
  bridge?: MagicPayBridgeContext;
  terminalOptions?: readonly string[];
}
```

### `MagicPayMemoryRequestDecisionInput`

```ts
interface MagicPayMemoryRequestDecisionInput {
  decision: 'allow' | 'deny' | 'cancel' | 'timeout' | 'provided' | 'choose_candidate';
  save?: false | 'new' | 'update_existing';
  saveAs?: Record<string, unknown>;
  targetItemId?: string;
  selectedItemRef?: string;
  values?: readonly Record<string, unknown>[];
  candidates?: readonly Record<string, unknown>[];
}
```

## `client.actions`

```ts
const handle = await client.actions.run(sessionId, {
  clientRequestId: 'confirm-1',
  capability: 'confirm',
  params: { summary: 'Confirm checkout' },
  context: { url: 'https://example.com/pay' },
});

const result = await client.actions.waitForResult(sessionId, handle);
```

`client.actions.confirm(...)` is a convenience wrapper for the common confirm
capability.

## `client.choice`

```ts
const handle = await client.choice.request(sessionId, {
  prompt: 'Choose an option',
  options: [{ id: 'a', title: 'Option A' }],
});

const result = await client.choice.waitForResult(sessionId, handle);
```

## `client.requests`

```ts
await client.requests.confirmOtp(sessionId, requestId, otp);
const result = await client.requests.waitForResult(sessionId, requestId);
```

Use this namespace for generic non-Memory request waiting and OTP confirmation.

## `client.sessions`

```ts
const created = await client.sessions.create({ type: 'payment' });
const session = await client.sessions.get(created.session.id);
const state = await client.sessions.getState(created.session.id);
await client.sessions.completeWithOutcome(created.session.id, {
  clientCompletionId: 'complete-1',
  status: 'completed',
  command: 'checkout',
  summary: 'Checkout completed',
  timestamp: new Date().toISOString(),
});
```

## Core Memory Helpers

```ts
import { fetchMemoryCatalog, materializeMemoryValues } from '@mercuryo-ai/magicpay-sdk/core';

const catalog = await fetchMemoryCatalog(gateway, sessionId, targetUrl);
const values = await materializeMemoryValues(gateway, sessionId, ['handle_email']);
```

`fetchMemoryCatalog(...)` returns value-free handles and planning metadata.
`materializeMemoryValues(...)` returns runtime-only values for explicit
handles.

Provider-backed payment cards are session-scoped. Before payment
authorization, `fetchMemoryCatalog(...)` does not return card field handles;
instead it reports a machine-readable availability entry:

```ts
catalog.unavailable.find((entry) => {
  const availability = entry.availability as Record<string, unknown> | undefined;
  return entry.category === 'payment_card' && availability?.status === 'authorization_required';
});
```

That state means the card exists, but `authorize_payment` must be approved in
the active session before the SDK can materialize provider-backed card handles.
Direct materialization or data requests for card fields before that approval
fail with `payment_card_authorization_required` /
`payment_authorization_required`.

## Memory Fill

```ts
import {
  applyFill,
  applyPlannedField,
  collectFillPlanApplyBlockers,
  fillMemoryValue,
  parseFillPlan,
  planFill,
  validateFillPlan,
} from '@mercuryo-ai/magicpay-sdk/fill-plan-apply';
```

### `fillMemoryValue(input)`

```ts
await fillMemoryValue({
  handle,
  targetRef: 'authorization-header',
  fieldName: 'authorization',
  materializeValue,
  write: async (value) => {
    request.headers.authorization = `Bearer ${value}`;
  },
});
```

Use `fillMemoryValue(...)` when trusted runtime code already knows the Memory
handle and needs to write one current-run value. The helper:

- calls `materializeValue(handle)`;
- installs an exact-value redaction profile when `installRedactionProfile` is
  supplied;
- emits value-free events when `eventSink` is supplied;
- calls your `write(value)` callback;
- returns status metadata without returning the raw value.

### `applyFill(input)`

```ts
const result = await applyFill({
  plan,
  currentTargetState,
  materializeValue,
  targetWriter,
});
```

Use `applyFill(...)` when you already have a handle-only `FillPlan`. The plan
can be authored by your runtime, parsed from JSON, or returned by
`planFill(...)`. The apply step verifies the target-set fingerprint before
materializing and writes only through the target writer supplied by your
runtime.

### `planFill(input)`

```ts
const plan = await planFill({
  sessionId,
  targetSet,
  targetMatches,
  memoryCatalog,
});
```

Use `planFill(...)` when you want the SDK to build a `FillPlan` from a
value-free catalog, target descriptors, and Memory target matches.

```ts
const validation = validateFillPlan(maybePlan);
const plan = parseFillPlan(maybePlan);
const blockers = collectFillPlanApplyBlockers(plan);
```

Use `validateFillPlan(...)` or `parseFillPlan(...)` when a plan comes from
outside TypeScript type checking. Use `collectFillPlanApplyBlockers(...)` when
you need to inspect which user requests would be needed before apply can
materialize values.

For tests or custom orchestration, `applyPlannedField(...)` applies one ready
field through the same target writer and materialization callbacks as
`applyFill(...)`.

### Example

```ts
const plan = await planFill({
  sessionId,
  targetSet,
  targetMatches,
  memoryCatalog,
});

const result = await applyFill({
  plan,
  currentTargetState,
  materializeValue,
  targetWriter,
});
```

The plan is value-free and contains handles, not raw values.
`planFill(...)` copies catalog-only provider-card availability into a
non-blocking blocker:

```ts
{
  kind: 'payment_card.authorization_required',
  category: 'payment_card',
  status: 'authorization_required',
  reason: 'payment_authorization_required',
  blocking: false,
}
```

Branch on that blocker when a payment card is needed: collect visible payment
facts, run the `authorize_payment` action flow, then fetch a fresh catalog and
plan again for the same active session.

## Result Shape

All waiters return:

```ts
type MagicPayRequestResult =
  | { ok: true; requestId: string; resolutionPath: string; artifact: MagicPayRequestArtifact }
  | { ok: false; requestId: string; reason: string; message?: string };
```

Branch on `ok` and then on `artifact.kind`.

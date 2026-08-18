# API Reference

## `createMagicPayClient(options)`

`getAuthenticatedAgent(gateway)` is the step-zero call before any client work:
it returns the authenticated agent profile or throws the request errors
documented in the [error reference](error-reference.md), which makes it the
quickest way to verify an API key.

```ts
import { createMagicPayClient } from '@nuanu-ai/magicpay-sdk';

const client = createMagicPayClient({
  gateway: {
    apiKey: '...',
    apiUrl: 'https://api.magicpay.nuanu.ai/functions/v1/api',
  },
  fetchImpl,
});
```

`fetchImpl` is optional and is useful in tests.

## Memory APIs

```ts
const items = await client.memoryItems.list({
  url: 'https://example.com/login',
  status: 'active',
});
const handle = await client.memory.createRequest(sessionId, input);
```

Use `client.memoryItems` for saved Memory records. Use `client.memory` for
waitable user requests such as missing values, ask-before-use decisions,
candidate selection, reauth, and runtime value references.

## `client.memoryItems`

Use `client.memoryItems` when trusted runtime code needs to list, get, create,
update, or delete saved Memory item records directly. Responses are value-free:
field records include `fieldRef`, human `label`, useful hints, sparse
`secret: true` markers, and item `readOnly` state, not reusable raw values or
materialization capabilities. Scoped `valueHandle` capabilities appear only
in authorized Memory catalog entries.

A Memory item is a user-owned reusable data record. Its `label` is the
human-readable name for the record, while `fields` hold reusable facts inside
that record. Use short stable labels that describe the group, for example
`Airline login`, `Traveler profile`, `Home shipping address`, `Wallet`, or
`Facts about user`. Use `Facts about user` only for global profile facts with no
narrower record; use narrower labels for site/account-specific logins, traveler
profiles, addresses, wallets, payment-related records, and other coherent
groups. Do not include raw values in labels.

```ts
const items = await client.memoryItems.list({
  url: 'https://example.com/login',
  status: 'active',
});

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
        fieldRef: 'field_family_name',
        label: 'Family name',
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
        label: 'Given name',
        value: 'Dmitry',
        hint: 'Given name for identity and booking forms',
      },
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
}
```

`get(itemId)` returns one value-free item by stable item id. `delete(itemId)`
soft-deletes one editable item.

```ts
const selected = await client.memoryItems.get('mem_profile_user');
await client.memoryItems.delete('mem_unused_profile');
```

`create(...)` accepts simple field values and sends them as Memory value
payloads. New fields use human-readable labels because they do not have
`fieldRef` yet. `update(...)` only sends the fields provided by the caller; use
`updateMode: 'update_existing'` to preserve existing fields while updating
fields by `fieldRef` or adding new fields by `label`. A field can be sent with
only `fieldRef`, `label`, and `hint` to update the label or hint of an existing
field. Existing fields are never addressed by label.

Use `isSecret` or `secret` for values that should be hidden from display and
kept out of detailed logs. This flag is mutable display/logging metadata. It is
not a value type and not an encryption mode.

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

A Memory request has two sides, and they are normally different processes: your
runtime creates the request and waits, the user's MagicPay UI answers it.

### Runtime side

```ts
const handle = await client.memory.createRequest(sessionId, {
  clientRequestId: 'request-1',
  kind: 'memory.provide_missing',
  fields: [{ key: 'email', label: 'Email', required: true, type: 'email' }],
  context: { url: 'https://example.com/login' },
});

const result = await client.memory.waitForResult(sessionId, handle);
```

### Answering side (MagicPay UI, or your test harness)

```ts
await client.memory.submitDecision(sessionId, handle.requestId, {
  decision: 'provided',
  save: 'new',
  values: [{ fieldRef: 'profile.email', value: 'ada@example.com' }],
});

const claimed = await client.memory.claim(sessionId, handle.requestId);
```

In production the answering side is the user's MagicPay UI; calling
`submitDecision(...)` or `claim(...)` from the runtime is a test-only pattern
(see [Testing](./testing.md)). `waitForResult(...)` claims the artifact itself,
so a runtime that waits never calls `claim(...)`.

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
  contentRevision?: string;
  handleRef?: string;
  fieldKey?: string;
  fieldName?: string;
  fieldRef?: string;
  targetRef?: string;
  fields?: MagicPayMemoryRequestedField[];
  candidates?: readonly Record<string, unknown>[];
  availability?: Record<string, unknown>;
  saveHint?: MagicPayMemoryRequestSaveHint;
  context?: MagicPayRequestContext & Record<string, unknown>;
  bridge?: MagicPayBridgeContext;
  terminalOptions?: readonly string[];
}
```

`fieldName` is the target-side field name and is sent as `field_name`. Use
`fieldRef` for an existing Memory field, `fieldKey` for the requested key, and
`targetRef` for the runtime target the request came from.

`MagicPayMemoryRequestSaveHint` is not re-exported from the root entrypoint;
import it from `@nuanu-ai/magicpay-sdk/client` if you need to name the type.

### `MagicPayRequestContext` and `MagicPayBridgeContext`

Both types are exported from the root entrypoint and are shared by Memory,
action, and choice request inputs.

```ts
interface MagicPayRequestContext {
  url?: string;
  pageTitle?: string;
  formPurpose?: string;
  merchantName?: string;
}

interface MagicPayBridgeContext {
  pageRef?: string;
  fillRef?: string;
  scopeRef?: string;
  surfaceRef?: string;
}
```

Only `url`, `pageTitle`, `merchantName`, and `formPurpose` are transmitted from
`context`. The `& Record<string, unknown>` intersection makes the type accept
extra keys, but both the SDK and the API silently drop them.

### `MagicPayMemoryRequestDecisionInput`

```ts
interface MagicPayMemoryRequestDecisionInput {
  decision: 'allow' | 'deny' | 'cancel' | 'timeout' | 'provided' | 'choose_candidate';
  save?: false | 'new' | 'update_existing';
  saveAs?: Record<string, unknown>;
  targetItemId?: string;
  selectedItemRef?: string;
  values?: readonly Record<string, unknown>[] | Record<string, unknown>;
  candidates?: readonly Record<string, unknown>[];
}
```

camelCase is the canonical spelling for every request input. The snake_case
wire spelling of the same field — `selected_item_ref` for `selectedItemRef`,
`save_as` for `saveAs`, `display_name` for `displayName` — stays accepted for
compatibility, and `saveAs` also accepts `label` for the display name. When a
field arrives in more than one spelling the canonical camelCase one wins, and
the SDK always transmits the snake_case form the API expects.

## Waiting for results

Every waiter — `client.memory.waitForResult(...)`,
`client.actions.waitForResult(...)`, `client.choice.waitForResult(...)`, and
`client.requests.waitForResult(...)` — polls the API until the request reaches a
terminal state, and takes an optional `MagicPayWaitForResultOptions`:

```ts
const result = await client.memory.waitForResult(sessionId, handle, {
  timeoutMs: 15 * 60_000,
  intervalMs: 2_000,
  signal: controller.signal,
  onStatusChange: (status) => console.log(`request is now ${status}`),
});
```

| Field              | Default               | Meaning                                                                                                                                          |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `timeoutMs`        | `300000` (5 minutes)  | Budget for the whole wait; when it elapses the waiter returns `{ ok: false, reason: 'timeout' }`.                                                 |
| `attemptTimeoutMs` | `30000` (30 seconds)  | Budget for one HTTP call. A call that stops answering is dropped and tried again, and never outlives the remaining wait budget.                   |
| `intervalMs`       | `3000`                | Delay between polls, and between retries of a failed API call.                                                                                    |
| `signal`           | none                  | Aborting rejects the promise instead of returning a result; detect it with `isMagicPayAbortError(error)`.                                         |
| `onStatusChange`   | none                  | Called on each observed status change. `approved` and `executing` mean the user already approved and MagicPay is finalizing — still non-terminal. |

The `timeoutMs` default is exported from the root entrypoint as
`MAGICPAY_DEFAULT_REQUEST_WAIT_TIMEOUT_MS`, and the `intervalMs` default as
`DEFAULT_REQUEST_POLL_INTERVAL_MS`. Because a human answers, waiting can
legitimately take minutes: a `timeout` result is local and not terminal, so
persist `result.requestId` and resume waiting from any process. See
[Error Reference](./error-reference.md).

The two budgets are independent clocks. A call that never reaches MagicPay — a
DNS failure, a reset connection, a request that stops answering — is retried on
the same interval until the wait budget runs out, so one brief network problem
does not end a wait that a person is still answering. HTTP error responses are
not retried that way: only `408`, `429`, and `5xx` are treated as temporary.
Aborting your `signal` stops the wait immediately in every case.

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
capability: it creates the request with `capability: 'confirm'` and waits for
the result, so it returns a `MagicPayRequestResult` instead of a handle.

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
For a provider-card authorization, `confirmOtp(...)` returns a request handle
with optional `reservationExpiresAt`, and the successful `waitForResult(...)`
result preserves that same safe expiry. The reservation expiry is separate
from the request deadline.

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
import { fetchMemoryCatalog, materializeMemoryValues } from '@nuanu-ai/magicpay-sdk/core';

const catalog = await fetchMemoryCatalog(gateway, sessionId, targetUrl);
const values = await materializeMemoryValues(gateway, sessionId, ['handle_email']);
```

`fetchMemoryCatalog(...)` returns value-free handles and planning metadata.
`materializeMemoryValues(...)` returns runtime-only values for explicit
handles.

Provider-card logical `fieldRef` values are stable across item and catalog
reads. Public item projections expose no `valueHandle`; authorized catalog
entries carry separate session/reservation-scoped `valueHandle.ref`
capabilities. A stable field ref is not materializable by itself. Ready pool
handles expose safe `reservationExpiresAt` metadata, and
`catalog.availability.payment_card_pool` carries the wire
`reservation_expires_at` value.

Provider-backed payment cards are session-scoped. Before payment
authorization, `fetchMemoryCatalog(...)` does not return card field handles;
instead it reports a machine-readable availability entry:

```ts
catalog.unavailable.find((entry) => {
  const availability = entry.availability as Record<string, unknown> | undefined;
  return entry.category === 'payment_card' && availability?.status === 'authorization_required';
});
```

That state means the card exists, but `authorize_payment` must be approved and
fully finalized in the active session before the SDK can materialize
provider-backed card handles.
Direct materialization or data requests for card fields before that approval
fail with `payment_card_authorization_required` /
`payment_authorization_required`.

After approval, an unusable pool reservation is reported as
`provider_needs_reauth` with an exact reason (`expired`, `inactive`, or
`not_found`). Materialization scope failures use `wrong_session` or
`wrong_reservation`. These are structured `reason` values; do not parse error
messages. A new authorization is explicit—MagicPay does not silently renew or
reuse an expired reservation.

## Memory Fill

```ts
import {
  applyFill,
  applyPlannedField,
  collectApplyMaterializationHandles,
  collectFillPlanApplyBlockers,
  fillMemoryValue,
  parseFillPlan,
  planFill,
  validateFillPlan,
} from '@nuanu-ai/magicpay-sdk/fill-plan-apply';
```

### `fillMemoryValue(input)`

```ts
await fillMemoryValue({
  handle,
  targetRef: 'authorization-header',
  fieldLabel: 'Authorization header',
  materializeValue,
  write: async (value) => {
    const expected = `Bearer ${value}`;
    request.headers.authorization = expected;
    return request.headers.authorization === expected
      ? { status: 'filled', verification: { verified: true, strategy: 'exact' } }
      : { status: 'blocked', reason: 'postcondition_mismatch' };
  },
});
```

Use `fillMemoryValue(...)` when trusted runtime code already knows the Memory
handle and needs to write one current-run value. The helper:

- calls `materializeValue(handle)`;
- installs an exact-value redaction profile when `installRedactionProfile` is
  supplied;
- emits value-free events when `eventSink` is supplied;
- calls your `write(value)` callback, which must re-read the destination and
  return value-free verification;
- returns status metadata without returning the raw value.

Void or unverified writer results fail closed as
`postcondition_unverifiable` and are not recorded as complete.
For resumable browser fills, a verified writer should also return per-write
`scope` (`pageRef`, `documentRef`, and screened origin+pathname `pageUrl`). The
scope is captured after that specific write; the final page state is never
retroactively assigned to earlier completions.

### `collectApplyMaterializationHandles(input)`

Use this value-free preflight when a runtime batches backend materialization
before calling `applyFill(...)`. It accepts the plan, current target state,
decision, and any delegated-target capability from the corresponding apply
request. The returned, deduplicated handle list follows the same deterministic
owner, stale-target, typed-group, target-shape, and field-order gates as the
initial apply pass. It does not materialize values.

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

Writer inputs default to `valueAdaptation: 'exact'`. A runtime must write that
value as supplied: it must not normalize, remap, or send it to an assistive
model. `valueAdaptation: 'assistive'` is an explicit opt-in reserved for a
runtime that has independently established an open-value policy; typed and
provider-managed projection remains exact.

An allow/confirmed `memory.ask_before_use` decision may carry the value-free
`askBeforeUseScope` copied from its blocker/request. The SDK releases only that
exact item+subject or field group. Unscoped allow decisions fail closed.

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
const blockers = collectFillPlanApplyBlockers({ plan });
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

```ts no-verify
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
type MagicPayResolutionPath = 'auto' | 'confirm' | 'provide';

type MagicPayRequestFailureReason = 'denied' | 'expired' | 'failed' | 'canceled' | 'timeout';

type MagicPayRequestResult =
  | {
      ok: true;
      requestId: string;
      resolutionPath: MagicPayResolutionPath;
      itemRef?: string;
      reservationExpiresAt?: string;
      artifact: MagicPayRequestArtifact;
    }
  | {
      ok: false;
      requestId: string;
      reason: MagicPayRequestFailureReason;
      message?: string;
      reasonCode?: string;
      lastObservedStatus?: string;
    };
```

Branch on `ok` and then on `artifact.kind`, which is one of `values`,
`signature`, `reference`, `confirmation`, or `choice`. `itemRef` is present when
the request resolved against a specific Memory item.
Successful provider-card request results preserve the optional safe
`reservationExpiresAt` exposed by the request handle.

On failure, `lastObservedStatus` carries the last non-terminal status seen while
polling. `approved` and `executing` there mean the user already approved and
MagicPay was still finalizing when the local waiter gave up. `reasonCode` is
present with `reason: 'canceled'` and carries the machine-readable stop reason
MagicPay reported, such as `user_canceled`; branch on it instead of `message`.

See [Error Reference](./error-reference.md) for what each failure `reason` means
and for the error classes the SDK throws instead of returning a result.

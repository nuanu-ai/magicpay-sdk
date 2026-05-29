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
const facts = await client.memory.createRequest(...);
const updated = await client.memory.createRequest(...);
```

`saveFacts(...)` writes reusable Memory. It is intentionally separate
from Memory request handling.

## `client.memoryItems`

Use `client.memoryItems` when trusted runtime code needs to list, create, or
update saved Memory item records directly. Responses are value-free: field
records include handles and metadata, not reusable raw values.

```ts
const items = await client.memoryItems.list({ kind: 'profile', status: 'active' });

const item = items.find(
  (candidate) =>
    candidate.kind === 'profile' &&
    candidate.label === 'Facts about user' &&
    candidate.scope.length === 0
);

if (item) {
  await client.memoryItems.update(item.id, {
    updateMode: 'update_existing',
    fields: [{ name: 'family_name', value: 'Ivanov' }],
  });
} else {
  await client.memoryItems.create({
    label: 'Facts about user',
    kind: 'profile',
    schemaRef: 'memory.profile',
    scope: [],
    fields: [{ name: 'given_name', value: 'Dmitry' }],
  });
}
```

`create(...)` accepts simple field values and sends them as encrypted Memory
value payloads. `update(...)` only sends the fields provided by the caller;
use `updateMode: 'update_existing'` to preserve existing fields while adding
or replacing named fields.

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

const catalog = await fetchMemoryCatalog(gateway, sessionId, pageUrl);
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

## Fill Plan / Apply

```ts
import { applyFill, planFill } from '@mercuryo-ai/magicpay-sdk/fill-plan-apply';

const plan = await planFill({
  sessionId,
  page,
  targetMatches,
  memoryCatalog,
});

const result = await applyFill({
  plan,
  currentPageState,
  materializeValue,
  browserWriter,
});
```

The plan is value-free. The apply step verifies the page fingerprint before
materializing and writes only through the browser writer supplied by your
runtime.
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

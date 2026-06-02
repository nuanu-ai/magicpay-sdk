# Glossary

## session

A workflow container for requests, runtime telemetry, and completion state.

## request

A waitable task inside a session. Current public request families are Memory,
action, choice, and generic request waiting for non-Memory action flows.

## Memory

The user data model used for reusable and current-run values. Runtime code sees
catalog handles and request references first; current-run values are
materialized only when apply logic needs them.

## Memory catalog

The value-free handle catalog returned by `fetchMemoryCatalog(...)` for a
session and target URL.

## Memory request

A user-facing Memory decision or value request created through
`client.memory.createRequest(...)`.

## Memory handle

An opaque reference to a value that may be materialized for the current run.

## Memory value type

An optional public field type on saved Memory items. Public editable value
types are `date`, `phone_number`, and `person_name`. When absent, the field is
filled directly and is not split or normalized by projection logic.

## Memory availability

A machine-readable catalog state for data that exists but cannot be returned
as ready handles. Provider-backed payment cards use
`authorization_required` until payment authorization succeeds for the active
session.

## payment-card authorization required

The state represented by `payment_card.authorization_required` in fill-plan
blockers and by `payment_authorization_required` in backend availability
reasons. It means a provider-backed card exists, but card field handles remain
hidden until the active session has an approved `authorize_payment` request.

## Memory field

Reusable saved Memory data. Public list/read responses expose field metadata
and value handles, not reusable raw values.

## action request

A user-confirmed operation created through `client.actions.run(...)`.

## choice request

A user choice over runtime-provided options.

## request handle

The `requestId`, `sessionId`, status, and resolution path returned when a
request is created.

## artifact

The result claimed from a completed request. Memory waiters return reference
artifacts; action and choice waiters return their own typed artifacts.

## clientRequestId

An idempotency key supplied by the caller. Reuse it for retries of the same
logical request.

## target

A runtime-defined destination for a Memory value. A target can be an API
header, a provider SDK input, a browser field, or another trusted write owned
by the caller.

## target-set fingerprint

A runtime fingerprint used by `applyFill(...)` to avoid writing values into a
stale target state.

## target writer

The caller-owned adapter passed to `applyFill(...)`. It receives
`targetRef`, optional `fieldName`, and the current-run value, writes to the
actual runtime target, and returns fill status.

# Security Model

MagicPay separates planning metadata from runtime-only values.

For one known handle, the intended flow is:

1. trusted runtime code calls `fillMemoryValue(...)`;
2. the SDK calls your `materializeValue(handle)` callback;
3. the SDK installs redaction metadata when requested;
4. the SDK calls your `write(value)` callback;
5. the helper returns status metadata without returning the raw value.

For planned fill, the intended flow is:

1. the runtime describes the current targets;
2. the runtime fetches a value-free Memory catalog;
3. planning uses handles, field refs, labels, and policy metadata;
4. apply verifies the current target state;
5. only the explicit handles needed for the current run are materialized;
6. values are written through the target writer owned by the trusted runtime.

## What The SDK Helps With

- Keeps reusable Memory values out of planning inputs.
- Gives the runtime handle-based catalogs and request references.
- Keeps optional Memory value types as public metadata only; `date`,
  `phone_number`, and `person_name` enable deterministic projection without
  exposing values during planning.
- Preserves provider-backed payment-card existence as machine-readable
  availability state until payment authorization reveals card handles for the
  active session.
- Requires an explicit materialization call for current-run values.
- Keeps field fill and final commitment as separate operations.
- Keeps `fillMemoryValue(...)` and `applyFill(...)` result objects value-free.
- Lets tests replace transport through `fetchImpl`.

## What The SDK Does Not Own

- Browser process isolation.
- Host application logging.
- UI access control.
- Provider API behavior.
- Storage and retention policy outside MagicPay.
- Safety of values the user types into unrelated chats or prompts.

## Runtime Rules

- Do not log materialized values.
- Do not send materialized values into model prompts.
- Do not put materialized values into plan objects, result objects, events, or
  error messages.
- Do not reuse current-run values outside the operation that requested them.
- Do not route around `payment_card.authorization_required` by asking for or
  logging raw card values. Use the payment authorization flow and re-plan.
- Do not set internal card value types through public Memory CRUD. Public
  Memory item fields may be typed only as `date`, `phone_number`, or
  `person_name`; save other fields untyped unless the public API documents a
  new value type.
- Re-observe and re-plan when `applyFill(...)` returns `needs_replan`.
- Keep final submit, purchase, booking, signing, or payment actions behind a
  separate action request.

## Trust Boundary

Use the SDK from trusted backend, worker, or controlled runtime code. Do not
ship the MagicPay API key to an untrusted browser. Treat `fetchImpl`, target
writers, provider adapters, browser adapters, and application logs as part of
your own trust boundary.

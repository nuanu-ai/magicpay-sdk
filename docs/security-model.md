# Security Model

MagicPay separates planning metadata from runtime-only values.

The intended flow is:

1. the runtime observes page targets;
2. the runtime fetches a value-free Memory catalog;
3. planning uses handles, field refs, labels, and policy metadata;
4. apply verifies the current page state;
5. only the explicit handles needed for the current run are materialized;
6. values are written through the browser or provider adapter owned by the
   trusted runtime.

## What The SDK Helps With

- Keeps reusable Memory values out of planning inputs.
- Gives the runtime handle-based catalogs and request references.
- Preserves provider-backed payment-card existence as machine-readable
  availability state until payment authorization reveals card handles for the
  active session.
- Requires an explicit materialization call for current-run values.
- Keeps field fill and final commitment as separate operations.
- Lets tests replace transport through `fetchImpl`.

## What The SDK Does Not Own

- Browser process isolation.
- Host application logging.
- UI access control.
- Provider API behavior.
- Storage and retention policy outside MagicPay.
- Safety of values the user types into unrelated chat or prompt surfaces.

## Runtime Rules

- Do not log materialized values.
- Do not send materialized values into model prompts.
- Do not reuse current-run values outside the operation that requested them.
- Do not route around `payment_card.authorization_required` by asking for or
  logging raw card values. Use the payment authorization flow and re-plan.
- Re-observe and re-plan when `applyFill(...)` returns `needs_replan`.
- Keep final submit, purchase, booking, signing, or payment actions behind a
  separate action request.

## Trust Boundary

Use the SDK from trusted backend, worker, or controlled runtime code. Do not
ship the MagicPay API key to an untrusted browser. Treat `fetchImpl`, browser
writers, provider adapters, and application logs as part of your own trust
boundary.

# Integration Modes

## Root Client

Use `@nuanu-ai/magicpay-sdk` when you want the complete networked client:

- workflow sessions;
- Memory;
- Memory requests;
- action requests;
- choice requests;
- generic non-Memory request waiting.

This is the normal integration mode for backends, workers, MCP tools, and
agent runtimes.

## Core Helpers

Use `@nuanu-ai/magicpay-sdk/core` when you need lower-level helpers:

- `fetchMemoryCatalog(gateway, sessionId, url, options?)`;
- `materializeMemoryValues(gateway, sessionId, handles, options?)`;
- session and request state helpers.

The Memory catalog contains handles and planning metadata. It does not carry
raw reusable values.
For provider-backed payment cards, the catalog may include
`unavailable[].availability.status === 'authorization_required'`. That means
the card exists, but card handles are hidden until the `authorize_payment`
action is approved for the active session.

## Fill Plan / Apply

Use `@nuanu-ai/magicpay-sdk/fill-plan-apply` when trusted runtime code needs
to write Memory values into a target. Targets are runtime-defined: an API
header, a provider SDK parameter, a browser field, or another controlled write.

The API has three levels:

1. `fillMemoryValue(...)` fills one known handle through one `write(value)`
   callback;
2. `applyFill(...)` applies an existing handle-only `FillPlan` through a target
   writer;
3. `planFill(...)` builds that plan from target descriptors, Memory target
   matches, and the value-free Memory catalog.

For a browser integration, the surrounding runtime observes browser fields,
matches them to Memory field refs, and supplies a `TargetValueWriter`. For an
API integration, the runtime can supply a writer that assigns request headers
or provider SDK parameters.

`applyFill(...)` may return `waiting_for_user`, `needs_replan`, `blocked`,
`partial`, `no_progress`, or `filled`. Treat those statuses as fill state, not
as final-submit permission.
`planFill(...)` may also add a non-blocking
`payment_card.authorization_required` blocker when the catalog has the
authorization-required card state. Authorize the payment, then fetch the
catalog and plan again.

## MagicSearch

Use `@nuanu-ai/magicpay-sdk/magicsearch` for provider discovery and fallback
URL lookup.

## What Is Not In The SDK

The SDK does not own browser automation, UI rendering, provider execution,
application logging, or final business commits. Keep those responsibilities in
the surrounding runtime.

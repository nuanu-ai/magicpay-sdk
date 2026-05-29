# Integration Modes

## Root Client

Use `@mercuryo-ai/magicpay-sdk` when you want the complete networked client:

- workflow sessions;
- Memory;
- Memory requests;
- action requests;
- choice requests;
- generic non-Memory request waiting.

This is the normal integration mode for backends, workers, MCP tools, and
agent runtimes.

## Core Helpers

Use `@mercuryo-ai/magicpay-sdk/core` when you need lower-level helpers:

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

Use `@mercuryo-ai/magicpay-sdk/fill-plan-apply` when a browser runtime already
has page targets and Memory target matches.

The expected shape is:

1. observe the page in your browser runtime;
2. match observed targets to Memory field refs;
3. call `planFill(...)` with targets, matches, and the Memory catalog;
4. call `applyFill(...)` with a current page fingerprint, a materializer, and a
   browser writer.

`applyFill(...)` may return `waiting_for_user`, `needs_replan`, `blocked`,
`partial`, `no_progress`, or `filled`. Treat those statuses as orchestration
state, not as browser-submit permission.
`planFill(...)` may also add a non-blocking
`payment_card.authorization_required` blocker when the catalog has the
authorization-required card state. Authorize the payment, then fetch the
catalog and plan again.

## MagicSearch

Use `@mercuryo-ai/magicpay-sdk/magicsearch` for provider discovery and fallback
URL lookup.

## What Is Not In The SDK

The SDK does not own browser automation, UI rendering, provider execution, or
final business commits. Keep those responsibilities in the surrounding runtime.

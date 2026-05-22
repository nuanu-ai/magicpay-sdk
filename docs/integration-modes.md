# Integration Modes

## Short Answer

**Use `@mercuryo-ai/magicpay-sdk` and stop reading.** 90% of integrations
go through the root package. The subpaths exist for specialised use cases;
if you are not sure whether yours qualifies, it does not.

## Why Three Entrypoints

MagicPay SDK has one primary entry and two optional subpaths.

The standard flow is:

- `profile.facts()` for open reusable data;
- `profile.saveFacts(...)` for explicit chat-provided open facts the user
  chooses to save;
- `data.resolve(...)` plus `data.waitForResult(...)` for protected or
  mixed-value field resolution;
- `actions.run(...)` plus `actions.waitForResult(...)` for protected actions.

The optional subpaths cover specialized integrations that want pure helpers
or the MagicBrowse bridge.

## At A Glance

| If you start from | Import | Why |
| --- | --- | --- |
| A known runtime task and explicit request context | `@mercuryo-ai/magicpay-sdk` | Main client for sessions, profile facts, data resolution, and actions |
| Pure request and session state logic | `@mercuryo-ai/magicpay-sdk/core` | Pure helpers without the networked root client |
| Observed protected forms from MagicBrowse | `@mercuryo-ai/magicpay-sdk/magicbrowse` | Optional bridge from observed forms to MagicPay request input and protected browser fill |

## Root SDK

Use only `@mercuryo-ai/magicpay-sdk` when your runtime already knows:

- the current page or task context;
- how to continue after MagicPay returns resolved values or an action result;
- how to own the surrounding browser or provider orchestration.

This is the normal choice for:

- backend workers;
- custom browser runtimes;
- API-only flows;
- agent systems that already own orchestration outside the SDK.

In this mode you let the SDK hide:

1. request creation;
2. waiting and retry logic;
3. result retrieval;
4. session stop handling.

## Pure Helpers

Use `@mercuryo-ai/magicpay-sdk/core` when you already own the HTTP layer but
still want MagicPay's request and session logic:

- request-state classifiers;
- session-state builders;
- host and bridge helpers.

This subpath is useful when the root client would add too much abstraction for
your stack.

## Optional MagicBrowse Bridge

Use `@mercuryo-ai/magicpay-sdk/magicbrowse` when your runtime uses
`@mercuryo-ai/magicbrowse` and starts from observed browser forms.

The bridge is a set of composable helpers around MagicBrowse's protected field
semantics, `match(...)`, and `fillProtectedGroup(...)`. Each helper is a pure
function you call yourself; there is no registered runtime and no one-shot
"do everything" entry on the public subpath.

The helpers cover:

- enriching observed forms with host-specific candidate inventory
  (`enrichObservedFormsForUrl`, `enrichObservedFormsWithCandidateItems`);
- building grouped match candidates that `match(form, { from })` accepts
  directly (`buildObservedFormMatchCandidates`);
- building `data.resolve(...)` input from an observed form
  (`buildResolveInput`);
- converting a values artifact into protected-fill input
  (`prepareProtectedFill`) — "protected" here means the values flow
  into the browser without passing through the LLM prompt, **not**
  that an untrusted runtime is made safe or that user-pasted chat secrets can
  be protected retroactively; see
  [Security Model](./security-model.md) for the explicit boundary;
- matching observed open-data targets against a session-local snapshot
  (`listObservedOpenDataEligibleTargetRefs`,
  `resolveObservedOpenDataTargets`). These helpers require an injected
  MagicBrowse semantic matcher model backed by gateway `xfast`; your browser
  runtime still owns the actual fill step.

The happy-path composes like this:

```
observe  →  buildObservedFormMatchCandidates  →  match
                                                   │
                                                   ▼
                                       resolve (your MagicPay resolver,
                                       using buildResolveInput internally
                                       plus client.data.resolve / waitForResult)
                                                   │
                                                 ▼
                                                fill (with
                                                fillProtectedGroup and an
                                                artifactReader that exposes
                                                only the approved request)
```

See [API Reference](./api-reference.md#mercuryo-aimagicpay-sdkmagicbrowse)
for the full helper list, types, and a copy-paste ready composing
example.

### Why composable instead of one-shot

Composable helpers give integrators control over how requests are
created, how `client.data.waitForResult(...)` is structured (single
process, sharded, background polling), and which approval UI is shown.
A one-shot «resolve and fill this form» entry would force all of those
decisions into one signature and bake CLI-shaped dependencies into the
public API.

A shared runtime that does make those decisions still exists under
`@mercuryo-ai/magicpay-sdk/internal/magicbrowse-runtime`; it is what
`magicpay-cli` consumes. This internal path is not part of the stable consumer
API — the `/internal/` segment is the signal. External
consumers assemble their own version from the
listed public helpers instead.

## What Stays Outside The SDK

MagicPay SDK does not own:

- human approval UX;
- browser-session lifecycle;
- page observation;
- navigation and reaching the target page;
- final business logic after a successful result.

Those remain in your application or in the runtime you already use.

Any agentic browser stack works on that side (for example
[Browser Use](https://github.com/browser-use/browser-use),
[Magnitude](https://github.com/magnitudedev/browser-agent), or your own
setup). MagicBrowse is the first-party browser runtime for the bridge helpers.
Failures that happen before the browser reaches the protected form are a
browser-layer concern, not a MagicPay one.

## Next Steps

- For the first root-client integration, use
  [Getting Started](./getting-started.md).
- For the optional MagicBrowse path, open
  [`examples/magicbrowse-bridge.ts`](../examples/magicbrowse-bridge.ts).
- For non-protected browser fields, open
  [Open Data Matching](./open-data.md) and
  [`examples/open-data-magicbrowse.ts`](../examples/open-data-magicbrowse.ts).
- For lookup details, use [API Reference](./api-reference.md).

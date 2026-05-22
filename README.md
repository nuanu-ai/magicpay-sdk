# @mercuryo-ai/magicpay-sdk

[![npm version](https://img.shields.io/npm/v/@mercuryo-ai/magicpay-sdk)](https://www.npmjs.com/package/@mercuryo-ai/magicpay-sdk) [![License](https://img.shields.io/badge/license-proprietary-red.svg)](LICENSE.md) [![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

TypeScript SDK for MagicPay: a user-approved **vault** for logins, identity,
payment cards, and wallets, plus a **request flow** your code uses to read
values from that vault and run protected actions — without the actual
values ever entering the LLM prompt that orchestrates the work.

The main client methods are `profile.facts()`, `profile.saveFacts(...)`,
`data.resolve(...)` / `data.waitForResult(...)`,
`actions.run(...)` / `actions.waitForResult(...)`, and
`choice.request(...)` / `choice.waitForResult(...)`. The generic
`requests.waitForResult(...)` waits on any request handle, and
`requests.confirmOtp(...)` can confirm an eligible pending approval when the
user chooses the OTP channel.

Use it when your application, worker, agent runtime, or MCP tool needs to:

- read the user's public profile data (name, email) without requiring approval;
- resolve login, identity, wallet, or payment-card values stored in the
  user's MagicPay vault through one request flow;
- run protected actions such as confirmation or provider-backed execution;
- ask the user to choose from runtime-provided options and resume with the
  selected option;
- wait for a request to complete without writing your own polling logic;
- keep request inputs, session helpers, and bridge metadata inside one typed client.

The SDK handles communication with the MagicPay service. Browser control,
approval UX, and the business step that follows a returned value or action
result stay in your application.

See [Security Model](./docs/security-model.md) for an explicit list of what
this design protects against and what it does **not** protect against —
the word "protected" here means "kept out of the LLM's input", not "safe in
an untrusted runtime". Read it before you assume otherwise.

## Key Terms

The examples below use a few names that recur across the API:

- `session` — a workflow session you create to group related requests.
- `request` — a single task inside a session: either resolving data or
  running a protected action.
- `requestId` / request handle — returned from `data.resolve(...)` or
  `actions.run(...)`; passed into `waitForResult(...)` to wait for the
  outcome.
- `artifact` — the one-time result of a completed request (the actual
  values, or the action outcome). Readable once, for security.
- `clientRequestId` — a stable id you choose, so retries stay idempotent.
- `profile fact` — reusable public user data (name, email, locale) that
  MagicPay can return immediately without approval.

## What MagicPay Can Store And Fill

MagicPay holds user-approved vault items in four fixed categories. Each
category uses one of five built-in schemas (schemas are defined on the
server — you do not register new ones from the SDK):

| `category` | `schemaRef` | Canonical `fieldKey` values you can request |
| --- | --- | --- |
| `login` | `login.basic` | `username`, `password` |
| `identity` | `identity.basic` | `full_name`, `date_of_birth`, `email`, `phone`, `address_line1`, `address_line2`, `city`, `state_region`, `postal_code`, `country`, `nationality` |
| `identity` | `identity.document` | `document_number`, `issuing_country`, `issue_date`, `expiry_date` |
| `payment_card` | `payment_card.provider` | `cardholder`, `pan`, `exp_month`, `exp_year`, `cvv` |
| `wallet` | `wallet.default` | `address`, `chain` |

Your `data.resolve(...)` call lists the `fieldKey` values you want and
(optionally) a `saveHint` so a new approval is filed into the right
category/schema. MagicPay matches the request against the user's stored
items, asks them to approve or provide missing values, and returns the
resolved set.

To inspect what a given user has already stored for a host at runtime —
before or instead of guessing a `saveHint` — call `fetchVaultCatalog(...)`
(exported from `@mercuryo-ai/magicpay-sdk/core`). It returns applicable
items with their `itemRef`, `category`, `schemaRef`, `fieldKeys`,
`capabilities`, and applicability metadata. See
[API Reference — Vault Catalog](./docs/api-reference.md#vault-catalog) for
the signature.

> Field keys above are **what MagicPay can resolve**. The browser-side
> contract — which of those keys a live form actually accepts — comes from
> MagicBrowse protected form descriptors. When you use the optional MagicBrowse bridge,
> the keys line up automatically.

## When To Use It

This package is the right entry point when:

- you run trusted Node or TypeScript code;
- you already own the surrounding browser or API orchestration;
- you want one typed runtime client instead of assembling raw HTTP requests.

Typical integrations:

- backend services and workers;
- MCP tools and agent backends;
- browser runtimes that already know the current page or form context;
- provider-specific flows that need request results without exposing protected values to the model.

## Install

```bash
npm i @mercuryo-ai/magicpay-sdk
```

Create your API key at
[`agents.mercuryo.io/signup`](https://agents.mercuryo.io/signup).

MagicPay API base URL:

```text
https://agents-api.mercuryo.io/functions/v1/api
```

## Choose An Entrypoint

Most integrations use the root package only.

| Entrypoint | Use it when |
| --- | --- |
| `@mercuryo-ai/magicpay-sdk` | You want the standard SDK with all features: session helpers, profile data, data resolution, and action execution. |
| `@mercuryo-ai/magicpay-sdk/core` | You want lower-level pure helpers for request/session state without the networked root client. |
| `@mercuryo-ai/magicpay-sdk/magicbrowse` | You use `@mercuryo-ai/magicbrowse` and want the optional bridge from observed forms into MagicPay request input and protected browser fill. |

Any agentic browser stack works on the browser side (for example
[Browser Use](https://github.com/browser-use/browser-use),
[Magnitude](https://github.com/magnitudedev/browser-agent), or your own
setup). If you do not already have one and want the observed-forms
bridge helpers, use MagicBrowse:

```bash
npm i @mercuryo-ai/magicpay-sdk @mercuryo-ai/magicbrowse
```

## Quick Start

The minimum happy path: create a client, open a session, resolve one set of
protected values.

```ts
import { createMagicPayClient } from '@mercuryo-ai/magicpay-sdk';

const client = createMagicPayClient({
  gateway: {
    apiKey: process.env.MAGICPAY_API_KEY!,
    apiUrl: 'https://agents-api.mercuryo.io/functions/v1/api',
  },
});

const { session } = await client.sessions.create({
  type: 'payment',
  description: 'Pay for SF→NYC ticket',
  merchantName: 'Airline Example',
});

const handle = await client.data.resolve(session.id, {
  clientRequestId: 'airline-checkout-1',
  fields: [
    { key: 'cardholder' },
    { key: 'pan' },
    { key: 'exp_month' },
    { key: 'exp_year' },
    { key: 'cvv' },
  ],
  context: {
    url: 'https://airline.example.com/checkout',
    formPurpose: 'payment_card',
  },
});

const result = await client.data.waitForResult(session.id, handle);

if (!result.ok) throw new Error(result.reason);
if (result.artifact.kind !== 'values') {
  throw new Error(`Unexpected artifact kind: ${result.artifact.kind}`);
}

await yourRuntime.fillPaymentCard(result.artifact.values);
```

Treat `result.artifact.values` as short-lived handoff material. Forward it
directly to the trusted browser or provider boundary you own; do not log it,
print it, or put it back into an LLM prompt.

MagicPay keeps protected values out of model context only when the user and
runtime choose the MagicPay request path. If a user voluntarily types a secret
into chat, that value is already model-visible; MagicPay cannot make that
chat-provided secret protected retroactively.

`session.type` is the billing classification of the workflow
(`payment` / `subscription` / `cancellation`); the field-level schema
(`login.basic`, `identity.basic`, `payment_card.provider`, …) is
independent and chosen per `data.resolve(...)` call via `fields[].key`
and an optional `saveHint`.

The flow is always the same shape:

1. create (or reuse) a session;
2. call `profile.facts()` when open reusable data is enough,
   `profile.saveFacts(...)` when the user explicitly wants to save reusable
   open facts from chat, or
   `data.resolve(...)` → `data.waitForResult(...)` for protected field
   values, or `actions.run(...)` → `actions.waitForResult(...)` for protected
   actions, or `choice.request(...)` → `choice.waitForResult(...)` when the
   user must choose from options your runtime found;
3. pass the returned values or action result into your own runtime step.

### When `profile.facts()` Is Not Enough

Use `profile.facts()` as the broad open-data read model when your runtime
needs reusable public facts such as name, email, or locale.

When your runtime is already driving a browser and has observed field refs on
the current page, deciding which public value fits which observed input is a
different problem: per-target matching on a live page. That decision belongs
to the browser-runtime layer above this SDK and should produce one terminal
outcome per target — `matched`, `ambiguous`, or `no_match` — by combining
facts and page context. Do not reconstruct that decision from raw
`profile.facts()` output in your own prompt or code.

For MagicBrowse runtimes, use the open-data helpers documented in
[Open Data Matching](./docs/open-data.md) and shown in
[`examples/open-data-magicbrowse.ts`](./examples/open-data-magicbrowse.ts).

### Why two calls (`resolve` + `waitForResult`)?

Creating the request and waiting for its result are separate calls on
purpose. `resolve(...)` returns a `requestId` immediately; the actual
wait can happen in the same process, in another process, or after a
reconnect. This matters when:

- your runtime runs in a short-lived function and must persist the
  `requestId` before the user approves;
- you want to show "waiting for approval" UI and only start polling
  later;
- you need idempotent retries — passing the same `clientRequestId`
  returns the same `requestId` instead of creating a duplicate.

If you just want the result in one shot, chain the two calls:

```ts
const handle = await client.data.resolve(sessionId, input);
const result = await client.data.waitForResult(sessionId, handle);
```

### Optional OTP Approval

Eligible pending confirmation requests may also be approved by OTP. OTP is
not mandatory and does not replace MagicPay web or mobile approval. Keep the
same request handle, let the user choose either channel, then resume through
the generic waiter:

```ts
const handle = await client.actions.run(session.id, {
  capability: 'confirm',
  params: { summary: 'Approve checkout' },
});

// Only call this after the request exists and the user provides the OTP.
await client.requests.confirmOtp(session.id, handle.requestId, otpFromUser);

const result = await client.requests.waitForResult(session.id, handle);
```

Do not log, store, or echo the OTP. If the user approves in MagicPay web or
mobile instead, skip `confirmOtp(...)` and call
`client.requests.waitForResult(...)` on the same handle.

### What does a successful result look like?

`waitForResult(...)` returns `{ ok: true, artifact }` where `artifact.kind`
is one of:

- `values` — a field map like `{ username, password }` or
  `{ card_number, exp_month, exp_year, cvv }`. Most data-request results.
- `signature` — a `{ signature, signer }` pair, for requests asking the
  user to sign something.
- `reference` — an opaque `{ reference, metadata? }` pointing at an
  external resource (e.g. a provider-specific transaction id).
- `confirmation` — `{ confirmed: true }` for actions where the user
  approval itself is the result.
- `choice` — selected option data, or an adjustment prompt when the user
  asks the runtime to change the option set.

Branch on `artifact.kind` before using the values. See
[Error Reference](./docs/error-reference.md) for `{ ok: false, reason }`
handling.

A fuller example with `profile.facts()`, a protected action, and downstream
provider call is in [Getting Started](./docs/getting-started.md) and
[`examples/root-client-flow.ts`](./examples/root-client-flow.ts).

## What Happens After A Result

Your runtime decides what to do with a successful result:

- fill a browser form;
- call a provider API;
- continue a broader orchestration flow;
- report progress back to your own UI or logs.

Do not log protected `values` artifacts. Log request ids, field keys, status,
or redacted summaries instead.

For browser runtimes, `client.sessions.create(...)` accepts an optional
`browser` binding with `sessionId`, `run`, and `step`. Backend and
API-only flows leave that block out.

For specialized integrations, the SDK also publishes lower-level helpers
under `@mercuryo-ai/magicpay-sdk/core` and
`@mercuryo-ai/magicpay-sdk/magicbrowse`. The MagicBrowse subpath is a set of
composable helpers (candidate building, request input, protected-fill input,
open-data matching) designed to compose with `@mercuryo-ai/magicbrowse`
`match(...)` and `fillProtectedGroup(...)`.
See [Integration Modes](./docs/integration-modes.md), the protected bridge
example under [`examples/magicbrowse-bridge.ts`](./examples/magicbrowse-bridge.ts),
and the open-data example under
[`examples/open-data-magicbrowse.ts`](./examples/open-data-magicbrowse.ts)
if you need either.

## Continue Reading

- Start with [Getting Started](./docs/getting-started.md) for the first root
  integration.
- Read [Integration Modes](./docs/integration-modes.md) if you need help
  choosing between the root SDK, pure helpers, and the optional MagicBrowse bridge.
- Use [API Reference](./docs/api-reference.md) and
  [Error Reference](./docs/error-reference.md) as lookup documents while
  integrating.
- Use [Examples Index](./docs/examples.md) for example coverage and bridge
  notes.
- Use [Open Data Matching](./docs/open-data.md) when a browser page has
  non-protected fields such as name, email, or date of birth.
- Use [Glossary](./docs/glossary.md) when terms like `resolutionPath`,
  `requestId`, `itemRef`, or `profile fact` are still new.

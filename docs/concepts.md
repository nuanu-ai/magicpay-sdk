# Core Concepts

Read this once before the [API Reference](./api-reference.md). It explains the
mental model the rest of the docs assume.

## What the SDK is for

MagicPay lets a personal AI agent act on a user's behalf — sign in, fill
checkout and identity forms, and pay — **without raw secrets, card numbers, or
credentials ever entering the model's context**.

Your runtime keeps the agent, the browser, and any provider calls. MagicPay owns
the user's reusable data, the human approvals, and the value-free planning that
sits between them:

```text
  your runtime                MagicPay                 the user
  (agent / browser /   <-->   (SDK + API)   <-->   (web, mobile, ChatGPT,
   worker / MCP tool)                               Claude, Telegram UI)
       |                          |                        |
   observes targets,        value-free handles,      approves use,
   writes values at         requests, sessions       provides missing
   the trusted boundary                              data, confirms actions
```

The single rule everything else follows: **planning sees handles, not values.**
Values are materialized only inside your callbacks, at the moment you write them
into a trusted target.

## Session

A **session** is the container for one workflow (one purchase, one booking). It
groups every request, runtime telemetry, and the completion state. Create one
with `client.sessions.create(...)`, finish it with
`client.sessions.completeWithOutcome(...)`. Persist `session.id` if work spans
processes.

## Request — and who answers it

A **request** is a waitable, human-in-the-loop task inside a session. There are
two sides, and they are usually different processes:

- **Your runtime** _creates_ a request and _waits_ for the result:
  `createRequest(...)` / `run(...)` / `request(...)`, then `waitForResult(...)`.
- **The user's MagicPay UI** (web, mobile, ChatGPT, Claude, Telegram) _answers_
  it. `client.memory.submitDecision(...)` and `claim(...)` exist for that
  answering side; a runtime integration normally only creates and waits.

Request families: **Memory** (`client.memory`), **action**
(`client.actions`), **choice** (`client.choice`), and **generic / OTP**
(`client.requests`). All waiters return the same `{ ok, ... }` shape — see
[Error Reference](./error-reference.md).

Because a human answers, `waitForResult(...)` can take minutes. A local
`timeout` is **not** terminal: persist the `requestId` and let another process
resume waiting. `clientRequestId` is an idempotency key — reuse it for retries
of the same logical request.

## Two things called "handle"

The word "handle" means two different things. Keep them apart:

| Term                                         | What it is                                                                            | Where it is used                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| **request handle** (`MagicPayRequestHandle`) | `{ requestId, sessionId, status, resolutionPath }` returned when you create a request | pass to `waitForResult(...)`       |
| **Memory value handle** (a `string`)         | an opaque pointer to a stored value, e.g. `handle_api_token`                          | pass to `materializeValue(handle)` |

## Handles vs values — values stay out of the LLM

Memory comes to your runtime in two stages:

1. **Catalog / references first.** `fetchMemoryCatalog(...)` and request results
   return value-free handles and references, never reusable raw values.
2. **Materialize only when writing.** `materializeMemoryValues(...)` (inside your
   `materializeValue` callback) returns a current-run value, used only to write
   into one trusted target.

Never put a materialized value into a log, a model prompt, a plan object, an
event, or an error message. See [Security Model](./security-model.md).

## Memory: items vs requests

Two namespaces, two jobs — the names are easy to mix up:

- **`client.memoryItems`** — CRUD over the user's _saved records_
  (`list` / `get` / `create` / `update` / `delete`). A Memory item is a
  reusable record with a label (`Airline login`, `Traveler profile`) and
  fields. Use `fieldRef` for existing-field identity; field labels are human
  display and matcher evidence.
- **`client.memory`** — _waitable user requests_ against the live session
  (`createRequest` / `waitForResult` / `submitDecision` / `claim`). Use it when
  the runtime needs the user to approve, provide, choose, or reauthorize.

## Fill: plan / apply / value — and fill ≠ commit

The fill helpers (`@mercuryo-ai/magicpay-sdk/fill-plan-apply`) write a Memory
value into any trusted target: an API header, a provider SDK call, a DB write,
or a browser field. Three levels:

- `fillMemoryValue(...)` — you already know one handle; write one value.
- `applyFill(...)` — you already have a handle-only `FillPlan`; write it through
  your `targetWriter`.
- `planFill(...)` — let the SDK build the value-free `FillPlan` from a catalog,
  your target descriptors, and Memory matches.

The load-bearing boundary: **fill is not commit.** `applyFill(...)` returns fill
state (`filled`, `partial`, `waiting_for_user`, `needs_replan`, `blocked`,
`no_progress`) and **never submits, pays, books, or signs.** Final commitment is
always a separate `client.actions` request the user confirms.

## MagicSearch — optional, before the browser

When the agent has a purchase intent but no URL yet,
`resolveMagicSearchForSession({ gateway, sessionId, query })`
(`@mercuryo-ai/magicpay-sdk/magicsearch`) picks the best provider/checkout URL
and can raise a **choice request** when confidence is low, so the user disambiguates
instead of the agent guessing. See [Integration Modes](./integration-modes.md#magicsearch).

## End-to-end: an agent books a flight

How the pieces compose in one workflow. Each step links to runnable code in
[Getting Started](./getting-started.md).

1. **Open a session.** `client.sessions.create({ type: 'payment', ... })`.
   `type` is `'payment' | 'subscription' | 'cancellation'`.
2. **Find the provider (optional).** `resolveMagicSearchForSession(...)` returns
   a checkout URL; if it raises a choice request, the user picks the airline.
3. **Reach the login form.** Your browser observes the fields; `planFill(...)`
   builds a value-free plan and `applyFill(...)` writes the saved credential
   through your guarded `targetWriter`. The agent never sees the password.
4. **Fill a missing field.** No saved value for the passport number? Create a
   `memory.provide_missing` request; the user supplies it in their MagicPay UI,
   and you fill it the same way.
5. **Confirm the payment.** `client.actions.confirm(...)` (or `run(...)` with a
   capability) asks the user to authorize the charge. Fill stopped short of
   this — commitment is explicit and separate.
6. **Complete the session.** `client.sessions.completeWithOutcome(...)` records
   the result.

Throughout, the agent's prompt only ever sees safe state — request status,
selected option, completion — not the credential, the card, or the passport
number.

## See also

- [Getting Started](./getting-started.md) — runnable code for each step above.
- [Integration Modes](./integration-modes.md) — which entrypoint to import.
- [API Reference](./api-reference.md) — exact contracts.
- [Security Model](./security-model.md) — the runtime rules in full.
- [Glossary](./glossary.md) — one-line definitions.

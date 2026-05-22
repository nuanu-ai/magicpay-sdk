# Glossary

Terms you will see in examples, API reference, and error messages. Organized
from highest-level concepts down to specific identifiers.

## Session and request model

### workflow session

A server-side object that groups related requests for one task (e.g. one
checkout, one login). Created with `client.sessions.create(...)`, closed
with `client.sessions.completeWithOutcome(...)`.

### request

A single unit of work inside a session: fetching data (login credentials,
card details), running an action (sign transaction, confirm payment), or
asking the user to choose from options found by your runtime. Created by
`data.resolve(...)`, `actions.run(...)`, or `choice.request(...)`.

### request artifact

The one-time result returned after a request is approved and executed. The
server returns it exactly once — the SDK's `waitForResult(...)` handles
the claim. If you need to hand the artifact to another process, pass the
whole result object, not the raw values.

### `artifact.kind`

Which shape the artifact takes. One of:

- `values` — a map of field names to strings (login/identity/card form
  data).
- `signature` — a cryptographic signature plus the signer identity.
- `reference` — an opaque reference to an external resource, with optional
  metadata.
- `confirmation` — just `{ confirmed: true }`, for actions where the only
  outcome needed is approval.
- `choice` — the selected option, or an adjustment prompt asking your runtime
  to search or filter again.

### `resolutionPath`

How MagicPay plans to fulfill a request. Chosen by MagicPay based on trust
rules, policy, and past approvals. One of:

- `auto` — resolved without asking the user; covered by a trust rule or
  prior approval.
- `confirm` — the user must explicitly approve the request in the
  MagicPay UI before values are returned.
- `provide` — the user must type in values directly (used when no stored
  item matches).

Your runtime does not pick `resolutionPath`; it reads it from the handle
and tailors UX (e.g. «waiting for your approval in MagicPay»).

## Stable identifiers

### `requestId`

Server-assigned ID for a single request. Use it to resume waiting via
`client.data.waitForResult(sessionId, requestId)` from another process.

### `clientRequestId`

A stable id **you** pick and pass into `data.resolve(...)` or
`actions.run(...)`. Retrying with the same `clientRequestId` returns the
same `requestId` instead of creating a duplicate — the flow is idempotent
as long as the inputs match.

Good strategies:

- deterministic from your own task id: `"checkout-${taskId}-login"`;
- UUID v4 generated once per attempt and stored alongside the task state.

Avoid: `Date.now()` alone (two retries in the same millisecond collapse);
random strings that you do not persist (defeats the purpose).

### `itemRef`

Stable id of the vault item (or capability-bearing resource) that the
request refers to. Present on request handles once MagicPay has picked
which item to use. Pass `targetItemRef` back in a follow-up request if you
want to pin subsequent calls to the same item.

### vault

The user's MagicPay-side store of approved records: logins, identities,
payment cards, and wallets. `data.resolve(...)` reads values from the
vault through an approval flow, so the calling runtime never has to hold
long-lived credentials.

### vault item

One user-approved saved record in the vault. Each item has a `category`
(`login`, `identity`, `payment_card`, `wallet`), a `schemaRef` pointing at
a built-in schema, and a set of `fieldKeys` it populates.

### vault catalog

The applicable subset of the user's vault for a given host, returned by
`fetchVaultCatalog(...)`. Used by a runtime to discover *what is available*
before asking the user for anything. See
[API Reference — Vault Catalog](./api-reference.md#vault-catalog).

### built-in schemas

MagicPay schemas are server-defined. The current set is `login.basic`,
`identity.basic`, `identity.document`, `payment_card.provider`, and
`wallet.default`. Callers pick the right `schemaRef` in `saveHint`; they
do not register new schemas from the SDK side. The package README lists
each schema's `fieldKeys`.

### `fieldKey`

The stable identifier for a value the vault can hold (for example,
`username`, `pan`, `full_name`). You list `fieldKey`s in `data.resolve(...)`
inputs to ask for specific values. The set of valid keys per schema is
fixed on the server.

### profile fact

Reusable open user-provided data that MagicPay can return without requiring
approval, for example name, email, locale, preferences, or task-specific facts.
Read with `client.profile.facts()` and partially update explicit
user-provided facts with `client.profile.saveFacts(...)`. The key space is
flexible; conventional name keys include `given_name`, `family_name`,
`middle_name`, and `full_name`. This is the broad open-data read model, not a
target-by-target browser matching API.

### open-data matching

Observed-target helper flow used by browser or CLI runtimes to match current
non-secret fields against the session-local open-data snapshot. It returns one
terminal result per target: `matched`, `ambiguous`, or `no_match`. See
[Open Data Matching](./open-data.md).

### choice request

A request created by `client.choice.request(...)` after your runtime has found
concrete options. MagicPay asks the user to select one option, or to provide an
adjustment prompt when none of the options is acceptable. Choice requests are
for option selection, not for protected values.

## Request input fields

### `saveHint`

Metadata telling MagicPay how to classify a request so it can (optionally)
save the result as a new or updated vault item:

- `category` — one of `login`, `identity`, `payment_card`, etc.
- `displayName` — human-readable label, shown in the MagicPay UI.
- `schemaRef` — standard schema id for the field set (e.g. `login.basic`).

### bridge context

Optional ids that tie a request to a specific browser page and form when
your runtime is browser-driven. Present on `input.bridge`:

- `pageRef` — the MagicBrowse `pageRef` identifying the current page state.
- `fillRef` — the MagicBrowse fillable-form id returned by
  `observe(...)`.
- `scopeRef` — the MagicBrowse scope id containing the form.
- `surfaceRef` — target-ref of a specific visible control (rarely needed).

Omit the whole block for API-only flows.

## Errors and stop conditions

### `session_stop`

Terminal state where a session was ended mid-flow by the user, a trust
rule, or the backend. Surfaces as `{ ok: false, reason: 'canceled' }` with
stop details attached to `waitForResult(...)`. Do not retry the same
request inside the same session after a `session_stop`.

### `host_resolution_failed`

Failure kind from `buildResolveInput(...)` — the bridge could not match
the observed page to a known host. Caller passes a valid page URL or
host catalog.

### `stored_secret_not_available`

Failure kind from `buildResolveInput(...)` — the chosen vault-item
candidate is no longer available for this host. Caller refreshes the
candidate inventory or picks a different item.

## MagicBrowse primitives (bridge users)

When the optional `@mercuryo-ai/magicpay-sdk/magicbrowse` bridge is in play,
these terms also appear.

### match result

The return value of `match(subject, { from })` from
`@mercuryo-ai/magicbrowse`. A discriminated union over `kind` — `ready`,
`needs_resolution`, `ambiguous`, `no_match`, and grouped counterparts.
Always branch on `kind`.

### resolution plan

The `plan` field on a `needs_resolution` or `needs_resolution_group`
match result. A serialisable description of the work (target ref, field
key, resolve request) without any value payload — safe to log or ship
across a process boundary.

### candidate ref

Opaque string that identifies one entry in the source a `match(...)`
call was given. Used inside resolution plans and in the composable
helpers to trace a decision back to its input.

### value ref / artifact ref

Opaque strings carried on ready match results. `fillProtectedGroup(...)` passes
the artifact ref to your artifact reader, and only that reader returns the
approved values to the protected browser writer. These refs are never raw
values.

### artifact reader

A caller-supplied object passed to `fillProtectedGroup(...)`. It receives
`artifactRef`, `subject`, and `candidate`, then returns either the approved
values for that exact artifact or `artifact_unavailable`. This is the one
place the browser bridge sees the MagicPay values artifact.

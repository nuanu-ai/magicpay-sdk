# API Reference

Lookup reference for the public MagicPay SDK API. If you are new to the
package, start with [Getting Started](./getting-started.md) and come back
here as a lookup document.

Every signature below is a public export from `@mercuryo-ai/magicpay-sdk`
unless otherwise noted.

## API Base URL

```text
https://agents-api.mercuryo.io/functions/v1/api
```

Create your API key in the MagicPay dashboard at
[`agents.mercuryo.io/signup`](https://agents.mercuryo.io/signup).

## Entrypoints

| Entrypoint | What it provides |
| --- | --- |
| `@mercuryo-ai/magicpay-sdk` | `createMagicPayClient(...)`, public runtime types, and the main client |
| `@mercuryo-ai/magicpay-sdk/core` | Lower-level pure request/session helpers |
| `@mercuryo-ai/magicpay-sdk/magicbrowse` | Optional bridge helpers for runtimes that use MagicBrowse observed forms |
| `@mercuryo-ai/magicpay-sdk/gateway` | Gateway config and HTTP error helpers |
| `@mercuryo-ai/magicpay-sdk/session-client` | Lower-level helpers for session and request HTTP calls |
| `@mercuryo-ai/magicpay-sdk/session-flow` | Session-outcome builders and state classifiers |
| `@mercuryo-ai/magicpay-sdk/request-flow` | Request-state classifiers |

## `createMagicPayClient(...)`

```ts
function createMagicPayClient(options: MagicPayClientOptions): MagicPayClient;

interface MagicPayClientOptions {
  gateway: MagicPayGatewayConfig;
  fetchImpl?: typeof fetch;
}

interface MagicPayGatewayConfig {
  apiKey: string;
  apiUrl: string;
}
```

`fetchImpl` lets you swap in a different `fetch` implementation — useful
for tests and for runtimes that route HTTP through a custom client.

## `client.sessions`

| Method | Purpose |
| --- | --- |
| `create(input, options?)` | Create a remote workflow session |
| `get(sessionId, options?)` | Fetch the raw session object from the server |
| `getState(sessionId, options?)` | Fetch the session and project it into `RemoteSessionState` |
| `describe(session)` | Project an already-fetched session into `RemoteSessionState` |
| `completeWithOutcome(sessionId, input, options?)` | Close the session with a final outcome |

### Signatures

```ts
sessions.create(
  input: CreateRemoteSessionInput,
  options?: MagicPayClientRequestOptions
): Promise<SessionResponse>;

sessions.get(
  sessionId: string,
  options?: MagicPayClientRequestOptions
): Promise<SessionResponse>;

sessions.getState(
  sessionId: string,
  options?: MagicPayClientRequestOptions
): Promise<RemoteSessionState>;

sessions.describe(session: SessionResponse): RemoteSessionState;

sessions.completeWithOutcome(
  sessionId: string,
  input: CompleteRemoteSessionInput,
  options?: MagicPayClientRequestOptions
): Promise<CompleteRemoteSessionOutcome>;
```

### `CreateRemoteSessionInput`

```ts
interface CreateRemoteSessionInput {
  type?: 'payment' | 'subscription' | 'cancellation';
  method?: 'card' | 'crypto' | 'x402' | null;
  amountTotal?: number | null;
  currency?: string | null;
  description?: string | null;
  merchantName?: string | null;
  browser?: CreateRemoteSessionBrowserInput;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  telemetry?: SessionTelemetryEnvelope;
}

interface CreateRemoteSessionBrowserInput {
  sessionId: string;
  entryCommand?: 'start-session';
  page?: { ref?: string; url?: string; title?: string };
  run?: SessionRemoteRunInput;
  step?: SessionRemoteStepInput;
}
```

All top-level fields are optional. API-only flows typically pass only
`description`, `merchantName`, and optional `context`/`metadata`.
Browser runtimes attach the `browser` block to bind the session to a live
browser runtime (see [Integration Modes](./integration-modes.md)).

### `CompleteRemoteSessionInput`

```ts
interface CompleteRemoteSessionInput {
  clientCompletionId: string;
  status: 'completed' | 'canceled' | 'error';
  command: string;
  summary: string;
  timestamp: string;
  details?: Record<string, unknown>;
  telemetry?: SessionTelemetryEnvelope;
  browser?: {
    page?: { ref?: string; url?: string; title?: string };
    run?: SessionRemoteRunInput & { status: 'completed' | 'failed' | 'aborted' };
    step?: SessionRemoteStepInput;
  };
}
```

`clientCompletionId` makes the completion call idempotent — passing the
same value returns the same terminal outcome without re-closing.

### `CompleteRemoteSessionOutcome`

```ts
type CompleteRemoteSessionOutcome =
  | { success: true; response: CompleteRemoteSessionResponse }
  | {
      success: false;
      kind: 'already_closed' | 'not_found' | 'other';
      reason: string;
    };
```

`already_closed` and `not_found` are normal branches (idempotent retry,
session removed by TTL). Treat `other` as a real failure.

### Session Lifecycle

A workflow session lives on the MagicPay server and has three states:

1. **Open** — created via `create(...)`, accepts `data.resolve(...)` and
   `actions.run(...)` calls. Multiple requests can run inside one session.
2. **Completed** — closed via `completeWithOutcome(...)` with a terminal
   outcome (`success`, `failure`, `abandoned`, etc.). No new requests
   accepted.
3. **Stopped** — terminated mid-flow (by the user, by a trust rule, or by
   the backend). In-flight `waitForResult(...)` calls resolve to
   `{ ok: false, reason: 'canceled', ... }` with `session_stop` details.

Rules of thumb:

- Create one session per logical task. Multiple related requests share
  the same session.
- Always call `completeWithOutcome(...)` when the task finishes — success
  or failure. Uncompleted sessions stay open until the server-side TTL
  expires; pending `waitForResult(...)` calls in other processes will hang
  until then or until the session is stopped.
- A session does not need a closing call for API-only flows if your
  runtime exits cleanly — the backend cleans up eventually — but
  completing explicitly keeps telemetry accurate and frees resources
  sooner.
- `canceled` on a `waitForResult(...)` with `session_stop` details means
  the session was terminated; do not retry the same request inside the
  same session.

## `client.profile`

| Method | Purpose |
| --- | --- |
| `facts(options?)` | Read profile data (name, email, etc.) without requiring approval |
| `saveFacts(facts, options?)` | Partially save explicit reusable open profile facts |

### Signatures

```ts
profile.facts(
  options?: MagicPayClientRequestOptions
): Promise<MagicPayProfileFacts>;

profile.saveFacts(
  facts: Record<string, string>,
  options?: MagicPayClientRequestOptions
): Promise<MagicPayProfileFacts>;

interface MagicPayProfileFacts {
  facts: Record<string, unknown>;
  updatedAt?: string;
}
```

`client.profile.facts()` is the broad open-data read model. It does not
accept observed browser targets and does not decide which fact belongs to
which current input. Per-target matching on a live observed page is a
browser-runtime concern above this SDK, and that layer should return one
terminal decision per target (`matched`, `ambiguous`, or `no_match`)
rather than matching raw `profile.facts()` output in your own code.

`client.profile.saveFacts(...)` calls `PATCH /profile/facts` and updates only
the supplied explicit facts. The profile key space is flexible: use it for
reusable open facts the user has chosen to provide, such as name keys, email,
phone, country, nationality, address-like fields, preferences, or other
non-protected task facts. It is not a vault-write path for passwords, OTPs,
CVV, private keys, document numbers, or payment-card values. After saving
chat-provided open facts, run a fresh open-data resolution step rather than
filling browser fields directly from the prompt.
Do not build value-shape secret heuristics on top of this method: contextual
facts such as password manager names, card preference labels, or key-rotation
policies can be valid open profile facts even though their wording resembles
protected domains.

## `client.data`

| Method | Purpose |
| --- | --- |
| `resolve(sessionId, input, options?)` | Create a data-request handle for the current session |
| `waitForResult(sessionId, handle, options?)` | Wait for or resume the final data result |

### Signatures

```ts
data.resolve(
  sessionId: string,
  input: MagicPayDataResolveInput,
  options?: MagicPayClientRequestOptions
): Promise<MagicPayRequestHandle>;

data.waitForResult(
  sessionId: string,
  handle: MagicPayRequestHandle | string,
  options?: MagicPayWaitForResultOptions
): Promise<MagicPayRequestResult>;
```

`waitForResult` accepts either the handle object returned by `resolve` or
just the `requestId` string — useful when another process resumes the wait.

### `MagicPayDataResolveInput`

```ts
interface MagicPayDataResolveInput {
  clientRequestId?: string;
  fields: MagicPayRequestedField[];
  context?: MagicPayRequestContext;
  bridge?: MagicPayBridgeContext;
  targetItemRef?: string;
  saveHint?: MagicPaySaveHint;
}

interface MagicPayRequestedField {
  key: string;
  type?: 'text' | 'secret' | 'date' | 'number' | 'email' | 'url';
  label?: string;
  required?: boolean;
  semanticTags?: string[];
  refreshRequired?: boolean;
}

interface MagicPayRequestContext {
  url?: string;
  pageTitle?: string;
  formPurpose?: string;
  merchantName?: string;
}

interface MagicPayBridgeContext {
  pageRef?: string;
  fillRef?: string;
  scopeRef?: string;
  surfaceRef?: string;
}

interface MagicPaySaveHint {
  category: string;
  displayName: string;
  schemaRef?: string;
}
```

- `clientRequestId` — optional but recommended. A stable id makes retries
  idempotent (same id returns the same `requestId` instead of duplicating
  the request). If omitted, the SDK generates one.
- `fields` — the only required field. Each entry is at minimum `{ key }`.
- `bridge` — leave empty for API-only flows. Browser runtimes fill it
  with refs from their observe step.
- `saveHint` — tells MagicPay how to file the resolved values in the
  user's vault when they approve.

## `client.actions`

| Method | Purpose |
| --- | --- |
| `run(sessionId, input, options?)` | Create an action-request handle for the current session |
| `waitForResult(sessionId, handle, options?)` | Wait for or resume the final action result |
| `confirm(sessionId, input, options?)` | Convenience helper that creates and waits for an explicit confirmation action |

### Signatures

```ts
actions.run(
  sessionId: string,
  input: MagicPayActionRunInput,
  options?: MagicPayClientRequestOptions
): Promise<MagicPayRequestHandle>;

actions.waitForResult(
  sessionId: string,
  handle: MagicPayRequestHandle | string,
  options?: MagicPayWaitForResultOptions
): Promise<MagicPayRequestResult>;

actions.confirm(
  sessionId: string,
  input: Omit<MagicPayActionRunInput, 'capability'>,
  options?: MagicPayWaitForResultOptions
): Promise<MagicPayRequestResult>;
```

`actions.confirm` is equivalent to `run` with `capability: 'confirm'`
followed by `waitForResult`, in one call.

### `MagicPayActionRunInput`

```ts
interface MagicPayActionRunInput {
  clientRequestId?: string;
  capability: string;
  itemRef?: string;
  params?: Record<string, unknown>;
  display?: {
    summary?: string;
    presentation?: Record<string, unknown>;
  };
  context?: MagicPayRequestContext;
  bridge?: MagicPayBridgeContext;
}
```

- `capability` — the only required field. Names the protected action the
  user is approving (e.g. `'confirm'`, `'sign'`, provider-specific keys).
- `itemRef` — pin the action to a specific vault item when MagicPay
  returned multiple candidates.
- `params` — capability-specific payload; opaque to the SDK.
- `display.summary` — short human-readable line for the approval UI.

## `client.choice`

| Method | Purpose |
| --- | --- |
| `request(sessionId, input, options?)` | Create a user-choice request for runtime-provided options |
| `waitForResult(sessionId, handle, options?)` | Wait for or resume the final choice result |

### Signatures

```ts
choice.request(
  sessionId: string,
  input: MagicPayChoiceRequestInput,
  options?: MagicPayClientRequestOptions
): Promise<MagicPayRequestHandle>;

choice.waitForResult(
  sessionId: string,
  handle: MagicPayRequestHandle | string,
  options?: MagicPayWaitForResultOptions
): Promise<MagicPayRequestResult>;
```

### `MagicPayChoiceRequestInput`

```ts
interface MagicPayChoiceRequestInput {
  clientRequestId?: string;
  ttlMs?: number;
  prompt: string;
  selectionMode?: 'single';
  allowAdjustmentPrompt?: boolean;
  options: MagicPayChoiceOption[];
  context?: MagicPayRequestContext;
  bridge?: MagicPayBridgeContext;
}

interface MagicPayChoiceOption {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  url?: string | null;
  price?: string | number | boolean | {
    amount?: number;
    currency?: string;
    label?: string;
  } | null;
  images?: Array<string | { url: string; alt?: string | null }>;
  characteristics?: Record<string, string | number | boolean>;
  raw?: unknown;
}
```

Use `choice.request(...)` after your runtime has already discovered a concrete
option set: seats, plans, delivery windows, quotes, routes, or similar. The
result artifact is `kind: 'choice'`. It may include `selected_option`, or an
`adjustment_prompt` when the user wants the runtime to search or filter again.

Choice requests are not data requests. Do not use them for login, identity,
payment-card, or wallet values; use `data.resolve(...)` for values and
`actions.run(...)` for protected execution or confirmation.

## `client.requests`

| Method | Purpose |
| --- | --- |
| `confirmOtp(sessionId, requestId, otp, options?)` | Confirm an eligible pending runtime request with the OTP the user provided |
| `waitForResult(sessionId, handle, options?)` | Generic waiter for any runtime request handle |

### Signatures

```ts
requests.confirmOtp(
  sessionId: string,
  requestId: string,
  otp: string,
  options?: MagicPayClientRequestOptions
): Promise<MagicPayRequestHandle>;

requests.waitForResult(
  sessionId: string,
  handle: MagicPayRequestHandle | string,
  options?: MagicPayWaitForResultOptions
): Promise<MagicPayRequestResult>;
```

OTP is an optional approval channel for eligible pending confirmation
requests. Do not ask for or submit an OTP before the request exists. If the
user approves the same request in MagicPay web or mobile, skip
`confirmOtp(...)` and call `requests.waitForResult(...)` on the existing
handle.

## Request Handles

```ts
interface MagicPayRequestHandle {
  requestId: string;
  sessionId: string;
  status: string;
  resolutionPath: MagicPayResolutionPath;
  itemRef?: string;
}

type MagicPayResolutionPath = 'auto' | 'confirm' | 'provide';
```

`data.resolve(...)`, `actions.run(...)`, `choice.request(...)`, and
`requests.confirmOtp(...)` return a `MagicPayRequestHandle`. Pass the handle
or request id into the matching waiter, or use `requests.waitForResult(...)`
when your resume path is request-generic. For idempotent retries, provide
your own stable `clientRequestId` inside the `input` object.

## Client Request Options

```ts
interface MagicPayClientRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface MagicPayWaitForResultOptions extends MagicPayClientRequestOptions {
  intervalMs?: number;
}
```

| Option | Meaning | Default |
| --- | --- | --- |
| `signal` | Abort signal for caller-driven cancellation. | — |
| `timeoutMs` | Maximum local waiting window before `waitForResult(...)` returns `{ ok: false, reason: 'timeout' }`. | `300_000` (300s) |
| `intervalMs` | Poll interval used by `waitForResult(...)`. | `5_000` (5s) |

`timeout` is local to the SDK — the underlying request may still be live
server-side. You can call `waitForResult(...)` again with the same
`requestId` to resume.

Bridge-only metadata such as `pageRef`, `fillRef`, and `scopeRef` belongs
on `input.bridge` for `data.resolve(...)` / `actions.run(...)`, not in
this request-options object.

## Root Result Model

`data.waitForResult(...)`, `actions.waitForResult(...)`,
`choice.waitForResult(...)`, `requests.waitForResult(...)`, and
`actions.confirm(...)` all return the same discriminated union:

```ts
type MagicPayRequestResult =
  | {
      ok: true;
      requestId: string;
      resolutionPath: MagicPayResolutionPath;
      itemRef?: string;
      artifact: MagicPayRequestArtifact;
    }
  | {
      ok: false;
      requestId: string;
      reason: MagicPayRequestFailureReason;
      message?: string;
    };

type MagicPayRequestFailureReason =
  | 'denied' | 'expired' | 'failed' | 'canceled' | 'timeout';
```

Always branch on `ok` first. On the failure side, branch on `reason` (see
[Error Reference](./error-reference.md) and [Getting Started / Handle
Failures](./getting-started.md#7-handle-failures)).

### `MagicPayRequestArtifact`

```ts
type MagicPayRequestArtifact =
  | { kind: 'values'; values: Record<string, unknown> }
  | { kind: 'signature'; signature: string; signer: string }
  | { kind: 'reference'; reference: string; metadata?: Record<string, unknown> }
  | { kind: 'confirmation'; confirmed: true }
  | {
      kind: 'choice';
      selected_option?: MagicPayChoiceOption;
      adjustment_prompt?: string;
    };
```

Always branch on `artifact.kind` before reading values:

- `values` — field map like `{ username, password }` or `{ pan, cvv, ... }`.
  Most data-request results.
- `signature` — signer-signature pair for sign-request flows.
- `reference` — opaque external reference (e.g. provider transaction id).
- `confirmation` — the user approval itself is the result; no values
  returned.
- `choice` — selected option data or an adjustment prompt for another
  runtime search/filter pass.

## `@mercuryo-ai/magicpay-sdk/core`

Pure request/session helpers without the networked root client:

| Helper area | Purpose |
| --- | --- |
| Request/session classifiers | Inspect lower-level response objects without the root client |
| Catalog and bridge helpers | Expose direct host and observed-form logic for runtimes that own their own HTTP layer |
| Session-state builders | Build session create/complete request bodies from higher-level state |
| Vault catalog | Discover what the current user has stored that applies to a host |

Use this subpath only when the root client is too high-level for your stack.

### Vault Catalog

Returns the subset of the user's MagicPay vault that applies to a given
host, so a runtime can tell an agent what is available before (or instead
of) guessing at a `saveHint`.

```ts
import { fetchVaultCatalog } from '@mercuryo-ai/magicpay-sdk/core';

function fetchVaultCatalog(
  gateway: MagicPayGatewayConfig,
  sessionId: string,
  url: string,
  options?: MagicPayRequestOptions & { syncedAt?: string }
): Promise<VaultCatalog>;

interface VaultCatalog {
  site: string;
  syncedAt: string;
  items: VaultCatalogEntry[];
}

interface VaultCatalogEntry {
  itemRef: string;
  category: string;          // 'login' | 'identity' | 'payment_card' | 'wallet'
  displayName: string;
  schemaRef: string | null;  // see built-in schemaRefs in the package README
  fieldKeys: string[];       // stable field keys the item populates
  capabilities: string[];    // e.g. 'authorize_payment', 'sign_message'
  applicability:
    | { mode: 'anywhere' }
    | { mode: 'sites'; sites?: string[] };
  availability: 'applicable' | 'requires_site_addition';
}
```

Typical usage: call it once near the start of a browser or agent run to
know which categories and `fieldKeys` are realistic for the current URL,
then shape your `data.resolve(...)` input accordingly. The `itemRef` can be
passed back as `targetItemRef` on a follow-up request when you want to pin
resolution to the same item.

This helper is read-only — it does not mutate the vault and does not
expose any protected values, only the metadata an agent needs to plan.
Schemas (the `schemaRef` vocabulary) are fixed on the server; the package
README lists the currently supported set.

## `@mercuryo-ai/magicpay-sdk/magicbrowse`

Composable helpers for runtimes that already use `@mercuryo-ai/magicbrowse` and
start from observed browser forms. Each helper is a pure function — wire them
together with MagicBrowse's `match(...)` and `fillProtectedGroup(...)` primitives
to assemble your own bridge.
The package does not expose a one-shot runtime on this subpath; the
`completeObservedForm` used by our `magicpay-cli` lives under
`/internal/magicbrowse-runtime` and is not part of the stable public API.

### Observation enrichment

| Helper | Purpose |
| --- | --- |
| `enrichObservedFormsForUrl(forms, vaultCatalog, url)` | Attach stored-secret candidate metadata to each observed form for the current host |
| `enrichObservedFormsWithStoredSecrets(forms, catalog)` | Lower-level enrichment when you already have a resolved `SecretCatalog` |
| `enrichObservedFormsWithCandidateItems(forms, vaultCatalog)` | Attach applicable vault-catalog items (card, identity, login) to each observed form |

### Candidate building

| Helper | Purpose |
| --- | --- |
| `buildObservedFormStoredSecretCandidates(form, catalog)` | Build `ObservedFormStoredSecretCandidate[]` for a single observed form |
| `findObservedFormStoredSecretCandidate(form, catalog, storedSecretRef?)` | Pick one stored-secret candidate (by `storedSecretRef` when supplied, else first applicable) |
| `buildObservedFormCandidateItems(form, vaultCatalog)` | Build `ObservedFormCandidateItem[]` ranked by availability and confidence |
| `selectObservedFormCandidateItem(candidates, itemRef?)` | Pick one candidate item (explicit `itemRef` wins; otherwise the top-ranked entry) |
| `buildObservedFormMatchCandidates({ fillableForm, merchantName, selectedCandidate, explicitItemRef? })` | Assemble grouped candidates so your runtime can call `match(fillableForm, { from: buildObservedFormMatchCandidates(...) })` |

`buildObservedFormMatchCandidates(...)` maps MagicPay `itemRef` values to
MagicBrowse `sourceRef` values. The returned candidate objects are MagicBrowse-facing
and do not carry MagicPay product or vault fields.

### Request input and protected-fill input

| Helper | Purpose |
| --- | --- |
| `buildResolveInput({ clientRequestId, merchantName, fillableForm, targetItemRef?, refreshFieldKeys?, urlOrHost?, page? })` | Convert one observed form into a `MagicPayDataResolveInput` ready for `client.data.resolve(sessionId, input)` |
| `prepareProtectedFill({ fillableForm, catalog, protectedValues, storedSecretRef? })` | Convert a values artifact into protected-fill input (values flow into the browser without passing through the LLM prompt — see [Security Model](./security-model.md)) |

### Open-data matching

| Helper | Purpose |
| --- | --- |
| `listObservedOpenDataEligibleTargetRefs({ targets, protectedForms })` | Return target refs that are candidates for open-data matching (excludes protected-form fields) |
| `resolveObservedOpenDataTargets({ targets, targetRefs, matcherModel, protectedForms?, snapshot?, page? })` | Resolve a batch of observed targets against a session-local open-data snapshot through the MagicBrowse semantic matcher; returns per-target `matched` / `ambiguous` / `no_match` |

```ts
function listObservedOpenDataEligibleTargetRefs(params: {
  targets: Record<string, TargetDescriptor>;
  protectedForms?: ReadonlyArray<Pick<ProtectedFillForm, 'fields'>>;
}): string[];

function resolveObservedOpenDataTargets(
  params: ResolveObservedOpenDataTargetsParams
): Promise<{
  host?: string;
  results: ResolvedObservedOpenDataTarget[];
}>;

interface ResolveObservedOpenDataTargetsParams {
  targets: Record<string, TargetDescriptor>;
  targetRefs: ReadonlyArray<string>;
  matcherModel?: OpenDataTargetMatcherModel;
  protectedForms?: ReadonlyArray<Pick<ProtectedFillForm, 'fields'>>;
  snapshot?: ObservedOpenDataSnapshot;
  page?: { url?: string };
}

interface ObservedOpenDataSnapshot {
  valuesByField: Record<string, ObservedOpenDataEntry[]>;
}

interface ObservedOpenDataEntry {
  fieldKey: string;
  value: string | number;
  source: 'profile_facts' | 'session_open_value';
  applicability:
    | { target: 'global' }
    | { target: 'host'; value: string };
}
```

`profile.facts()` gives you reusable public facts; it does not know which
current browser target each fact should fill. The open-data helpers are the
MagicBrowse bridge for that second step:

1. Build an `ObservedOpenDataSnapshot` from profile facts or session-local
   non-secret values.
2. Use `listObservedOpenDataEligibleTargetRefs(...)` to exclude protected
   form fields, password/card inputs, stale targets, and non-fillable targets.
3. Call `resolveObservedOpenDataTargets(...)` with an injected MagicBrowse
   semantic matcher model to get one terminal decision per target: `matched`,
   `ambiguous`, or `no_match`. Without a matcher model, the helper fails closed
   with `matcher_unavailable`.
4. Fill only `matched` results through your browser runtime. Handle
   `ambiguous` by asking the user or narrowing the candidate set; handle
   `no_match` by leaving the field for another strategy.

See [Open Data Matching](./open-data.md) and
[`examples/open-data-magicbrowse.ts`](../examples/open-data-magicbrowse.ts)
for a copy-paste ready adapter.

### Types (appendix)

Exported from the same subpath:

- `ObservedFormStoredSecretCandidate`, `ObservedFormCandidateItem`
- `ObservedFormWithStoredSecrets<TForm>`, `ObservedFormWithCandidateItems<TForm>`
- `ObservedOpenDataEntry`, `ObservedOpenDataSnapshot`, `ObservedOpenDataSource`
- `ResolveObservedOpenDataTargetsParams`, `ResolvedObservedOpenDataTarget`
- `BuildResolveInputOutcome`, `BuildResolveInputFailureKind`
- `PreparedProtectedFill<TForm>`

The composing example below uses MagicBrowse's grouped `match(...)` result, turns
the approved MagicPay values result into an opaque `artifactRef`, and applies
it with `fillProtectedGroup(...)`. The artifact reader is the only boundary
that sees raw values; public match and fill results carry refs and status only.

Failure kinds for `buildResolveInput(...)` are listed in
[Error Reference](./error-reference.md).

### Composing with MagicBrowse primitives

Typical end-to-end flow for a single protected form:

`semanticMatcherModel` must be a MagicBrowse semantic matcher backed by the
gateway `xfast` model. It receives DOM descriptors and schema metadata only,
not protected values.

```ts
import {
  fillProtectedGroup,
  matchProtectedFillSubjects,
  match,
  observe,
  type MagicBrowseMatchReadyGroupResult,
  type FillProtectedGroupInput,
} from '@mercuryo-ai/magicbrowse';
import {
  buildObservedFormCandidateItems,
  buildObservedFormMatchCandidates,
  buildResolveInput,
  prepareProtectedFill,
  selectObservedFormCandidateItem,
} from '@mercuryo-ai/magicpay-sdk/magicbrowse';

const observation = await observe({ sessionId: magicBrowseSessionId });
const targets = observation.orchestration?.fillableTargets?.descriptors ?? [];
const [fillableForm] = await matchProtectedFillSubjects({
  targets,
  model: semanticMatcherModel,
});
const candidates = buildObservedFormCandidateItems(fillableForm, vaultCatalog);
const selected = selectObservedFormCandidateItem(candidates, itemRef);
const matchCandidates = buildObservedFormMatchCandidates({
  fillableForm,
  merchantName,
  selectedCandidate: selected,
});

const matched = await match(fillableForm, {
  from: matchCandidates,
});
if (matched.kind !== 'needs_resolution_group') throw new Error(matched.kind);

const outcome = buildResolveInput({
  /* ... */
  fillableForm,
  ...(matched.plan.sourceRef ? { targetItemRef: matched.plan.sourceRef } : {}),
});
if (!outcome.success) throw new Error(outcome.reason);
const handle = await client.data.resolve(sessionId, outcome.input);
const result = await client.data.waitForResult(sessionId, handle);
if (!result.ok || result.artifact.kind !== 'values') throw new Error('...');

const artifactRef = `magicpay-request:${result.requestId}`;
const responseItemRef = result.itemRef ?? handle.itemRef ?? matched.plan.sourceRef;
const readyMatch: MagicBrowseMatchReadyGroupResult = {
  kind: 'ready_group',
  fillRef: matched.fillRef,
  purpose: matched.purpose,
  candidateRef: matched.candidateRef,
  ...(responseItemRef ? { sourceRef: responseItemRef } : {}),
  fieldKeys: matched.fieldKeys,
  artifactRef,
  confidence: matched.confidence,
};

const prepared = prepareProtectedFill({
  fillableForm,
  catalog: outcome.catalog,
  protectedValues: result.artifact.values,
  storedSecretRef: result.itemRef ?? handle.itemRef ?? matched.plan.sourceRef ?? null,
});
const artifactReader: FillProtectedGroupInput['artifactReader'] = {
  async read(input) {
    if (input.artifactRef !== artifactRef) {
      return { status: 'blocked', reason: 'artifact_unavailable' };
    }
    return { status: 'resolved', values: prepared.protectedValues };
  },
};

await fillProtectedGroup({
  sessionId: magicBrowseSessionId,
  subject: prepared.fillableForm,
  match: readyMatch,
  candidates: matchCandidates,
  artifactReader,
});
```

See the `@mercuryo-ai/magicbrowse` package for the browser runtime contract.

## Gateway Error Helpers

Exported from the root package and from `@mercuryo-ai/magicpay-sdk/gateway`.

```ts
class MagicPayRequestError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly errorCode: string | null;
  readonly responseText: string;
  readonly contentType: string | null;
}

function getMagicPayErrorCode(error: unknown): string | null;
function getMagicPayErrorMessage(error: unknown): string;
function isMagicPayRequestErrorStatus(error: unknown, status?: number): boolean;
```

| Helper | Purpose |
| --- | --- |
| `MagicPayRequestError` | Error class thrown on network or backend request failures. |
| `getMagicPayErrorCode(err)` | Normalize the MagicPay error code from a thrown error or response body. |
| `getMagicPayErrorMessage(err)` | Normalize a readable message for logs or UI. |
| `isMagicPayRequestErrorStatus(err, status?)` | Check whether the error carries a given HTTP status (or any SDK-classified request status). |

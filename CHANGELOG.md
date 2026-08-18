# Changelog

All notable changes to `@nuanu-ai/magicpay-sdk` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the package adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - Unreleased

### Breaking

- The root entrypoint is curated down to nine runtime exports and the types
  the guides speak in: the client, `getAuthenticatedAgent`, and the two thrown
  error classes with their helpers. The other ninety-eight root re-exports
  moved unchanged to their subpath homes — `/core` (Memory items, client
  capabilities, polling primitives, value types, country options, target
  signatures), `/payment-operations`, `/magicsearch`, `/fill-plan-apply`,
  `/subscription-approval`, `/session-client`, `/session-flow`, and
  `/memory-decisions`. A test pins the root export list, so widening it back
  is a reviewed decision, not a merge side effect.

### Security

- The setup flow validates what it persists. `verifyMagicPaySetup` ran on a
  separate transport helper that never validated 2xx bodies, so a 200 that
  reported its own failure (`success: false`) still handed the caller an API
  key to store, a blank key was persisted as configured, and a missing
  `gateway.api_url` silently rebound the credential to the default gateway.
  Both setup calls now require the complete documented contract.
- The Memory catalog fails closed. `fetchMemoryCatalog` accepted any 2xx body
  and normalized it into a structurally complete catalog — an error body
  became an empty catalog, and a handle whose `ask_before_use` consent flag
  was missing kept its secret usable with the confirmation gate silently
  gone. The response is now validated per handle (item ref, value handle,
  boolean consent flag) before normalization, and a downgraded
  `value_visibility` is a malformed response instead of being overwritten.
- Claimed request artifacts are validated per kind before they become "the
  request was fulfilled": a values artifact must carry its values record, a
  signature its signer, a confirmation its `confirmed: true`, and an unknown
  or empty artifact is a malformed response instead of a success with holes.
  Session-stop notices must carry their canceled status and reason code, and
  the runtime request envelope requires the server-guaranteed `otp_available`
  flag — previously its absence silently read as "OTP unavailable" and
  removed an approval channel the user was entitled to.
- Hosted-link responses validate the full link and routing contract, so a
  top-up or review link with no id, expiry, or surfaces fails instead of
  reporting a usable link.
- The payment-result reader validates the complete response contract. A 200
  body carrying only `{"status": "succeeded"}` — no session binding, no
  settlement evidence — previously parsed as a result and could surface as
  "the payment is confirmed" downstream; it now fails as `malformed_response`,
  and statuses or evidence sources outside the documented sets fail closed
  the same way.
- Key revocation no longer trusts an arbitrary 200 body. The endpoint promises
  exactly `{success: true, status: "revoked"}`, and anything else — an empty
  object included — is a `malformed_response` instead of a reported success.
- `getAuthenticatedAgent` requires the documented profile contract (name,
  status, timestamps, limits, memory policies), so a body with only an id
  fails instead of producing a profile with undefined fields.
- Errors thrown for Memory materialization requests no longer retain the
  response body, parsed payload, or server-provided message. Those responses
  can carry runtime-only values, and the previous behavior could put them into
  error objects that callers routinely log. Only the HTTP status, a short error
  code, and the content type survive.

### Fixed

- A repeated completion of an already-terminal session parses again. The
  event-envelope reader required `event` unconditionally, but the server
  legitimately returns a 200 without one for the idempotent
  already-closed-same-status retry; `event` is now nullable, validated when
  present, and `duplicate` is required as a boolean.
- Session envelopes require `last_event_seq`, the event-sequencing anchor the
  CLI persists into workflow state. A response without it previously wrote
  `undefined` into the state file and could silently drop the
  payment-submission evidence marker that guards reservation release.
- Decision submissions parse the runtime request envelope instead of
  accepting any JSON object as a recorded approve/deny.
- Account and Memory readers validate what their callers read instead of the
  container alone: card listings require each card's id, number, status, and
  currency (and recognize the `ulc_v1` source); paginated transaction
  responses require a numeric `limit` and a string-or-null `next_page`; agent
  profile stats, when present, must carry their three numbers; the Memory
  item list requires `items` with per-item ids rather than reading an absent
  list as an empty library; and `updateMemoryItem` requires the server's
  `created_new_item: false` confirmation that the update did not fork a new
  item.
- `planFill` fails closed when one field matches several catalog handles after
  role filtering. It now returns a `conflict` with the candidates instead of
  silently picking the first entry, which could fill a subject-bound field
  with another person's value.
- Plain-string `value_handle` catalog entries resolve to their real handle
  refs in every planning path. They previously fell through normalization and
  produced a fabricated `handle_<sha16>` that could not be materialized.
- Empty materialized Memory values are blocked before the target writer runs
  and are reported through `memory.missing` diagnostics. Previously an empty
  write could be reported as `filled`.
- Client request ids use `crypto.randomUUID()` instead of a timestamp, so
  concurrent requests can no longer collide on `client_request_id`.
- Expired requests are detected by the `request_expired` error code first,
  with message matching kept only as a fallback for older backends.
- The SDK runs on Node 18, the declared engines floor. `randomUUID` is now
  imported from `node:crypto` instead of relying on the global Web Crypto
  object, which Node 18 only exposes behind an experimental flag.
- A call that fails before a response arrives — DNS failure, refused or reset
  connection — is reported as `MagicPayRequestError` with `status: 0` and
  `errorCode: 'network_error'`. It previously escaped as a bare `TypeError`,
  which the documented error contract did not cover. The original error is
  kept as the `cause`, and the message never repeats the request URL or body.
- One such network failure no longer ends a wait. Waiters retry it on the poll
  interval until the wait budget runs out, so a brief network problem during a
  five-minute wait no longer discards a request a person is still answering.
  An `AbortSignal` still stops the wait immediately, and HTTP error responses
  keep their existing behavior.
- Canceled results from `waitForResult(...)` carry `reasonCode`, the stop
  reason MagicPay reported. It was dropped on the way out, leaving callers to
  parse the optional human-readable message.
- A successful response whose body does not match the shape the endpoint
  promises is reported as `MagicPayRequestError` with the response status and
  `errorCode: 'malformed_response'`, instead of being cast to the declared type
  and read as if it were valid. It covers the agent profile, account cards,
  card balance, card and account transactions, session, session event, session
  payment result, runtime request, decision, claim, hosted link, and Memory
  item responses. Only the field path that failed appears in the message —
  never a value from the body, and the payload and response text stay empty.
  Two consequences worth knowing: a stop notice next to a partial request
  record still resolves as the stopped session, and `resolution_path` is now
  required on request-creation responses, not only while polling.
- Memory materialization responses are validated the same way instead of
  silently degrading a malformed body to an empty value list.
- A request claim that decoded to a falsy body (an empty reply, `null`, `""`)
  left the claim loop with nothing to claim and re-sent the claim request in an
  unbounded hot loop — millions of calls in seconds, since the deadline check
  lived on the error path the success path never entered. The wait now ends
  with the `malformed_response` error on the first such reply.
- Request inputs accepted in both spellings are read through one shared
  normalizer instead of per-call-site `??` chains, so the two spellings can no
  longer drift apart. Both spellings stay accepted; camelCase is canonical and
  wins when a field arrives in more than one.

### Added

- `MagicPaySessionStoppedError`, `getMagicPayErrorDiagnostics`, and
  `isMagicPayAbortError` are exported from the root entrypoint, so error
  handling no longer requires subpath imports.
- This changelog. It ships with the package and the public repository.
- `getAuthenticatedAgent(...)` is exported from the root entrypoint, together
  with the `AgentBackendProfile` and `AgentBackendStats` types. It returns the
  agent an API key belongs to and is the first call a new integration should
  make, so a wrong key, a revoked key, or the wrong API base URL fails in one
  round trip instead of inside a session flow. It was previously reachable only
  through the `/gateway` subpath.
- `examples/hello-world.ts`: a runnable program that reads `MAGICPAY_API_KEY`
  and `MAGICPAY_API_URL`, prints the authenticated agent, and exits non-zero
  with a readable message when the key is missing or rejected.

### Changed

- Guides and runnable examples point at the branded production API URL,
  `https://api.magicpay.nuanu.ai/functions/v1/api`, instead of the raw
  hosting-project hostname.
- The npm artifact no longer ships `.d.ts.map` files that pointed at absent
  sources, and declares `sideEffects: false` for bundlers. The tarball drops
  from 142 to 101 files.
- README links to guides use absolute public-repository URLs, so they work
  from the installed package where `docs/` is intentionally not packed.
- Package verification and the install smoke iterate the real `exports` map
  instead of a hardcoded entrypoint list, so every subpath is packed and
  importable or the release fails.
- The waiting window and the per-call HTTP timeout are separate budgets.
  `timeoutMs` still covers the whole wait (300000 ms), while each HTTP call a
  waiter makes is bounded by the new `attemptTimeoutMs` (30000 ms) and by
  whatever is left of the wait. A connection that stopped answering could
  previously spend the entire window on a single call, with no further polls.
- Documentation is aligned with the shipped API: request/bridge context
  definitions with the exact transmitted fields, named result unions, the
  waiting contract (300000 ms timeout, 3000 ms poll interval, `AbortSignal`),
  and discriminated-outcome examples on the runtime and answering sides.
- Documentation verification now type-checks every TypeScript snippet in the
  shipped docs against the built SDK, so a documented call that no longer
  compiles fails the release checks.
- `ValueFreeEventSink` receives a closed union of execution events instead of
  an open record. Emitting a value-bearing field is now a compile error at the
  emission site rather than a convention the tests police. Event payloads are
  unchanged, and sinks written against the wider record type keep compiling.

## [0.2.2] - 2026-08-07

### Changed

- The package moved from the retired `@mercuryo-ai` npm scope to
  `@nuanu-ai/magicpay-sdk`. Earlier release history lives under the old scope
  and is not republished.

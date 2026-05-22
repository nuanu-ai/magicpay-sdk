# Security Model

This document states the threat model MagicPay SDK is designed against,
and the threats it does **not** address. Read it before you assume
"protected" means more than it does.

MagicPay's core design goal is narrow and specific: **keep sensitive
values out of the LLM prompt that drives the surrounding agent or
application**. Everything else in this document either reinforces that
goal or marks where the design stops.

That boundary only works when the user chooses the MagicPay request path.
If the user voluntarily types a password, OTP, card value, private key, or
other secret into chat, that value has already entered the model-visible
conversation. MagicPay cannot undo or protect data after the user has placed
it in model context; it can only provide a safer path the user may choose.

## What "Protected" Means Here

Across this SDK and the wider toolchain — `prepareProtectedFill`,
`fillProtectedGroup` in `@mercuryo-ai/magicbrowse`, the `protected` sensitivity
tag on vault fields, the
`magicpay find-form` → `magicpay resolve-form` CLI flow — the word
*protected* means the same thing:

> The value is routed so that it is **not placed into the LLM's input
> context**. It is fetched on the MagicPay side, approved by the user,
> and applied to the target (a browser field, a provider call, etc.)
> without the model that orchestrates the run ever reading it.

It does **not** mean "the runtime environment is trusted", "the value
cannot be exfiltrated by a compromised host", or "the call is resistant
to attackers with code execution on the caller's machine". Those are
orthogonal problems that this SDK alone does not try to solve.

It also does not mean MagicPay protects secrets that the user already pasted
into the surrounding agent chat. The protected path is an alternative to that
chat-visible route, not a retroactive scrubber.

## Protects Against

MagicPay, as used through this SDK, is designed to reduce or remove the
following risks:

- **Prompt leakage.** Protected values never appear in the LLM input used
  to plan or carry out the flow. The orchestrating model decides *when*
  to request a value and *where* to apply it, but never reads the value
  itself.
- **Prompt-log / transcript leakage.** Because the value never enters the
  prompt, ordinary LLM logs, transcripts, token-usage captures, or cached
  chat histories do not contain it. The one-shot artifact returned by
  `waitForResult(...)` is intended for direct forwarding to the next
  step, not for passing through the model.
- **Accidental runtime logging.** The SDK does not log protected values from
  its own code paths, and MagicBrowse records exact-value redaction profiles after
  protected fill so later observe, act prompt state, debug text, and console
  persistence do not echo a just-submitted value back into the transcript.
- **Unapproved reuse.** Every request carries a `resolutionPath` of
  `auto`, `confirm`, or `provide`. An `auto` path only fires when a trust
  rule or prior approval covers it; everything else requires a fresh user
  decision, visible in the MagicPay UI.
- **Match results do not carry raw values.** When the optional MagicBrowse bridge
  is in play, `match(...)` returns plans and opaque artifact refs. The raw
  value is read only by the artifact reader that feeds `fillProtectedGroup(...)`.
  Serializable match and fill results carry refs, field keys, status, and
  redacted summaries, not the approved values themselves.
- **Replay of a completed artifact.** The request artifact is delivered
  once. Subsequent calls with the same `requestId` do not re-hand the
  value; they observe the terminal state. Retries are safe only through
  `clientRequestId` idempotency, which collapses duplicate *requests*,
  not duplicate *reads*.
- **Cross-session smuggling.** A `sessionId` is a scope; protected
  artifacts in one session cannot be claimed from another. `session_stop`
  is terminal for that session's requests.
- **Plain credential rotation pressure.** The user can change, revoke, or
  re-approve a vault item without any code change in the calling agent,
  because the agent never had a copy in the first place.

## Does NOT Protect Against

These threats are out of scope for MagicPay as delivered by this SDK, and
any claim otherwise is wrong. Integrators who need these protections must
provide them at a different layer.

- **Compromised operating system or host.** If the machine running the
  SDK is owned by an attacker (kernel-level malware, keylogger, process
  memory readout), MagicPay cannot keep the final values from that
  attacker. By the time a value is applied to a form or a provider call,
  it exists in the host's memory.
- **Compromised browser or CDP endpoint.** The browser that `attach`
  connects to is trusted by MagicPay. A malicious or tampered browser can
  read DOM contents (including fields just filled), capture screenshots,
  or exfiltrate over its own network stack. Ensure the browser is one the
  user controls.
- **Compromised agent runtime.** The code that calls `waitForResult(...)`
  and then applies the value has to see the value at some point. If that
  process is compromised — malicious packages, RCE in a hosted sandbox,
  a hostile MCP server — the value is exposed there. MagicPay narrows the
  surface (the LLM does not see it); it does not remove it.
- **User-provided secrets in model context.** MagicPay does not stop a user
  from sending sensitive data directly to an agent chat. Once that happens,
  the data is part of the model-visible transcript even if a safer MagicPay
  request path was available.
- **Screenshots, page recordings, or DOM capture taken after fill.** If
  the surrounding runtime takes a screenshot of a page where a protected
  value was just rendered (visible card number, etc.) and that screenshot
  goes into the LLM, the protection is defeated. Control what your
  orchestration captures after a protected fill.
- **Side channels in post-submit page state.** A submitted value that is
  echoed back in a URL, query string, error banner, or thank-you page may
  re-enter the LLM if the runtime re-reads the page and sends the raw
  text to the model. Keep the "read the page back" step minimal and
  redact known sensitive fields on your side if you must forward it.
- **Social engineering.** MagicPay approves requests the user clicks
  through. A user who approves a request for the wrong merchant, or who
  types a real password into a phishing page that MagicPay is not driving,
  is outside the SDK's protection boundary.
- **Network adversaries at the user's edge.** Transport-level attacks
  (user-side MITM, hostile proxy, forged certificates) are a
  transport/TLS concern. The SDK assumes HTTPS to
  `agents-api.mercuryo.io` is intact.
- **Broken trust rules in the user's account.** A user who configured an
  overly broad trust rule (for example, auto-approving any login request
  for any host) has instructed MagicPay to skip the confirmation step.
  That is by design, not a bug; but the protection level is then whatever
  the rule permits.

## Trust Boundaries At A Glance

| Trusted by MagicPay | Not trusted by MagicPay |
| --- | --- |
| The MagicPay backend and its approval UI | The orchestrating LLM and its prompt / log pipeline |
| The user (their decisions in the MagicPay UI) | Arbitrary LLM-generated `data.resolve` inputs (they go through the same approval path) |
| Your code that calls `waitForResult` and forwards the value | Malware or an untrusted operator on the caller's host |
| A user-controlled browser session attached via `attach` | A tampered browser, a browser shared with an attacker, or one running hostile extensions |

## Practical Guidance

- Treat the artifact from `waitForResult(...)` as short-lived. Do not
  persist it to your own storage; apply it and drop it.
- Do not print, log, summarise, or echo protected values from your own
  code. The SDK will not stop you from doing so — it only promises not
  to do it itself.
- Prefer the MagicPay cabinet/request path for protected values. Chat entry
  can be convenient for reusable open profile facts, but it is model-visible;
  passwords, OTPs, CVV, private keys, card values, and similar secrets should
  stay on the MagicPay path.
- Do not use value-shape heuristics to decide that a reusable open fact is a
  protected secret. Contextual facts such as password manager names or
  key-rotation policies can be open facts even when their wording resembles a
  protected domain.
- Do not invent new "trust" by aggregating `profile.facts()` and
  protected values in the prompt. The value of the protected path is
  exactly that the model did not see the value.
- If your runtime takes screenshots or full-page snapshots, avoid
  capturing them *after* a protected fill on the same page, or redact
  known sensitive regions before forwarding.
- When using the MagicBrowse bridge, keep protected writes behind
  `fillProtectedGroup(...)` so the secret-handling surface stays separable
  from ordinary browser actions during review.
- If an integration requires stronger guarantees against the "compromised
  runtime" threat (confidential computing, attested enclaves, hardware
  security modules), treat that as work outside this SDK — MagicPay is
  complementary to those, not a substitute.

## Reporting A Concern

Security issues should be reported privately through GitHub Private
Vulnerability Reporting or by email to `security@mercuryo.io`. If you
find a way to make a protected value enter the LLM input against the
above guarantees, treat it as a vulnerability and report it through that
channel rather than filing a normal issue.

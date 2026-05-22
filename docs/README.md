# MagicPay SDK Docs

This docs set is for integrators using `@mercuryo-ai/magicpay-sdk` from a
trusted Node or TypeScript runtime.

The standard runtime flow is:

1. read `profile.facts()` when open reusable data is enough, and use
   `profile.saveFacts(...)` only for explicit reusable open facts the user
   chooses to save;
2. call `data.resolve(...)`, then `data.waitForResult(...)`, when the runtime
   needs protected or mixed-value form data;
3. call `actions.run(...)`, then `actions.waitForResult(...)`, when the
   runtime needs a protected action result.
4. call `choice.request(...)`, then `choice.waitForResult(...)`, when the
   runtime needs the user to choose from options it found.

Use this route map:

- [Getting Started](./getting-started.md)
  Tutorial for the first
  `profile.facts -> data.resolve -> data.waitForResult -> actions.run -> actions.waitForResult`
  flow.
- [Integration Modes](./integration-modes.md)
  Explanation of the root SDK, pure helpers, and the optional MagicBrowse bridge.
- [Open Data Matching](./open-data.md)
  How to turn `profile.facts()` into per-target decisions for non-protected
  browser fields.
- [API Reference](./api-reference.md)
  Lookup reference for the public entrypoints and client methods.
- [Error Reference](./error-reference.md)
  Lookup reference for result reasons, request waiting, and bridge failures.
- [Examples Index](./examples.md)
  Focused integration notes and bridge examples.
- [Testing Guide](./testing.md)
  How to run deterministic tests by swapping in your own `fetchImpl`.
- [Glossary](./glossary.md)
  Definitions for terms such as `profile fact`, `vault item`, `request`,
  `request artifact`, and bridge refs.
- [Security Model](./security-model.md)
  What "protected" means here, what this SDK protects against, and what
  it does not. Read before assuming the term "protected" covers more
  than LLM-prompt leakage.

If you are new to the package, start at the
[package README](../README.md) first.

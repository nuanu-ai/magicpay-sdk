# MagicPay SDK Docs

This documentation is for integrators using `@mercuryo-ai/magicpay-sdk` from a
trusted Node or TypeScript runtime.

The current runtime flow is:

1. create or reuse a workflow session;
2. list, create, or update saved Memory records through `client.memoryItems`;
3. create Memory requests through `client.memory` when the runtime needs user
   input, approval, candidate selection, reauth, or a current-run value handle;
4. use `fillMemoryValue(...)` when you already know one handle and need to
   write it into trusted runtime code;
5. use `applyFill(...)` when you already have a handle-only `FillPlan`;
6. use `planFill(...)` with a value-free catalog when you want the SDK to build
   the plan for your targets;
7. use `client.actions` for user-confirmed actions;
8. use `client.choice` for option selection.

The SDK fill helpers are target agnostic. Browser automation is one adapter
that can supply targets and a writer; API headers, provider calls, and other
trusted runtime targets use the same fill helpers.

Route map:

- [Getting Started](./getting-started.md)
- [Integration Modes](./integration-modes.md)
- [API Reference](./api-reference.md)
- [Error Reference](./error-reference.md)
- [Examples Index](./examples.md)
- [Testing Guide](./testing.md)
- [Glossary](./glossary.md)
- [Security Model](./security-model.md)

Start with the [package README](../README.md) if you are new to the package.

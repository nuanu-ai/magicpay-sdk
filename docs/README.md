# MagicPay SDK Docs

This documentation is for integrators using `@mercuryo-ai/magicpay-sdk` from a
trusted Node or TypeScript runtime.

The current runtime flow is:

1. create or reuse a workflow session;
2. read or save reusable Memory through Memory APIs;
3. create Memory requests through `client.memory` when the runtime needs user
   input, approval, candidate selection, reauth, or a current-run value handle;
4. use `fetchMemoryCatalog(...)`, `planFill(...)`, `applyFill(...)`, and
   `materializeMemoryValues(...)` for browser field fill;
5. use `client.actions` for user-confirmed actions;
6. use `client.choice` for option selection.

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

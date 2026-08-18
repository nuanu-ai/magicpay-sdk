# Examples

The examples are small TypeScript snippets for the public SDK APIs.

| File | Purpose |
| --- | --- |
| [`hello-world.ts`](../examples/hello-world.ts) | Verify an API key with `getAuthenticatedAgent(...)` and print the agent it belongs to. |
| [`root-client-flow.ts`](../examples/root-client-flow.ts) | Root client flow with Memory, a Memory request, and an optional action. |
| [`memory-request.ts`](../examples/memory-request.ts) | Create and wait for a Memory request. |
| [`memory-fill-value.ts`](../examples/memory-fill-value.ts) | Fill one known Memory handle through a caller-owned write callback. |
| [`memory-plan-apply.ts`](../examples/memory-plan-apply.ts) | Fetch a Memory catalog, plan target fill, materialize handles, and write through a target adapter. |
| [`testing-fetch.ts`](../examples/testing-fetch.ts) | Create a deterministic test client by injecting `fetchImpl`. |

All examples assume trusted runtime code. Every one except `hello-world.ts`
also assumes an existing workflow session.

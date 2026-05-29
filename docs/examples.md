# Examples

The examples are small TypeScript snippets for the public SDK surface.

| File | Purpose |
| --- | --- |
| [`root-client-flow.ts`](../examples/root-client-flow.ts) | Root client flow with Memory, a Memory request, and an optional action. |
| [`memory-request.ts`](../examples/memory-request.ts) | Create and wait for a Memory request. |
| [`memory-plan-apply.ts`](../examples/memory-plan-apply.ts) | Fetch a Memory catalog, plan field fill, materialize handles, and write through a browser adapter. |
| [`testing-fetch.ts`](../examples/testing-fetch.ts) | Create a deterministic test client by injecting `fetchImpl`. |

All examples assume trusted runtime code and an existing workflow session.

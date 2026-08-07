# Error Reference

## Request Result Reasons

`client.memory.waitForResult(...)`, `client.actions.waitForResult(...)`,
`client.choice.waitForResult(...)`, and `client.requests.waitForResult(...)`
return `{ ok: false, reason }` for terminal request outcomes.

| Reason | Meaning |
| --- | --- |
| `denied` | The user denied the request. |
| `expired` | The request expired before completion or the artifact was no longer claimable. |
| `failed` | MagicPay could not complete the request. |
| `canceled` | The request or session was canceled. |
| `timeout` | The SDK waiter reached its local timeout. |

Local `timeout` does not imply the remote request is terminal. Persist the
request id if another process may resume waiting later.

## Transport Errors

Network and HTTP failures throw `MagicPayRequestError`.

```ts
import { getMagicPayErrorDiagnostics, MagicPayRequestError } from '@nuanu-ai/magicpay-sdk';

try {
  await client.memory.createRequest(sessionId, input);
} catch (error) {
  if (error instanceof MagicPayRequestError) {
    console.error(getMagicPayErrorDiagnostics(error));
  }
  throw error;
}
```

Diagnostics include HTTP status, backend error code when available, content
type, and a bounded response preview.

Provider-backed card data requests before payment authorization return a
structured machine state. Branch on the diagnostics/body fields instead of
parsing text:

| Field | Value |
| --- | --- |
| `error_code` | `payment_card_authorization_required` |
| `status` | `authorization_required` |
| `category` | `payment_card` |
| `reason` | `payment_authorization_required` |

## Fill Apply Statuses

`applyFill(...)` returns orchestration statuses:

| Status | Meaning |
| --- | --- |
| `filled` | All ready fields were written. |
| `partial` | Some fields were written and then apply stopped. |
| `waiting_for_user` | A Memory decision or value is needed before materialization. |
| `needs_replan` | The target set changed; observe or describe targets and plan again. |
| `blocked` | The current flow cannot fill through the supplied writer. |
| `no_progress` | Nothing was written and no immediate retry is useful. |

These statuses do not authorize final submit or purchase actions. Keep final
commitment behind a separate action flow.

`planFill(...)` can include a non-fatal blocker
`payment_card.authorization_required` with `blocking: false`. That is a
catalog availability state, not an apply failure. Authorize the payment and
plan again before trying to fill provider-backed card fields.

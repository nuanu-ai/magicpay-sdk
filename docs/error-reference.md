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

A canceled result also carries `reasonCode` when MagicPay reported why the
session stopped, such as `user_canceled`. It is the machine-readable form of
the optional `message`.

## Thrown Errors

The SDK throws two error classes. Both are exported from the root entrypoint.

| Class | Thrown when | Fields |
| --- | --- | --- |
| `MagicPayRequestError` | A MagicPay HTTP or network call failed. | `status`, `errorCode`, `payload`, `responseText`, `contentType`, `cause` |
| `MagicPaySessionStoppedError` | The session was stopped before the request could be created, including OTP confirmation and `client.actions.confirm(...)`. | `status`, `reasonCode`, `stoppedAt` |

A call that fails before a response arrives — DNS failure, refused or reset
connection, a body that stops mid-stream — is a `MagicPayRequestError` too, with
`status: 0` and `errorCode: 'network_error'`. The original error is kept as the
`cause`; the message never repeats the request, which carries the URL query and
the body. A local timeout uses the same shape with `errorCode: 'request_timeout'`.
Waiters retry both instead of failing, so these reach you only from single calls
such as `createRequest(...)` or `submitDecision(...)`.

Errors from Memory materialization never carry the response body: those
responses can contain runtime-only values, so `payload` is `null`,
`responseText` is empty, and the message is generic. Only `status`,
`errorCode`, and `contentType` survive, which keeps these diagnostics safe to
log.

```ts
import {
  getMagicPayErrorDiagnostics,
  MagicPayRequestError,
  MagicPaySessionStoppedError,
} from '@nuanu-ai/magicpay-sdk';

try {
  await client.memory.createRequest(sessionId, input);
} catch (error) {
  if (error instanceof MagicPaySessionStoppedError) {
    stopRuntimeWork(error.reasonCode);
  } else if (error instanceof MagicPayRequestError) {
    console.error(getMagicPayErrorDiagnostics(error));
    retryOrFail(error.status);
  }
  throw error;
}
```

`getMagicPayErrorDiagnostics(...)` reports HTTP status, backend error code when
available, content type, and a bounded response preview.

`MagicPayRequestError.errorCode`, `responseText`, and `contentType` are
nullable or empty when the response carried no such data.
`MagicPaySessionStoppedError.status` is always `'canceled'`, and `stoppedAt` is
absent when the backend did not report a stop timestamp. A session stopped
while a waiter is already polling is not thrown: `waitForResult(...)` returns
`{ ok: false, reason: 'canceled' }` instead.

Aborts from your own `AbortSignal` are not MagicPay errors; use
`isMagicPayAbortError(error)` to detect them.

Provider-backed card data requests before payment authorization return a
structured machine state. Branch on the diagnostics/body fields instead of
parsing text:

| Field | Value |
| --- | --- |
| `error_code` | `payment_card_authorization_required` |
| `status` | `authorization_required` |
| `category` | `payment_card` |
| `reason` | `payment_authorization_required` |

Provider-card materialization keeps the existing status union and supplies an
exact machine-readable `reason`:

| Status | Reason | Recovery |
| --- | --- | --- |
| `provider_needs_reauth` | `expired`, `inactive`, `not_found`, `wrong_reservation`, or `reservation_state_changed` | Create a fresh payment authorization, then fetch a new catalog/plan. |
| `not_materializable` | `wrong_session`, or `wrong_reservation` when the handle does not belong to the active grant | Return to the active session and create a fresh authorization if needed. |
| `provider_needs_reauth` | Provider-specific reauth code such as `sdk_user_token_expired` | Complete provider reauthentication, then authorize again. |
| `provider_unavailable` | Provider-specific availability failure | Retry or surface the provider failure; do not collect the card secret. |

These reasons are data, not message fragments. Do not use regex or error-text
matching. Reservation authorization is never renewed implicitly.

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

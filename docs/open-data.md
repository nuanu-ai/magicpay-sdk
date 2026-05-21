# Open Data Matching

Use this guide when your runtime is already driving a browser and the page has
ordinary, non-protected inputs such as name, email, phone, or date of birth.

Open data is different from protected data:

- `profile.facts()` returns reusable public facts without user approval.
- `data.resolve(...)` returns approved protected values such as passwords,
  payment cards, identity documents, or wallet values.
- Open-data matching decides which public fact belongs to which observed
  browser target. It does not request protected values and does not submit the
  page.

## When To Use This Flow

Use open-data matching when all of these are true:

- your runtime has already observed the current browser page;
- you have fillable target descriptors from MagicBrowse or an equivalent
  runtime;
- the fields are not part of a protected login, identity, payment-card, or
  wallet form;
- public facts are enough to fill the fields.

Do not use this flow for passwords, card numbers, CVV, wallet keys, or document
numbers. Use `data.resolve(...)` and the protected-fill bridge for those.

## Runtime Shape

The browser-runtime layer owns four steps:

1. Read open facts with `client.profile.facts()`.
2. Build an `ObservedOpenDataSnapshot`.
3. Match observed targets with `resolveObservedOpenDataTargets(...)`.
4. Fill only `matched` results through the browser primitive your runtime
   already trusts.

The SDK does not fill the browser in this flow. It returns a decision and an
open value. Your runtime decides whether to type it, ask the user, or leave the
field for another strategy.

## Build A Snapshot

`profile.facts()` returns a broad object. The matching helper expects a
snapshot keyed by field name:

```ts
import type { ObservedOpenDataSnapshot } from '@mercuryo-ai/magicpay-sdk/magicbrowse';

const snapshot: ObservedOpenDataSnapshot = {
  valuesByField: {
    email: [
      {
        fieldKey: 'email',
        value: 'user@example.com',
        source: 'profile_facts',
        applicability: { target: 'global' },
      },
    ],
    date_of_birth: [
      {
        fieldKey: 'date_of_birth',
        value: '1991-08-24',
        source: 'profile_facts',
        applicability: { target: 'global' },
      },
    ],
  },
};
```

Use `applicability: { target: 'host', value: 'example.com' }` when a value is
only valid for one host. The matcher receives the current page URL and filters
host-scoped values accordingly.

## Match Observed Targets

```ts
import {
  listObservedOpenDataEligibleTargetRefs,
  resolveObservedOpenDataTargets,
} from '@mercuryo-ai/magicpay-sdk/magicbrowse';

const targetRefs = listObservedOpenDataEligibleTargetRefs({
  targets: observedTargetsByRef,
  protectedForms: observedProtectedForms,
});

const { results } = await resolveObservedOpenDataTargets({
  targets: observedTargetsByRef,
  targetRefs,
  matcherModel: semanticMatcherModel,
  protectedForms: observedProtectedForms,
  snapshot,
  page: { url: 'https://airline.example.com/checkout' },
});
```

`semanticMatcherModel` is the MagicBrowse LLM-first semantic matcher backed by
the gateway `xfast` model. It receives safe target descriptors and candidate
metadata, but not raw protected values. If no matcher model is provided, or the
matcher is unavailable or uncertain, matching fails closed.

`listObservedOpenDataEligibleTargetRefs(...)` filters out targets that should
not receive open data:

- targets already claimed by a protected form;
- password fields;
- card-number, expiration, and CVV autocomplete fields;
- stale or unavailable targets;
- targets that cannot be filled, typed, or selected.

`resolveObservedOpenDataTargets(...)` returns one terminal decision per target:

- `matched` — fill the returned `value` into `targetRef`;
- `ambiguous` — more than one candidate fits; ask the user or narrow the
  snapshot;
- `no_match` — no safe candidate fits; leave the field for another strategy.

The `match` object on a `matched` result is safe to log. It carries refs,
field keys, and confidence, not the raw open value.

## Fill Policy

Open data is not secret, but it is still user data. Prefer this policy:

- fill only `matched` results with `confidence: 'high'` automatically;
- ask the user before filling `medium` confidence matches;
- never auto-fill `ambiguous` results;
- do not mix open-data values and protected values into a single LLM prompt.

For a reusable adapter, see
[`examples/open-data-magicbrowse.ts`](../examples/open-data-magicbrowse.ts).

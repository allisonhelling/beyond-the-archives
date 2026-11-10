# ADR 0003: Keep Hierarchy Crossover Evidence Versioned And Conservative

Status: Accepted (evidence boundary); classifier implementation and ambiguous zero/one rules deferred.

## Context

`model.isCrossover` and SQL `library_crossover` currently count distinct normalized fandom names. Existing plural `crossovers` filters and series member booleans do not implement the proposed `ao3_hierarchy_v1`. The proposal separates native assertions and canonical identity/hierarchy proofs, but its zero/one/no-valid-metadata rows conflict with its conservative unknown requirements.

## Decision

Keep existing runtime behavior in Phase A. A future hierarchy classifier must publish three states, explicit policy/version and evidence revision over owner-effective fandom observations. Only verified AO3 aliases/ancestry support v1; require complete fresh negative closure to prove unrelated components, while positive connected proofs may suffice without full closure. Keep native source assertions and candidate hashtags separate. Preserve unknown for unsupported/unprocessed observations; explicitly settle legacy AO3 zero/one shortcuts before coding rather than treating display defaults as verified absence. See the [truth fixtures](../architecture/source-contracts.md#crossover-evidence-contract).

## Consequences

Allowed accepts all states, Only accepts known crossover, Exclude retains unknown. Future changes must coordinate local/SQL/series/membership/projection semantics and existing payload spelling. A native FF.net assertion or Wattpad hashtag cannot silently alter v1. Negative-evidence expiry needs invalidation even without a successful fetch. No evidence tables/classifier are introduced in A.

## Revisit When

The crossover feature is implemented: resolve the proposal inconsistency, canonical key/parser completeness, freshness limits and series aggregation first. Mixed-source classification requires a separate versioned product decision.

## Phase B1 Approved Decision Addendum

The approved B1 decisions resolve the historical zero/one and freshness questions: verified known-empty or one confirmed fandom with no unresolved candidates is `not_crossover`; missing/unprocessed metadata remains `unknown`. Negative separation proof expires after 30 days without requiring a successful fetch. Positive connectivity can suffice with incomplete closure. Keep plural `crossovers`, Exclude retains unknown, and series match any individual member. Owner-effective overrides and native assertions remain separate from public hierarchy evidence.

A pure policy with synthetic tests now exists; verified fandom profile fixtures, resolver persistence and coordinated projections/expiry fan-out remain blocked. Legacy runtime name-count behavior is unchanged until the whole semantic switch passes its gates. See [Phase B1 Rollout](../architecture/phase-b1-rollout.md). This addendum supersedes the historical unresolved decisions above, not the authority/privacy boundary.

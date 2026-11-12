# ADR 0003: Keep Hierarchy Crossover Evidence Versioned And Conservative

Status: Accepted (evidence boundary); zero/one rules resolved by the B1 addendum. Hierarchy policy and coordinated runtime publication are implemented; hosted rollout is separate.

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

## Identity Foundation Addendum — 11 November 2026

The [guarded foundation](../architecture/crossover-foundation.md) now supplies UUID identities, exact source-qualified mappings, public partial-profile persistence and authenticated bounded fandom resolution. The pure classifier also rejects dangling shared-ancestor endpoints. Upstream template inspection establishes that empty metatag sections are omitted; live profile retrieval returned HTTP 418. Parser v1 cannot establish negative closure and never publishes complete hierarchy evidence. Runtime queries, collections and sample mode retain the legacy policy until verified fixtures and the coordinated projection/expiry pipeline are complete.

## Validated Omission And Runtime Publication — 11 November 2026

The user explicitly approved interpreting intentional omission as no direct metatags after strict complete-profile validation. Parser v2 checks source end tags and the recognized surrounding profile/footer, rejects malformed or unexpected sections, and is covered by checksummed real Wayback fixtures. This supersedes the literal-empty-list gate above. Direct-parent completeness remains separate from ancestor closure; negative proofs still expire after 30 days. A single TypeScript classifier now publishes private observation-set results through existing document/membership/revision boundaries. Only/Exclude use three-state projections everywhere in the organizer. See the [current contract and deployment order](../architecture/crossover-foundation.md); historical reports do not establish hosted deployment or live recovery verification.

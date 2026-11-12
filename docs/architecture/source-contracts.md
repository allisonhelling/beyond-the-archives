# Source Contracts

Status: accepted design vocabulary for Phase A; **not exported runtime types, persisted fields, supported providers, or a new adapter framework**. Existing AO3 payloads remain authoritative at runtime. See [ADR 0001](../adr/0001-source-identity-boundary.md), [ADR 0002](../adr/0002-observation-and-tag-authority.md) and [ADR 0003](../adr/0003-crossover-evidence-policy.md).

The broader proposed types below remain design notation. [Phase 1](../universal-stories/PHASE_1_FOUNDATION.md) implements the narrower, currently consumed `story-source.ts` adapter for namespaced native/URL candidates, legacy provenance and work-export snapshots; it adds no general-source persistence, import authority or provider registry.

## Identity And Capabilities

```ts
// Design notation only. Only AO3 ingestion exists today.
type PlatformId = 'ao3' | 'fanfiction_net' | 'wattpad';
type SourceWorkIdentity = { platform: PlatformId; nativeWorkId: string };
type ApplicationWork = { workId: string; source: SourceWorkIdentity | null };
type SourceCapabilities = {
  categorizedTags: boolean;
  chapterLinks: boolean;
  nativeSeries: boolean;
  nativeCrossoverAssertion: boolean;
};
```

`workId` here is an app-owned UUID, unlike the numeric `WorkIdentity.workId` in the existing AO3 parser and decimal reader `Book.workId`. Never change those legacy meanings in place. An unidentifiable deleted bookmark may have an app work UUID and no source work identity. Its bookmark ID is a separate source reference, not a work ID. An EPUB file hash, anthology member key, private library entry UUID, and app work UUID also remain different identities.

`(platform, nativeWorkId)` is the entire source identity. Preserve native IDs as strings; validate them with the selected source's rules without globally coercing to integers or stripping leading characters. Canonical URLs are source-qualified destinations verified by extraction; normalized URL candidates and original user submission are separate values. A Wayback capture is an acquisition locator for the same AO3 work, not a new fiction platform. Cross-post title/author similarity never merges works.

Capability values must come from a tested adapter and acquisition path. The AO3 HTML extractor supports categorized tags and explicit chapter/series links when present, but successful retrieval and complete metadata are not guaranteed by a capability. Its current extractor does not emit native crossover assertions. No FF.net/Wattpad capability values are asserted here; future research must verify them. Unsupported categories are not known-empty categories. A source may support chapters while a particular browser/file capture cannot verify links.

Design fixtures (no ingestion support implied):

| Fixture | Identity / Label | Required Result |
| --- | --- | --- |
| AO3 work/chapter URL | `{ platform: 'ao3', nativeWorkId: '123' }`, URL `/works/123/chapters/987` | Work identity excludes chapter; preserve original URL and unverified chapter separately. |
| Fixed archive capture of work 123 | Same AO3 tuple plus exact capture locator | Deduplicate with live work; no verified live canonical URL from archive. |
| Conceptual FF.net numeric ID | `{ platform: 'fanfiction_net', nativeWorkId: '123' }` | Distinct from AO3 123, even with identical title/author. Existing AO3 parser rejects its URL. |
| Conceptual Wattpad source label | `{ platform: 'wattpad', nativeWorkId: 'story-opaque-fixture' }` | Opaque design example, not a claim about real Wattpad ID syntax. Must survive normalization without numeric coercion. |
| Deleted AO3 bookmark | App UUID + no work tuple + separate bookmark reference | Retain private notes/history and unknown work identity. Never assign bookmark number as work number. |

## Observations And Normalized Metadata

```ts
type ObservationState = 'known' | 'known_empty' | 'unavailable' | 'unknown';
type SourceObservationProvenance = {
  platform: PlatformId;
  extractionMethod: string;             // e.g. ao3_html, archive_html, epub_review
  extractedAt: string;                   // ISO timestamp of observation
  extractionVersion?: string;
  evidenceLevel: 'verified' | 'source_reported' | 'inferred' | 'user_confirmed';
};
type Observation<T> =
  | { state: 'known'; value: T; provenance: SourceObservationProvenance }
  | { state: 'known_empty'; provenance: SourceObservationProvenance }
  | { state: 'unavailable'; reason: 'unsupported' | 'inaccessible' }
  | { state: 'unknown' };
```

These distinguish epistemic states at a future normalization boundary. They do not reinterpret existing empty arrays or SQL NULLs as proven absence. For collections, `known` contains at least one value; supported explicit absence is `known_empty`; unsupported/login-inaccessible fields are `unavailable`; missing extraction/ambiguous markup is `unknown`. Scalar zero/false can be known values when observed (zero kudos, explicit incomplete status). A failed acquisition is a job outcome, not a replacement metadata observation. Keep usable verified evidence across transient failures with freshness recorded separately.

The minimal normalized observation uses the **existing consumer vocabulary**: title, authors with optional safe profile links, summary/plain and sanitized HTML, language, fandom/relationship/character/additional-tag observations, source-specific rating/warnings/categories, published/total chapter counts, publication state, source dates, verified position-to-native-chapter mapping, optional source-native series memberships, and the source identity/URL/provenance envelope. Each optional field follows `Observation<T>`. This is a field list for adapter output design, not a new universal persisted row. Existing `Metadata`, `AutomaticMetadata`, SQL validation and private override precedence continue unchanged. Do not cast another site's category or age rating into an AO3 enum merely because both are called “rating.”

Preserve raw label, source category/native identifier, source locator and order alongside any app category/mapping. Category conversion happens once at ingestion. Presentation, Boolean evaluation and pagination must not parse provider HTML or fetch evidence. Manual metadata corrections stay owner-private and override automatic observations; refresh does not promote user corrections to shared facts. `known_empty` handling requires explicit preservation tests because current `nonempty_ao3_metadata` intentionally strips some empty collections.

## Matcher Input And Authority Boundary

Proposed minimum logical matcher input:

```ts
type AppTagCategory = 'fandom' | 'relationship' | 'character' | 'additional';
type TagObservation = {
  source: SourceWorkIdentity;
  rawCategory: string;                  // Preserve provider vocabulary before mapping.
  category: AppTagCategory;
  rawLabel: string;
  nativeTagId?: string;
  sourceOrder: number;                 // Preserve extraction order.
  sourceLocator: string;
  provenance: SourceObservationProvenance;
  // Present only after verified identity mapping, never just label similarity.
  canonical?: { authority: 'ao3'; category: AppTagCategory; key: string; evidenceRevision: string };
};
```

Private personal tags are a separate owner-scoped input, never `canonical` source tags. Distinguish app `additional` from AO3 `freeform` at the normalization boundary. AO3 canonical identity, verified synonym and related metatag are three different concepts. Current `TagResolution.canonical_name` is AO3 profile evidence; a future stable mapping key needs its own verified identity contract, not a blind rename of the label.

Expression evaluation receives normalized category observations, validated selection/group structure, and an authority-scoped alias index. Provider decoding/verification occurs before evaluation. Default fandom Any and other category All must preserve existing results; categories combine with AND; Custom is OR-of-AND groups initially enabled only for fandom. Empty overall expression means no constraint; malformed/empty groups need proposal-defined validation before persistence. Keep legacy comma-separated strings and fandom arrays readable; do not accidentally replace the `within` search expression parser with the tag engine.

| Truth Fixture | Expected Matcher Decision |
| --- | --- |
| AO3 canonical selection; saved verified synonym, same category | Match exact verified alias set. |
| AO3 canonical selection; “Protective [Canonical Name]” only | No alias match from substring. |
| Unverified partial text selection | Current normalized substring behavior, no claim of verification. |
| Same spelling in relationship and character | No cross-category alias inheritance. |
| FF.net/Wattpad label identical to an AO3 canonical/synonym, no mapping | Raw matching may match text; **must not acquire AO3 verification or canonical expansion**. |
| Personal tag identical to source tag | Only personal-tag predicate applies; no source evidence created. |
| Fandom Any `[A,B]`, observed `[A]` | True; All false; Custom `[[A,B],[C]]` false. |
| Custom `[[A,B],[C]]`, observed `[A,B]` or `[C]` | True; observed `[A]` false. |
| Failed refresh of a verified alias | Retain verified mapping; timestamps alone do not change matches. |
| Alias record with absent or wrong-category canonical root | TS and SQL both use raw fallback; no verified synonym expansion. Implemented by B1 and rechecked by B1-R. |

The observation types above remain design notation, not accepted import payloads. Current executable coverage: `tags/tag-resolution.test.ts`, `server/ao3/tag-resolution.test.ts`, `supabase/tests/canonical-tags.test.ts`, `reading-search.test.ts`, series/automatic-collection tests. B1-R exercises synthetic source-qualified collisions through the existing pure matcher: `tagMatches` requires explicit `authority: 'ao3' | null`; null disables aliases but retains raw text matching. `TagResolution` and `TagAliases` remain AO3-only, owner-scoped cache contracts. Current `filterReading` explicitly supplies AO3 authority for its existing AO3 effective metadata and owner corrections. It is not a multi-provider observation adapter; a future foreign record must not enter that path with an unqualified alias index. See the [current boundary inventory](filter-source-readiness.md).

At a future adapter boundary, qualify native tag identity by `(platform, rawCategory, nativeTagId)` and retain raw label/order even when no native ID exists. The same native ID or label from two platforms never establishes equivalence. Record capture method/time/extraction version and trust level before producing a normalized category. AO3 `freeform` maps to application `additional` upstream; today's legacy filter key `tags` and cache key `freeform` are unchanged. Missing, failed, unsupported and explicitly verified empty inputs must remain distinguishable before existing lossy validation/display paths. A future known-empty fandom update requires a reviewed persistence contract; today's `[]`/NULL cannot supply that evidence.

## Crossover Evidence Contract

Design result: `{ status: 'crossover' | 'not_crossover' | 'unknown', policy: 'ao3_hierarchy_v1', classifierVersion, evidenceRevision }`. This is a proposed owner-effective projection, not an existing column. Keep a separate nullable source-native assertion with source, method and time. A true native FF.net assertion does not prove AO3 ancestry; a Wattpad hashtag remains a candidate unless verified or explicitly mapped. Never create a canonical fandom identity solely from spelling.

Inputs must preserve source fandom observations, authority-qualified identity mappings, verified AO3 canonical aliases and directed metatag edges, closure completeness, parser version and evidence freshness. Work UUID alone is insufficient for private overrides: compute over the effective fandom set for the owner/entry. Share public AO3 facts only if no private lookup/membership information leaks. Reject/tolerate cycles deterministically, bound ancestor traversal, and replace edge snapshots only after complete successful parsing.

| Evidence Fixture | Proposed Result |
| --- | --- |
| One confirmed effective fandom, no unresolved candidates | `not_crossover`. |
| Two verified aliases of one canonical fandom | `not_crossover`. |
| Ancestor/descendant or shared verified ancestor | `not_crossover` when all effective fandoms connected. |
| A–B related and B–C related | One connected family, `not_crossover`, even if A–C lack a direct proof. |
| Two disjoint components, all needed identities/closures complete and fresh | `crossover`. |
| A–B related, C unresolved; missing/failed/ambiguous closure | `unknown`, never default false. |
| Positive connected proof, some closure incomplete | `not_crossover` if every effective fandom is accounted for. |
| Disjoint components with expired negative closure | `unknown`; stale positive edges can remain usable unless contradicted. Approved negative maximum age is 30 days; authentic parser fixtures remain deferred. |
| Native source assertion only / unmapped hashtag candidate | `unknown` under v1; assertion retained separately. |
| Explicit supported known-empty fandom set | `not_crossover` under proposed AO3 zero/one policy. |
| Absent/unsupported/unprocessed fandom set | Preserve `unknown` observation; do not invent known-empty. See the approved B1 decision below. |

The approved B1 decision resolves the original proposal inconsistency: verified known-empty or one confirmed effective identity without unresolved candidates is `not_crossover`; absent, unsupported or unprocessed observations remain `unknown`. Negative separation evidence expires at 30 days. These semantics are implemented only in the isolated pure policy and synthetic fixtures; runtime filters retain legacy name-count behavior, plural `crossovers` and any-member series semantics. See [ADR 0003's approved addendum](../adr/0003-crossover-evidence-policy.md#phase-b1-approved-decision-addendum).

Future adapter-to-policy mapping must first apply owner overrides, then map each confirmed observation to an opaque `ConfirmedFandom` key with verified AO3 authority. Unmapped candidates set `unresolved`; unsupported/missing observations yield `unavailable`/`unknown`; `known_empty.verified` requires explicit supported absence evidence. Identity-equivalent synonyms collapse to one key. Related fandoms retain distinct keys and contribute only separately verified AO3 parent edges in `FandomSnapshot`. Capture native assertions separately with source identity and provenance; they are not classifier arguments. No label normalization, user-confirmed mapping alone, foreign taxonomy edge or native assertion establishes AO3 verification. The adapter must retain provenance outside the compact policy input so evidence revisions remain traceable; these are future requirements, not existing persisted fields.

Allowed includes all states; Only includes known crossover; Exclude retains unknown. Evidence and classifier revisions must be consistent across page results, exact counts, series and automatic collections. A filter must never fetch hierarchy data per row.

## Invariants And Verification Locations

| Invariant | Current Test Or Required Planned Test |
| --- | --- |
| Stable app UUID vs source tuple; no cross-post merge | `supabase/tests/library.test.ts`, `safe-edits.test.ts`; tuple fixtures above; P1 collision/migration test. |
| String source IDs remain source-qualified | Design fixtures above; P1 claims/export/reader tests before storage change. |
| Original, candidate canonical, verified canonical differ | `urls.test.ts`, `supabase/tests/wayback-imports.test.ts`, `library.test.ts`; CSV/work export regression. |
| Unknown never fabricates empty/false | `server/ao3/adapter.test.ts`, `imports/epub.test.ts`; planned classifier table above. |
| Automatic refresh preserves private overrides | `supabase/tests/repeat-import-repairs.test.ts`, `wayback-imports.test.ts`, backup restore tests. |
| Verified AO3 tags never confer cross-source authority | Current resolver/category tests; explicit unmapped-source fixture above; P0 authority-boundary test required. |
| Native assertion differs from hierarchy result | Crossover truth fixtures above; future classifier contract test. |
| Chapter position differs from native ID | `model.test.ts`, `server/ao3/adapter.test.ts`, `reader/tests/epub-links.test.ts`, chapter-history SQL tests. |
| Source changes do not bypass private ownership | `foundation.test.ts`, `safe-edits.test.ts`, `canonical-tags.test.ts`, `account-backup-restore.test.ts`. |
| Effective predicates and revisions stay aligned | `library-query.test.ts`, `library-series.test.ts`, `automatic-collections.test.ts`, `LibraryProvider.test.tsx`; 10,000-work benchmark required after Phase B query changes. |

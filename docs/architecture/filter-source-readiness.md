# Filter Source Readiness — Phase B1-R

Assessment date: **10 November 2026**. Scope: R0–R6 of the workspace's `to_implement/PHASE_B1R_MULTIPLATFORM_FILTER_ARCHITECTURE_READINESS.md`. This assessment verifies extension boundaries; it does not ship another provider or hierarchy filtering. Accepted vocabulary lives in [source contracts](source-contracts.md), current SQL ordering in [source data flow](source-data-flow.md), and outstanding B1 product release gates in [Phase B1 Rollout](phase-b1-rollout.md). Historical Phase A inventory/backlog statements describe their original baseline.

## R0: Actual Baseline And Readiness Matrix

The starting tree had five unrelated modifications: `docs/REMOVE_DIRECT_RETRIEVAL.md`, `scripts/test-supabase.mjs`, `tests/e2e/display-settings.spec.ts`, `tests/e2e/dnf-cleanup.spec.ts`, and `tests/e2e/responsive-layouts.spec.ts`. They were preserved. B1 expressions, controls, canonical-root parity and pure crossover policy were already tracked; no second implementation was needed.

| Boundary / Files And Functions | Baseline Status | B1-R Action / Deferred Work |
| --- | --- | --- |
| `tags/tag-resolution.ts`: `verifiedTags`, `tagAliasIndex`, `tagMatches` | Already satisfied: category-correct verified root, exact canonical alias set, raw substring fallback. Change now: authority default was implicit. | Require explicit AO3/null authority; document AO3-only resolution/index payloads; test source-qualified collisions. No serialized field added. |
| `reading-search.ts`: `filterReading`, `model.ts`: `tagNames` | Already satisfied: effective categories, distinct personal tags and unclassified tags; shared expressions. | Three alias calls now explicitly assert the current AO3-only path. Foreign observations need a future upstream verified mapping boundary. |
| `tags/tag-expressions.ts`: `matchesTagExpression`, normalization/conversion | Already satisfied: category-neutral callback evaluator; Any/All/Custom, inactive empty groups. | Import shared search normalization directly, without depending on the AO3 cache module. No UI/mode/conversion change. |
| `useTagResolutions`, server AO3 resolver, `library_tag_aliases` | Already satisfied: AO3 profile/category verification and private per-owner cache; browser cannot write verification. | Verify existing isolation tests; retain cache schema and access policy. |
| SQL `library_tag_groups_match`, `library_filter`, `library_alias_filters`, `query_library` | Already satisfied: expressions before count/page selection, trusted owner alias preparation, unknown category cannot inherit freeform aliases. | Replayed active definitions and added SQL regression fixtures; no SQL edits. |
| `series/series-search.ts`: `filterLibraryItems`; `collections/automatic-collections.ts`: `applyAutomaticCollections` | Already satisfied: reuse `filterReading`; series categorical unions, legacy any-member crossover; SQL shares predicate/memberships. | Preserve and rerun relevant regressions. |
| `AutomaticMetadata`, `validateMetadata`, `effectiveWork`/`effectiveMetadata`, `nonempty_ao3_metadata`, EPUB recovery | Already satisfied: private override precedence. Design gap: four observation states are not persisted. | Add executable omission/empty/private override tests; document lossy boundaries. Defer global state migration. |
| `fandoms/crossover-evidence.ts`: `classifyCrossover` | Already satisfied: pure, versioned, authority-qualified synthetic policy; no runtime consumer. | Add foreign identity/edge collision fixtures; retain implementation. Defer real evidence/resolver and runtime cutover. |
| Search documents, stored projectors, memberships, owner/revision caches | Already satisfied: existing integration seam. | Record resolved field selection and future fan-out/expiry gates below; no new trigger/job/projection. |
| Source identity persistence, provider imports, backups/reader/companions | Deferred: first additional provider work. | Preserve AO3 contracts/allowlists and existing formats; no new supported site. |

The complete local chain has **123 migrations**, ending in `20261109000300_extension_only_retrieval.sql`; B1's expression migration is present at `20261109000200_tag_expressions.sql`. Disposable PGlite replay resolved **164 public functions** and three public views. Read the final `pg_get_functiondef`/view definitions, including dynamically patched bodies, rather than relying on original CREATE statements. Generated types were regenerated from this chain and have no diff. These local results do not establish deployed migration/function/type parity. No hosted schema inspection, production access, deployment or reset was performed; deployed status remains unverified.

## R1–R2: Current Authority And Matching Routes

AO3 categorized HTML is extracted in `imports/ao3-metadata.ts`: `extractWorkMetadata`; `freeform` becomes the existing application metadata field `additional_tags`. `model.ts` overlays shared automatic metadata, owner-private extension/archive observations, then manual corrections. `tagNames` reads only categorized arrays; legacy `ao3_tags` never becomes a character/relationship/additional observation by inference.

The trusted `tag-resolution` endpoint uses `server/ao3/tag-resolution.ts` profile verification and `store_tag_resolutions` to populate `ao3_tag_resolutions`. `useTagResolutions` reads its account-paginated cache for suggestions and ordering; it does **not** inject an alias index into local results. Its records and `tagAliasIndex` are explicitly AO3-only contracts, not generic provider records. Root verification uses the same category and exact root name before normalized alias lookup. Related metatags are never synonym evidence.

Exact alias expansion happens at three calls in `filterReading`: relationship, character, freeform/additional. Each now passes `'ao3'` explicitly. `tagMatches(..., null)` ignores even a populated alias index and keeps raw substring matching. The shared Boolean engine receives a tag predicate and knows no parser, network function, source URL or native ID. Fandom selections retain existing exact-label matching without a fandom alias cache; personal tags use their independent raw predicate.

Current `filterReading` accepts AO3 effective metadata/owner corrections, including reviewed manual/EPUB recovery. It cannot represent mixed-source authority per observation, and its explicit AO3 argument must not be reused blindly for foreign records. Synthetic FF.net/Wattpad observations instead exercise `tagMatches` with null authority through the same Any/All/Custom callback evaluator. Matching identical text is allowed without granting canonical identity. A future adapter must preserve source identity/provenance and establish both observation and selection mapping/category before enabling AO3 expansion; platform or label alone is insufficient for cross-site mappings. No foreign URL or payload is newly accepted.

Series matching calls `filterReading` on merged effective categorical metadata after evaluating member-specific crossover/rating/one-shot conditions. Automatic collections call the same predicate. `ReadingDashboard` uses local evaluation for sample/retained offline results and the existing repository RPC for normal pages. Optional prevalidated `tagAliases` are supported by the local matcher and SQL parity tests; ordinary sample/offline evaluation without evidence keeps raw fallback. No alias fetching was added to these paths.

SQL page preparation uses `library_alias_filters` → `library_tag_aliases(auth.uid())`, then `library_filter` → `library_tag_groups_match` → `library_tag_matches`. The alias query joins a same-owner, same-category canonical root under invoker RLS. `query_library` removes caller `tagAliases` and `tagGroups`; internal automatic rules use `library_alias_rules` and trusted owner preparation. SQL's category allowlist maps only `relationship_tags`, `character_tags`, `additional_tags`; personal/unknown categories cannot borrow freeform aliases. The entire current SQL document path is AO3-only. A second provider requires an additive trusted observation/mapping boundary before it may use these aliases; no source column is invented here.

## R3: Observation And Provenance Limits

The non-lossy future contract is maintained once in [source contracts](source-contracts.md#observations-and-normalized-metadata). It includes qualified work/tag identity, raw category/label/native ID/order/locator, normalized application category, observation state, method/time/extraction version and trust level. It is design-only because no current runtime consumer can safely persist all these states.

| Current Boundary | Actual Behavior / Future Requirement |
| --- | --- |
| `extractWorkMetadata` / `AutomaticMetadata` | Absent category stays omitted; present category markup may produce `[]`. Neither alone proves verified absence. |
| `server/ao3/metadata-service.ts`: `validateMetadata` | Drops empty ordinary collections; preserves zero statistics and meaningful false completion. Acquisition failure returns no replacement metadata. Retain provenance/states before this lossy boundary in a future adapter. |
| SQL `nonempty_ao3_metadata` | Drops NULL/empty arrays/objects/blank strings. Exception: `series_checked=true` preserves explicit empty series/memberships. This is not a general known-empty fandom representation. |
| Private extension/archive/listing observations | Overlay shared source metadata privately; successful refresh preserves owner manual corrections. No promotion of owner assertions to shared AO3 evidence. |
| `effectiveMetadata` / `library_story_documents` | Defaults missing category arrays for rendering; manual arrays, including `fandoms: []`, win. Display defaults must never be used as verified source observations. |
| `imports/epub.ts`: `readEpub` | Uses nonempty metadata and removes empty default fields so recovery does not erase saved editor data. Reviewed local recovery is not shared AO3 verification. |

Future unsupported categories are `unavailable`; missing/unprocessed/ambiguous extraction is `unknown`; known nonempty and explicitly verified known-empty require provenance. A failed fetch preserves prior usable observations and records failure separately. Today's arrays/NULLs cannot be retroactively classified into those states. No production state type, schema or global default is added solely for hypothetical consumers.

## R4: Isolated Future Policy

`classifyCrossover` consumes `FandomObservation` and authority-qualified `FandomSnapshot`/`CrossoverEvidence`, returning status, `ao3_hierarchy_v1`, classifier version 1 and evidence revision. Only tests import it; runtime `isCrossover`/`library_crossover` remain normalized name-count booleans. There is no resolver, hierarchy cache, classification column, selector or backfill.

The [contract mapping](source-contracts.md#crossover-evidence-contract) keeps same identity, directed related-fandom edges, unresolved candidates and native assertions separate. Future acquisition must retain source/provenance outside the compact graph input and produce verified opaque AO3 keys after owner overrides. Synthetic keys are not proof of a real AO3 identifier or HTML format. Native FF.net assertions and Wattpad candidates confer no AO3 edge/identity authority.

Existing pure fixtures cover verified empty/single identity → not_crossover; missing/unsupported/unprocessed → unknown; full verified connectivity → not_crossover; complete fresh disjoint closures → crossover; incomplete or expired negative proof → unknown; 30-day expiry, cycles, duplicate conflicts and bounds. Added foreign authority collisions protect identity and edge namespaces. Future Exclude retains unknowns. Current plural `crossovers`, saved/default URL state and series any-member boolean semantics remain unchanged.

## R5: Verified Projection Integration Checklist

The current order is `library_story_documents` → `refresh_library_documents` (or deferred ID accumulation and `flush_library_documents`) → `library_search_documents.story` → index/generated stored projectors → `sync_library_query_state` → owner revisions/automatic memberships → query/navigation/series/facet caches. See [migration ownership and ordering](source-data-flow.md#active-sql-and-projection-map).

| Resolved Function / Field | What A Later Classifier Must Coordinate |
| --- | --- |
| `library_story_documents` | Uses shared + private extension automatic observations, then owner overrides; deleted availability wins last. Classify the effective owner's fandom set, not the shared work alone. |
| `refresh_library_documents` / `flush_library_documents` | Rebuild changed entry documents in existing bounded batches. Deferred flush controls do not provide shared-evidence fan-out by themselves. |
| `index_library_document` | Maintains reading/index/sort fields from story. Do not add hierarchy traversal to per-row indexing or page queries. |
| `library_series_input` → stored `series_story` | Explicit top-level selection; metadata retained except summary HTML/chapter dates; compact work identity/date only. New top-level status/policy/evidence fields would be lost unless selected. Preserve member-level policy semantics in series merging. |
| `library_catalog_story` → stored `catalog_story` | Explicit minimal metadata: title/authors/fandoms/series/memberships/publication. Omits general classified tags and future status fields; coordinate catalog/retained representations deliberately. |
| `library_facet_document` → stored `facet_story` | Explicit authors and three categorized arrays/fandoms plus private scope fields. New status must be deliberately retained only if needed. Facets remain scoped suggestions, not current filtered-result counts. |
| `sync_library_query_state`, `invalidate_library_queries`, `refresh_automatic_memberships` | Document changes refresh affected entry membership; rule changes refresh affected collections; semantic tag evidence changes refresh owner memberships, while timestamp-only changes skip invalidation. A future shared-evidence revision needs affected-work/owner fan-out and coordinated status/membership/revision publication. |
| `library_query_matches`, `library_cached_series`, `library_query_facets`, navigation snapshots | Same owner/revision boundary must govern pages, counts, sorting/groups, author/series scopes, navigation and collections. Rebuild stored fields before publishing matching revisions. |
| `LibraryProvider`: `acceptRevision`, page/facet caches, `checkRevision`; `useLibraryResults` | Reject stale responses; trigger mounted-client refresh and reconcile retained/offline snapshots. Existing AO3 tag events are owner-qualified; a shared table update alone does not notify every affected client. |

A later implementation must add policy/status/evidence revision together; identify affected owner-effective entries when public mappings/relationships change; process bounded retryable fan-out; and downgrade stale negative proofs without a successful source fetch. Preserve private overrides during retries. Public evidence stores public facts only; work-observation mappings, requests and derived statuses remain owner-private. Test trusted writes, direct grants/RLS, definer owner derivation and two-owner isolation. No new queue, trigger, revision field or expensive join is implemented in readiness.

Release gates for that later feature include authentic hierarchy parser fixtures, complete-vs-partial/empty evidence tests, populated upgrades/backfills, two-owner override/evidence/expiry fan-out, cross-surface count/page/membership parity, hosted Auth/PostgREST/RLS checks and real 10,000-work cold/warm/concurrent plans. Reuse existing revisions; do not create a second query/cache pipeline.

## R6: Verification And Handoff

Baseline focused command: `npx vitest run src/features/library/tags src/features/library/reading-search.test.ts src/features/library/fandoms supabase/tests/canonical-tags.test.ts` — **6 files / 91 tests passed** before edits.

README was reviewed; supported features and local run instructions are unchanged, so it needs no edit. IMPLEMENTATION and PROJECT_OVERVIEW link the current boundary assessment. No ADR decision changed, and no new ADR was created.

| Final Command / Check | Outcome |
| --- | --- |
| `npm run check` | Passed: ESLint, TypeScript/Vite build, **170 files / 1,949 tests**, seven integration-configuration tests and security canaries. Includes search/series/collections/defaults/sample/offline unit and embedded owner-scope suites. Existing bundle-size, jsdom scrollTo and Node localstorage warnings remain nonfatal. |
| `npx vitest run src/features/library/tags src/features/library/reading-search.test.ts src/features/library/model.test.ts src/features/library/fandoms server/ao3/adapter.test.ts supabase/tests/canonical-tags.test.ts` | Passed: **8 files / 164 tests**. |
| `npx vitest run supabase/tests/canonical-tags.test.ts` | Final rerun passed: **14 tests**, after moving the forged-input assertion before clearing categorized values so it detects an actual attempted match. Runtime code did not change after the complete check. |
| Disposable `createTestDatabase` replay and resolved-definition inspection | Passed all **123 ordered migrations**; inspected active matching, projection, membership, revision and observation functions/views. No persistent database touched. |
| `npm run db:types:embedded` | Passed; generated `src/types/database.ts` unchanged. |
| `npx playwright test --config playwright.offline.config.ts` | Passed **2 tests** against the production build from `check`: cached cold start, retained filtering/Custom Apply/reload/Clear and uncached-start failure. First attempt could not bind localhost under the sandbox; permitted retry passed. |
| `git diff --check`; architecture relative-link and ordered-ledger checks | Passed; all 123 ledger entries match migration filenames. |
| Full local Supabase/PostgREST, `db:lint`, hosted schema/security, real concurrent performance and full browser/mobile matrix | Not executed; unverified. Existing B1 release gates remain open. No SQL was modified. |

An initial observation test assumed validation retained empty lists; inspection showed it intentionally drops them, and the corrected test now protects both extraction and validation behavior. An initial `check` stopped on a test-only JSON/object type mismatch, corrected before the successful full run. No failed attempt is counted as a passing gate. PGlite executes actual ordered SQL with minimal Auth/Storage contracts; it is not full local Supabase, PostgREST, hosted security or concurrent PostgreSQL validation.

Changed production files: `src/features/library/tags/tag-resolution.ts`, `tags/tag-expressions.ts` and `reading-search.ts`. Regression additions extend the existing tag-resolution, reading-search, model, crossover-evidence, server adapter and canonical-tags SQL tests. Documentation changes comprise this assessment, source-contracts, source-data-flow, IMPLEMENTATION and PROJECT_OVERVIEW. No dependency, UI/style, generated schema type or migration changed. The five initial unrelated modifications remain intact.

## Acceptance Evidence

| Requirement | Result / Evidence |
| --- | --- |
| A1: Authority | Explicit TS authority at all three alias calls; SQL AO3-only owner/category cache, trusted public preparation; foreign/personal collision tests. |
| A2: Root Parity | Existing TS/actual SQL incomplete-root and wrong-category fixtures pass with raw fallback. |
| A3: Neutral Evaluator | One callback Boolean evaluator; direct shared normalization import; no provider parser/network dependency. |
| A4: Qualified Identity | Design contract retains platform/category/native ID; synthetic equal-label/equal-ID fixtures gain no foreign AO3 authority. Persistence deferred. |
| A5: Uncertainty | Extraction/validation/SQL/display loss points documented and tested; future four-state envelope is design-only. |
| A6: Policy Separation | Inactive versioned policy consumes verified identity/edge evidence; foreign identities/edges and native assertions cannot establish AO3 proof. |
| A7: Compatibility | Legacy runtime crossover, defaults, saved fields, series any-member behavior, sample/offline and external formats preserved. |
| A8: Integration | Resolved projector fields and membership/revision/fan-out/expiry checklist above; documentation only. |
| A9: Verification | Baseline, focused actual SQL/TS, complete checks and browser outcomes recorded in R6; hosted gates remain unverified. |
| A10: Scope | No migration, provider, hierarchy resolver/schema, runtime classifier cutover or production operation. |

## Readiness Verdict

The implementation reuses B1 matching and the existing private projection architecture. Synthetic source-qualified observations can use the shared Boolean evaluator with raw matching while being denied AO3 alias authority. Four-state observation and policy-adapter requirements are documented without claiming persistence support. The future classifier can attach through the verified projection/revision seam; evidence acquisition, mappings, storage, fan-out and expiry remain substantial later feature work.

This is an architecture-readiness result, **not production release approval**. The B1 expression migration's hosted integration/lint/concurrent performance gates remain unresolved; historical embedded performance includes slow cold scans. First additional provider work must establish real source capabilities, qualified persistence, trusted imports and compatible backup/reader/companion protocols before admitting foreign records. No production operation or later product feature was performed.

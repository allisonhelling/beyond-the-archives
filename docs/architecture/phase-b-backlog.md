# Phase B Backlog And Phase A Verification

Status: Phase A completed as a repository readiness audit, design contracts, ADRs and focused regression additions. **No Phase B implementation is included.** Ranking distinguishes dependencies of the planned tag/hierarchy features from work needed only when a second fiction source is selected. Entries reference the [inventory](source-assumptions.md), [contracts](source-contracts.md), [SQL map](source-data-flow.md) and [compatibility matrix](source-compatibility.md).

## P0: Before Planned Tag Or Hierarchy-Crossover Merge

| Rank / Item | Evidence / Smallest Scoped Work | Regression And Rollout Gate | Why It Cannot Be Deferred Past The Feature |
| --- | --- | --- | --- |
| 1 / Settle Classifier Semantics | I13: current `isCrossover`/`library_crossover` is name-count boolean. Resolve proposal zero/one/missing contradiction, existing plural `crossovers` key, and series any-member semantics; define policy/version and stale-negative expiry. Follow ADR 0003. | Approve truth fixtures for unsupported/empty/unknown, aliases, ancestor/shared ancestor, transitive bridge, disjoint complete closure, cycles, partial ancestry, expiry and native assertion isolation. Keep current filter behavior until coordinated switch. | Otherwise the same filter label silently changes meaning, or missing data becomes false certainty. This is the principal crossover design blocker. |
| 2 / Define Matcher Authority And Expression Boundary | I12: `tags/tag-resolution.ts`, `reading-search.ts`, `series/series-search.ts`, `collections/automatic-collections.ts`, SQL `library_tag_matches`/`library_filter`/alias helpers; app categories normalized at ingestion, shared Any/All/Custom shape, existing defaults maintained. | SQL/TS truth-table parity, raw substring vs canonical exact synonym, unmapped foreign label, personal/category isolation, incomplete cache root case. Extend existing tests; do not build a provider registry. Additive SQL required only when implementing expressions. | Label-only aliases assume AO3; new expressions must not bake that assumption into a universal matcher. Missing canonical-root behavior already differs between TS and SQL and needs an explicit contract/test. |
| 3 / Carry Filter State Through Existing Consumers | I11–I15: `ReadingFilters`, `browsing/browsing.ts`, `filter-defaults.ts`, draft controls, repository query/facet scopes, LibraryProvider caches, SQL collection validator/series merger. Extend current serializations, preserve legacy arrays/comma strings, category defaults and Apply behavior. | Any/All conversion, Custom restoration, URL reload/malformed input, saved defaults, Clear, Currently Reading/author/series/sample/offline/automatic collections. Include normalized expression in matching cache identity; preserve intentionally scoped facets. | A UI-only or page-only implementation produces wrong counts, memberships and stale cache hits. No parallel editor/query pipeline is needed. |
| 4 / Design Minimal AO3 Fandom Evidence Resolver | I12/I13: existing resolver handles only relationship/character/freeform; no fandom closure cache/mapping exists. Design verified canonical identity + app-owned concept association, source-qualified mappings, explicit edges/completeness/parser version with bounded traversal. Select stable canonical key from captured fixtures, not guessed URL spelling. | Fixture-backed resolver identity/category/edge parsing, complete-vs-partial snapshots, renamed/rewrangled tags, failure retention, traversal limits/cycles, 30-day negative freshness decision. Trusted writes only; no private lookup/membership leakage in shared facts. Schema proposal/review and generated types are prerequisites to later implementation. | Hierarchy classifier cannot be correct using the current non-fandom synonym resolver or raw fandom counts. This is an implementation dependency, not something Phase A has supplied. |
| 5 / Project Classification And Invalidate Consistently | I14: effective documents → stored series/catalog/facet projectors → `sync_library_query_state` → revisions/memberships → caches. Add only classifier/evidence inputs actually needed; use owner-effective fandom overrides, affected-fandom fan-out and expiry invalidation. | RLS/definer owner tests; same status/version for page/count/navigation/series/automatic membership; override refresh; public evidence update across two owners; stale response rejection and mounted-client refresh. Additive migration/backfill unknown, then resolver/projector, then UI; rebuild generated types. | Updating displayed status without projections/revisions leaves stale or contradictory results. Negative evidence can expire without a new fetch. |
| 6 / Measure And Release The Changed Query Path | Existing `library_query_work_sql`, `library_query_pool`, `library_cached_series`, `library_query_facets`, membership triggers and performance scripts. Preserve unfiltered fast path and compact projected payloads. | Ordered real migrations, DB lint, actual PostgREST read/write volatility, large-library 10,000-work cold/warm/concurrent measurements, pagination/counts/collection/series parity and browser desktop/mobile/offline checks. Record plans and deployed version; no reset. | TypeScript success alone cannot validate SQL trigger cost, hosted timeouts or service-role/RLS behavior. Required before shipping changes to these paths. |

## P1: Before The First Additional Source

| Rank / Item | Exact Extension Surface And Evidence | Required Tests / Migration And Compatibility Gate |
| --- | --- | --- |
| 7 / Source-Qualified Persistence | I01–I05/I19: `works`, canonical constraint, save/undo/account/admin restore, import items/jobs, native-ID dedup; retain app UUIDs and null deleted bookmarks. Decide narrow columns vs relation from one real provider. | Same numeric ID across sources distinct; opaque string ID; immutable edits; UUID/FK preservation; owner-scoped saves; AO3 v1 backup/restore; trusted canonical verification. Reviewed additive migration and generated type regeneration before allowing new URLs. |
| 8 / One Source Vertical Slice | I04–I08: URL recognition → retrieval/extraction → normalization → existing JobStore/finish; direct/browser/CSV/file capabilities separate. Research supported acquisition and error states before coding. | Source fixtures, redirects/identity proof, unsupported/auth/unavailable/rate-limit/parse/transient failures, no missing-to-empty conversions; provider pacing and lease fencing; trusted writes and override precedence. Version claim envelope first, then SQL/service writers, frontend/companion release. No provider choice/integration in A. |
| 9 / External Formats And Companion Negotiation | I18/I19 and compatibility matrix: existing version-1 backups/JSON, CSV columns, AO3 message names/device RPC bigint. Add source-qualified fields/versioned readers without reinterpreting old IDs. | Old AO3 artifacts/messages remain valid, unsupported new versions fail clearly, paired secrets/owner boundaries preserved, old companion/new server and new companion/old server cases; safety-copy and admin-vs-private restore tests. Update deployment documentation before emitting new formats. |
| 10 / Reader And History Associations | I10/I16/I17: `savedWorkIdentity`, `readerWorkIdentities`, `reader/src/import-books.ts`, `epub.ts`, `sync.ts`, IndexedDB/cloud queues, stats and DNF keys. Keep book hashes/chapter keys stable. | Versioned legacy AO3 association/queue decoding, ambiguous anthology members, same number across sources, standalone EPUBs, account baselines, offline reports, unchanged completed/history IDs and archived stats dedup. Additive protocol/storage migration only when needed. |
| 11 / Shared Presentation Capabilities | I09/I11/I15: existing StoryForm, metadata display, author/profile/archive/chapter/series actions, sample/offline projections. Configure shared controls for verified capabilities. | No AO3 URL invented for another source; unsupported fields remain unknown; manual/private overrides retained; responsive shared UI, sample/offline parity and export labels. No duplicated source-specific tile/form implementation. |

P1 is a readiness checklist for a later provider implementation phase, not authorization to start it as part of Phase B boundary work.

## P2: Explicitly Deferred

Generic plugin/adapter registries, a universal fandom/tag ontology, all-provider completeness schema, cross-post merging, guessed provider capabilities, new platform selectors, and broad reader/import/search rewrites have no demonstrated Phase A consumer. Revisit only with a concrete vertical slice or measured defect. A future mixed-source crossover policy requires a distinct version and product semantics. Do not present either planned provider as supported.

## Phase A Regression Coverage

| Required Scenario | Executable Coverage Or Design Fixture |
| --- | --- |
| Cross-platform ID collision | Added two foreign-URL rejection regressions in `imports/urls.test.ts`; conceptual tuple/opaque-ID fixtures in contracts. New persisted namespace collision test waits for a real persistence boundary. |
| AO3 work/chapter/Wayback/invalid/original links | Existing `urls.test.ts`, adapter/Wayback tests and SQL `wayback-imports.test.ts`; new archive export regression. |
| Manual/deleted/EPUB missing metadata | `StoryForm.test.tsx`, `imports/epub.test.ts`, adapter partial tests, `deleted-bookmarks.test.ts`. |
| Save/restore owner, canonical/original and immutable identity | SQL `library.test.ts`, `safe-edits.test.ts`, `foundation.test.ts`, `account-backup-restore.test.ts`. |
| Canonical/synonym vs raw substring | `tags/tag-resolution.test.ts`, server resolver tests, `canonical-tags.test.ts`; explicit foreign-authority and missing-root fixtures documented for P0. |
| Unknown/proven crossover and isolated source assertion | Design truth table only: hierarchy classifier does not exist. Current name-count behavior is covered by reading/series/collection SQL/local tests. No test pretends proposed hierarchy logic is implemented. |
| Work identity vs chapter position/history | `model.test.ts`, chapter-history/reading-stats SQL tests, reader `epub-links.test.ts` and `reader.test.ts`. |
| Old exports/backups/sample/messages | Existing backup/sample/companion/build tests plus new two-case JSON/CSV identity/URL preservation test in `backups/csv-export.test.ts`. |
| Pagination, series, memberships/count/revision/cache | SQL `library-query.test.ts`, `library-series.test.ts`, `automatic-collections.test.ts`, `canonical-tags.test.ts`, frontend provider/results tests. Future query changes still require representative large-library performance runs. |

## Phase A Verification Record

Run on the audited working tree, 9 November 2026. Commands do not establish hosted deployment. Baseline tests ran before the four added regression cases; the focused rerun validates those changes without repeating unrelated suites.

| Command / Check | Result |
| --- | --- |
| `npm run lint` | Passed at baseline and after all test edits. |
| `npm run build` | Passed at baseline and after all test edits (TypeScript + Vite). Existing >500 kB chunk warning; no build failure. |
| `npm test` | Passed: 165 files, 1,899 tests. Includes organizer/server, embedded SQL migration/RLS suites, companion tests and reader tests discovered by root configuration. Existing jsdom scrollTo/localstorage warnings. |
| `cd reader && npm test` | Passed independently: 10 files, 94 tests. |
| `cd reader && npm run build` | Passed (TypeScript + Vite); >500 kB chunk warning. |
| `npx vitest run src/features/imports/urls.test.ts src/features/backups/csv-export.test.ts` | Passed after additions: 2 files, 36 tests, including all four new cases. |
| `git diff --check` and architecture link check | Passed; no whitespace errors or missing linked files. |
| Disposable PGlite schema replay and resolved SQL inspection | Passed all ordered migrations, including pre-existing untracked head. Read active definitions using `pg_get_functiondef`; no persistent database reset/mutation. |
| `npm run test:integration:config` | Passed: 7 configuration/security parsing tests; does not start a Supabase service. |
| `npm run check:security` | Passed: frontend privilege boundary, privileged-key build rejection, secret canary, environment exclusions, signup and beta-hook configuration. |
| Focused Playwright desktop tag filters | Initial attempt blocked by sandbox `listen EPERM` on localhost:4173 before any tests ran. Permitted retry passed: 1 desktop test (4.6 seconds); no automatic approval rejection. |

Not executed: full browser/mobile/offline/reader-cloud browser suites, live Supabase HTTP/Auth/Storage integration (`test:integration`), `db:lint`, Deno entrypoint check, hosted verification or 10,000-work performance benchmarks. Phase A changes documentation and test fixtures only; embedded SQL replay is practical coverage without starting/resetting local services. These omissions remain release gates for later query/schema/protocol changes, not passing checks. No external AO3/FF.net/Wattpad retrieval was used to infer live metadata/hierarchy facts.

## Files Changed By Phase A

- Added `docs/architecture/source-assumptions.md`, `source-contracts.md`, `source-data-flow.md`, `source-compatibility.md`, and this backlog.
- Added `docs/adr/0001-source-identity-boundary.md`, `0002-observation-and-tag-authority.md`, `0003-crossover-evidence-policy.md`, `0004-private-projections-and-compatible-rollout.md`.
- Extended existing `src/features/imports/urls.test.ts` and `src/features/backups/csv-export.test.ts` fixtures/tests.
- Linked the audit from `docs/IMPLEMENTATION.md`. Reviewed README and PROJECT_OVERVIEW: supported behavior and run instructions are unchanged, so no Phase A edits to them were needed. Existing user changes in all three remain intact.

No runtime implementation, dependencies, generated types, migration, provider permission, production write, database reset or Phase B refactor was added. Remaining blockers are evidence/classifier semantics, authority-safe matcher contracts and complete projection/invalidation integration for the planned features; source persistence/serialization/reader protocol changes can wait until a real second source.

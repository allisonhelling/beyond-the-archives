# Phase B1 Local Implementation And Rollout

Status: **Partial implementation; not release ready.** No deployment, production read/write, database reset, or live evidence backfill was performed. Approved decisions in the workspace's `PHASE_B1_DECISIONS_AND_TEST_MATRIX.md` take precedence over historical proposals. This document records the B1 implementation, rather than changing the historical Phase A audit.

## Stages And Baseline

| Stage | Delivered | Remaining Gate |
| --- | --- | --- |
| B1.0 | Inspected the dirty tree, architecture, proposals, consumers and complete ordered migrations. Replayed 121 baseline migrations in disposable PGlite and inspected all 159 resolved public SQL function definitions, including patched functions. | Hosted migration state has not been inspected. |
| B1.1 | TS now requires the same category-correct canonical root as SQL. Raw fallback, exact verified synonym matching, category separation and independent personal tags remain intact. Explicit non-AO3 authority cannot expand TS aliases. | Hosted security/HTTP verification. |
| B1.2 | Shared expression model, conversions, transient restoration, legacy decoding, URL/default persistence, local matching and SQL predicates before pagination. Existing series aggregation, author/Currently Reading, automatic memberships, revisions and scoped facets reuse their existing paths. | Real concurrent SQL performance and hosted behavior. |
| B1.3 | Four existing menus have mode tabs. Only Fandoms exposes Custom group editing. Existing Apply, immediate Clear, keyboard dismissal, chips, mobile toolbar and shared styling are retained. | Broader browser release matrix. |
| B1.4 | **Blocked.** No captured, provenance-backed AO3 fandom hierarchy fixture corpus exists in the repository. | Verify real canonical identity, aliases, metatag edges, complete parent absence, pagination, redirects and failures before implementing persistence/resolver. |
| B1.5 | Pure, bounded `ao3_hierarchy_v1` policy and synthetic truth tests only. | Resolver, trusted schema, owner-effective observation states, SQL classifier/projections, expiry jobs, fan-out and coordinated cutover are **not implemented**. |
| B1.6 | Local validation recorded below. | Hosted security, real concurrency/performance, complete browser/offline matrix, and rollout/rollback review remain release gates. |

The starting tree had 99 status entries spanning organizer, reader, docs and tests, including untracked Phase A documents and `20261109000100_work_id_search.sql`. These were preserved. Baseline status/diff and all resolved function bodies were captured under `/tmp/b1-baseline-*` for this session; temporary files are not durable release artifacts. The baseline unit/embedded suite passed **165 files / 1,903 tests**. No existing migration was edited. The new complete local chain has 122 migrations.

## Expression Contract And Consumers

`tags/tag-expressions.ts` is the TypeScript source of truth: `tagExpressions` keys reuse the current filter names (`fandoms`, `relationship`, `characters`, `tags`). Any/All carry `tags`; Custom carries `groups` as OR-of-AND. All categories accept Custom at model/query level; the UI offers it only for Fandoms. Empty groups are inactive. Duplicate normalized identities are removed within new expressions; ordering follows first appearance. No UI group IDs or restoration snapshots enter persistent data or cache identity.

Legacy fandom arrays and comma strings remain readable with Fandoms Any and other categories All. The new expression is authoritative when present; UI writes mirror flattened legacy fields only for compatibility. Old explicit URL selections and old saved defaults replace newer expression defaults at the decoding boundary. Invalid URL structures are normalized or fall back to legacy fields. Existing raw fandom exact selection and categorized partial-text semantics are preserved; no unverified fandom alias cache was invented.

Mode conversion preserves current selections. Leaving Custom snapshots its groups in the existing menu controller; Any/All comparisons preserve the snapshot, but every selection edit invalidates it even if reversed. Apply/navigation/scope replacement/Clear discard that UI state. Adding an empty editing group does not create an executable match-all clause. Clear restores legacy modes and preserves sort/group/random seed.

SQL `library_alias_filters` prepares OR-of-AND groups and the account alias index once per query/rule; the existing `library_filter` evaluates them before count and paging. Compiled groups supplied by public page callers are discarded. The indexed unfiltered selection path remains available. Automatic membership uses the existing materialized rule evaluation and revision pipeline. Existing account/revision cache identities include expressions. Facets intentionally continue to describe the collection/author pool, independently of active result filters. Series tag expressions match the existing aggregate metadata; crossover remains **any member**, never the union of member fandoms. Sample and organizer retained/offline filtering reuse `filterReading`; no new source calls or storage format are required. The separate reader keeps its existing bookshelf filtering and imports the compatible shared fandom selector.

## Evidence Blocker And Policy Boundary

The local `server/ao3/tag-resolution.test.ts` profile builders are synthetic relationship/character/freeform parser tests. They cannot establish real fandom profile shape, a stable canonical identity, complete ancestry or verified no-parent evidence. On 9 November 2026 a direct browsing attempt to `https://archiveofourown.org/tags/Batman%20-%20All%20Media%20Types` returned a non-retryable open error. No HTML or hierarchy fact was captured, inferred or shipped from that attempt. Existing work/series HTML does not prove the required hierarchy corpus.

Consequently there is no new evidence table, resolver, write grant, hierarchy scheduler, negative-expiry fan-out, backfill or generated evidence type. `npm run db:types:embedded` was run through the repository generator; expression helpers add no table/RPC surface consumed by generated types, so the generated file has no diff.

`fandoms/crossover-evidence.ts` accepts explicitly confirmed owner-effective observations and verified, source-qualified opaque graph keys. These keys are synthetic inputs, **not a decision about AO3's stable identity**. Verified known-empty and exactly one confirmed identity yield `not_crossover`; missing/unresolved data yields `unknown`. Positive parent/shared-ancestor/transitive connectivity suffices despite incomplete negative closure. Separation requires complete, current-parser snapshots for every relevant ancestor and expires at 30 days. Cycles, conflicts and traversal limits (64 depth / 4,096 visits) terminate conservatively. Positive evidence must be withdrawn by a complete contradictory snapshot or parser invalidation; failed/partial fetches must retain prior validated edges in the future resolver. Native assertions have no input authority.

This pure module is deliberately **not imported by live matching or projections**. `model.isCrossover`, SQL `library_crossover`, the plural `crossovers` key, saved Only/Exclude behavior and member aggregation remain the legacy name-count policy everywhere. No raw name-count result is labeled `ao3_hierarchy_v1`.

## Migration And Compatibility

1. Validate the full ordered chain through the existing `20261109000100_work_id_search.sql` and new `20261109000200_tag_expressions.sql` on a disposable/staging database. Never edit applied migrations.
2. Apply the expression migration before publishing the corresponding frontend. It replaces the shared predicate, rule validator/preparation and SQL selection guard, adds invoker-only expression helpers, and refreshes maintained memberships plus owner query revisions. It changes no RLS policy, ownership derivation, lease protocol, external export version or reader/companion message.
3. Measure migration membership-refresh cost with representative owner/collection counts. The migration currently refreshes existing owners transactionally; a large deployment may require an operator-reviewed bounded maintenance procedure before approval. Do not assume local empty-schema replay measures that cost.
4. Publish the frontend only after hosted SQL/security checks. Existing clients can read legacy fields; new expressions require the new SQL. Old frontends may flatten or discard modes when editing rules/defaults, so mixed-version edits must be reviewed during rollout. A new frontend against old SQL can silently fall back to flattened semantics for page queries, and old collection validation rejects the new field: this combination is unsupported.

Version-1 AO3 backups/work exports/imports remain unchanged. Saved automatic rules can now contain `tagExpressions` inside the existing JSON envelope; restoring them requires the new validator. Browser defaults remain under their existing versioned storage keys. Rebuildable aliases/query caches remain outside personal backup data. No source identity persistence or reader protocol migration is included.

## Future Coordinated Hierarchy Cutover

After verified fixtures are available, implement additive evidence identities/aliases/edges with trusted service-only writers and forced RLS, and owner-private lookup requests/observations/projections. Replace edges only after a complete successful snapshot; record failures/partial attempts without destroying validated facts. Reuse global AO3 pacing and lease fencing; never fetch during page queries.

Publish compatible readers and initial `unknown` fields first. Backfill owner-effective observations in bounded, retryable batches without interpreting default empty arrays as known-empty. Rebuild `library_story_documents` → document refresh/flush → stored search/series/catalog/facet projections → membership synchronization → owner revisions. Public evidence changes must fan out to every affected owner privately; a scheduled bounded expiry path must downgrade expired negative proofs even without a successful fetch. Observe mounted clients and reject stale responses using existing revisions.

Only enable a versioned hierarchy publication boundary after all SQL/local/series/count/navigation/facet/automatic-membership paths agree. A real feature flag/version boundary is still to be implemented; there is no dormant runtime flag in this partial delivery. Saved `crossovers=only` will become stricter and `exclude` will retain unknown at that explicit cutover. Explain this user-visible change before enabling it. Never mix old booleans and new statuses in settled results.

## Monitoring And Rollback

For tag expressions, monitor query latency, owner revision churn, cache reuse, automatic membership consistency, malformed rules and migration duration. Compare counts and navigation to pages and series; report aggregate timings without logging private selections.

Rollback the frontend first if expression UI fails, but retain the additive SQL parser/matcher so saved grouped rules keep their meaning. Do not remove JSON fields or flatten Custom rules silently. Rolling SQL back requires a reviewed decision for persisted expression rules and browser defaults, rebuilding automatic memberships and invalidating owner caches. Keep current AO3 backups readable; never reset production as rollback.

For the future hierarchy rollout, monitor aggregate queue age, parser mismatch, complete/partial/failure counts, unknown/status distributions, expiry lag, owner fan-out backlog and revision consistency. Roll back by disabling the versioned publication boundary consistently across all consumers while retaining public evidence and private overrides. Preserve old policy projections until rollback review confirms they can be retired; clearing evidence alone cannot safely roll back already-published memberships.

## Validation Record And Remaining Release Gates

Checks ran on 9 November 2026. Local PGlite checks execute SQL but do not validate PostgREST volatility, Auth/Storage HTTP, production RLS or real concurrency.

| Command / Check | Observed Result |
| --- | --- |
| Baseline `npm test` | Passed: 165 files / 1,903 tests. |
| `npm run check` | Passed: lint, TS/Vite build, 167 files / 1,929 tests, seven integration-configuration checks and security canaries. |
| Final navigation tests (`App`, `ReadingFilterControls`, `useLibraryResults`) | Passed: three files / 51 tests after the Apply/Clear/history race fix. |
| Final shared-selector/control regressions | Passed: 15 tests, including missing selected facets and the reader’s external matching-control slot. |
| Final `supabase/tests/canonical-tags.test.ts` | Passed: 12 tests, including real SQL expression/root/category parity, pagination, memberships, anonymous grants and Unicode edge-whitespace normalization. |
| Final `npm run lint` and `npm run build` | Passed. Existing >500 kB chunk warning remains. |
| `npm run db:types:embedded` | Passed on all 122 migrations; generated file unchanged. |
| Populated baseline upgrade rehearsal | Passed in disposable PGlite: loaded the existing 121-migration harness, seeded an owner/work/legacy automatic rule/cache, applied only the new migration, verified retained membership/count, advanced owner revision and new Custom rules. New helpers remain invoker-only with no anonymous execute grant. |
| `npx playwright test tag-filters.spec.ts` | Passed: four tests across desktop and mobile Chromium. These use repository transport fixtures, not hosted PostgREST. |
| Final `npm run test:offline` | Passed: two production-build browser tests, including offline cold start, Custom Apply/reload/Clear, newer text after Clear, and uncached-start failure. |
| Reader focused offline browser regression | Passed: rich EPUB metadata filtering, fandom matching, ranges, exclusions and reset (one test). |
| Reader `npm test` / final `npm run build` | Passed independently: 10 files / 94 tests; TS/Vite build passed with existing chunk warning. |
| `npm run perf:db` | Initial existing 10,000-work-per-owner / three-owner embedded run completed with plans/count checks. Expanded Any/All/Custom run also completed; measurements follow below. |
| `npm run db:lint` | Unverified: initial sandbox telemetry-file restriction; permitted retry reached local PostgreSQL but connection to port 54322 was refused. |
| `npm run test:integration` | Unverified: local Supabase stack unavailable; no reset/start or production fallback attempted. |
| Deno / hosted security / full browser matrix / hosted concurrent performance | Not run. Deno is not installed; no hosted access was used. |
| `git diff --check` | Passed. |

An initial broad test run while the large benchmark was seeding hit an existing import-test timeout; the completed `check` rerun passed without changing that test. Intermediate browser runs identified and fixed mode-tab autofocus and width issues. Final offline verification caught the Apply/Clear navigation race, which was fixed by resetting drafts on history/scope replacement while preserving newer edits during app-authored URL updates. Stale browser assertions for the existing toolbar row, report disclosure and Apply label were updated to the actual dirty-tree UI. No failed attempt is counted as a passing gate.

The complete check preceded the final small history/whitespace refinements; the final affected frontend/SQL suites, lint/build, migration/type replay and browser checks were rerun as listed. A future release still requires the full suite on its final reviewed commit. Baseline SQL inspection found 84 SECURITY DEFINER functions; two existing pacing functions (`pause_series_preview`, `reserve_series_preview`) retain their pre-existing `public` search paths. This change neither adds definers nor alters those contracts. Hosted definer/RLS verification is still required.

## Embedded Performance Observations

The expanded `npm run perf:db` completed for **10,000 works per owner, three owners**, with plans and candidate-count/page-total checks. The ignored local artifact is `artifacts/performance/library.json`; rerunning the script regenerates it. These are synthetic ASCII-tag fixtures in single-process PGlite, not concurrent PostgreSQL or hosted measurements.

| Query | Page/RPC Time | Matched Works |
| --- | --- | --- |
| Unfiltered first page | 52 ms | 10,000 in owner library |
| Fandom Any, cold / cached | 3,170 / 22 ms | 200 |
| Additional Tags All, cold | 4,654 ms | 619 |
| Additional Tags Custom, cold / cached | 5,722 / 23 ms | 1,037 |
| Series page / warm | 138 / 131 ms | Existing series fixture |

Forced uncached selection for Custom still took approximately 5.9–6.0 seconds; the 23 ms number measures an existing revision-cache hit, not repeated fresh classification. Cold expression scans and invalidation under load therefore remain material performance risks. The benchmark bulk-seeds fixtures and does not establish import throughput, trigger write amplification, real concurrent cache behavior or hierarchy fan-out performance. No crossover hierarchy performance claim follows from this run.

## Changed Files And Scope

Runtime changes extend the existing reading matcher, filter labels, browsing/default codecs, draft controls, dashboard navigation, suggestions and shared dropdown styles. `FandomSelect.tsx` extracts the existing selector for reuse by flat and grouped editing; its original export remains available to the reader. `tags/tag-expressions.ts` and `tags/TagFilterControl.tsx` hold shared semantics/controller behavior. `fandoms/crossover-evidence.ts` is a pure, inactive policy module. Only `20261109000200_tag_expressions.sql` is a new migration; no applied SQL, identity schema, production resource or generated type was hand-edited.

Tests extend canonical SQL, series/local/page queries, controls and browser/offline coverage; `scripts/performance-library.mjs` adds Any/All/Custom scenarios and prepares expressions once when inspecting production selection plans. README, IMPLEMENTATION, PROJECT_OVERVIEW and the ADR 0003 addendum describe the resulting scope. Existing unrelated dirty-tree files remain intact.

Release requires verified hierarchy fixtures; trusted resolver/schema tests; two-owner override/evidence/expiry fan-out; complete migration and backfill rehearsal; hosted grants/RLS/definer/Auth/PostgREST/Storage tests; complete desktop/mobile/offline/reader browser coverage, including long tags and many-group stress cases; real PostgreSQL 10,000-work cold/warm/concurrent expression and series plans; write-amplification/cache measurements; and a reviewed version cutover/rollback. No production operation is authorized by these instructions.

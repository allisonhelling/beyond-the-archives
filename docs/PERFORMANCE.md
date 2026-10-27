# Large-Library Performance and Regression Checks

## Acceptance Targets

Local measurements use three libraries of 10,000 works each, 5,000 authors, 100 fandoms, 500 tags, 12 tags per work, variable summaries, 20 collections per user, and 200 series per user. Local targets are: catalog under 1 second; first, last, and broad-search page queries under 2 seconds; series pages under 5 seconds; exact counts under 100 ms. These are local development gates, not hosted service guarantees.

Browser targets are initial results under 8 seconds with the synthetic transport, a 250-work page under 3 seconds including the fixture response, fewer than 100 mounted cards on that page, and preservation of filters, Back/Forward, focus and scroll when returning from details. Rendering above 250 ms warrants virtualization. The first unvirtualized measurements were 935 ms desktop and 660 ms mobile for 250 cards. Pages above 100 results now use measured, variable-height rows with overscan; focused rows remain mounted. Group headings and one/two-column layouts share the normal cards and grid styles. Library search runs over the complete server result set. Browser Find only searches mounted cards.

Hosted release targets remain to be verified: p95 page response under 500 ms, exact count under 100 ms, first display under 2.5 seconds, and no cross-user rows during concurrent reads of representative libraries. Measure network and database time separately. Do not treat the embedded database or mocked browser transport as evidence of hosted latency, concurrent database capacity, AO3 throughput or mobile-device CPU performance.

## Recorded Local Results (20 October 2026)

The final embedded run used the full fixture described above. Timings are single-run observations, not latency percentiles.

| Operation | Response time | JSON bytes | Exact filtered count |
| --- | ---: | ---: | ---: |
| Compact catalog | 717 ms | 5,867,267 | — |
| First 50 works | 1,173 ms | 125,341 | 630 ms |
| Last 50 works | 1,081 ms | 132,059 | 629 ms |
| Broad search, 250 works | 1,448 ms | 639,499 | 876 ms |
| First 50 series | 1,878 ms | 780,853 | 1,910 ms |

The owner-only entry count was 20 ms. Filtered counts use the actual query pipeline, including series derivation where applicable; they **miss the 100 ms target**. Page and catalog timings meet the local targets. The remaining count cost and the catalog's O(library-size) transfer require further work before claiming that all performance gates pass. Plans for both the inner page query and its filtered-count pipeline are recorded separately in `library.json`. The owner projection scan itself took roughly 16–29 ms; the series plan spent about 1.95 seconds deriving its 200 summaries before pagination. Further count tuning needs to reduce repeated predicate/series computation, rather than adding another owner index.

The deep identity offset took 10 ms versus 20 ms for the cursor plus anchor lookup. The corrected cursor query handles descending timestamps with ascending IDs and asserts that its results equal the deep offset. These timings support retaining numbered offset navigation at this fixture size; they do not establish how either approach scales beyond it.

The connected-mode browser regression run recorded the following mocked-transport observations:

| Chromium viewport | Initial results | 250-result page | Render after response | JS heap at large page |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 3,370 ms | 1,312 ms | 161 ms | 50.4 MB |
| Mobile layout | 2,433 ms | 827 ms | 122 ms | 37.3 MB |

The performance workflow issued three page queries: the initial 50 results, 250 results, and a search across all 10,000 works. Returning from details reused the cached page. On-demand detail reads and per-response transfer sizes are included in the browser reports. These observations meet the local browser targets; the mobile run uses a desktop Chromium process with mobile viewport emulation.

## Commands

- `npm run perf:db`: synthetic PGlite database with actual migrations, three 10,000-work libraries, page/count timings, response sizes, and `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans. `PERF_WORKS` changes fixture size. Fixture setup disables only the new projection-maintenance triggers during bulk insertion, then backfills and reenables them. Write throughput is deliberately excluded from this read benchmark.
- `npm run perf:browser`: desktop and mobile Chromium checks, including large-page rendering, transferred JSON, JavaScript heap (where available), full-library search, page-cache reuse, and navigation/scroll restoration.
- `npm run perf:hosted`: read-only concurrent queries using explicitly provided `PERF_SUPABASE_URL`, `PERF_PUBLISHABLE_KEY`, and comma-separated `PERF_ACCESS_TOKENS` for at least two test readers. `PERF_ROUNDS` defaults to five. Use dedicated representative test libraries. The runner checks every returned work's owner, measures exact HEAD counts, and reports direct and extension metadata-job throughput separately. It never prints tokens, notes or metadata. No hosted credentials or representative hosted environment were supplied for this change.

Reports go to ignored `artifacts/performance/`. Browser checks use mocked Auth/PostgREST; SQL tests independently exercise actual projections, search parity, source updates, grants, RLS, pagination boundaries and series behavior. Run `npm run check` and the relevant Playwright checks as well.

## Query and Cache Decisions

The initial live metadata-join implementation took roughly 1.4 seconds for a 1,000-work catalog. A private, transactionally maintained `library_search_documents` table now derives from the existing entry/work/relationship tables. Entry, work, author, fandom, tag and membership changes rebuild only affected documents. The projection has forced RLS, read-only owner access, and no callable authenticated write helper. Browser/extension metadata and manual corrections retain their original precedence. Unchanged tag/fandom imports skip entity updates. Metadata job completion and userscript refreshes collect affected entry IDs and rebuild each final document once per operation; ordinary shared-entity edits still update related works. Unchanged shared entities skip projection rebuilds, and unchanged projected documents skip writes. Normalized search fields are stored once per source change; wildcard, quoting, exclusion and OR behavior use the existing browser parser's literal substring groups.

The application loads collection navigation and paged cards without requesting the full identity catalog. Shelf counts and collection sort timestamps arrive independently after the first results. The catalog loads only for mounted features that need all identities, such as series import deduplication, series details and collection membership editing. It remains an O(library-size) transfer when requested. Full work metadata loads on demand; result-page records enter the provider as compact identities so opening details still retrieves complete chapter maps and metadata. The results cache retains six pages per mounted user provider; keys include user ID, mode, collection, every filter, grouping, sorting, page and effective size. Sign-out destroys the cache and scroll/measurement state. There is no speculative next-page prefetch. Detail reads preserve cached pages. Known work edits invalidate affected collection/author scopes while retaining unrelated cached pages and facets. Unknown previous membership, automatic-rule changes and global refreshes conservatively invalidate broader scopes. Collection appearance changes retain result caches; series edits invalidate series-enabled scopes. The separate facets cache retains up to 20 collection pools, keyed by mode, collection, author and series visibility, independent of page, sort and search filters. Refresh requests serialize, and generation checks reject obsolete results. Full work details share a 100-record retention budget across navigation and targeted refreshes; oldest unprotected records become compact catalog entries. Mounted work editors and visible saved series works remain available. A visible series larger than 100 may exceed the budget until it unmounts, when retention returns to the limit.

Numbered pages use an offset after complete filtering and deterministic ordering, ending with the unique entry/series ID. Empty or invalid pages clamp to the last valid page. The identity-query benchmark compares a deep offset with a cursor plus anchor discovery: they took 10 ms and 20 ms respectively in the final local run at 10,000 works. Cursor anchor discovery still needs an offset or stored anchors for arbitrary numbered jumps. Offset is retained for the requested navigation. A unique tie-breaker stabilizes tied rows; concurrent inserts/deletes can still shift numbered pages between separate requests.

Indexes cover owner/added/identity traversal, import-history ownership/order, and eligible queue work. Existing relationship and source-tag-order indexes are reused. Inspect the recorded inner page-query plans and exact-count plans before tuning further; no speculative full-text or trigram dependency was added. Very large migration backfills and projection write amplification need measurement on the intended hosted database before rollout.

## Automatic Collection Evaluation

Migration `20261025000400_catalog_collection_evaluation.sql` reads the stored work document directly in the compact catalog and computes `automaticCollectionIds` once per work. Previously each compact field expanded the collection view's combined JSON expression and could repeat the membership query. A database regression counts evaluations and verifies membership parity with full details and owner isolation.

The shared library filter and automatic matching functions retain their existing predicates, signatures, grants and invoker security, while using PL/pgSQL to reuse statement plans across work/rule pairs. Membership still updates from current metadata and rules on every read; there is no persistent membership cache to invalidate. The performance runner now measures `catalog-automatic` with five tag-based automatic collections in addition to the manual-only catalog. Apply the migration to the hosted database to activate the optimization; a website-only deployment does not change these functions.

Local checks on 25 October 2026 measured a 300-work, one-reader fixture with five tag-based automatic collections at 17,300 ms before the change and 940 ms after it. These are individual observations, not latency percentiles. The full fixture with three 10,000-work libraries measured the catalog at 5,796 ms without automatic collections and 19,838 ms with five automatic collections for the active reader. Those larger-fixture timings still miss the catalog target; neither the earlier 2026 measurements above nor the smaller comparison establish hosted timeout resolution. Validate the migrated catalog under the intended hosted reader role, data size and timeout before claiming that result.

## Collection Page Queries

Migration `20261025000500_collection_query_work.sql` skips series aggregation when series are hidden, including in Finished and manual collections. Previously non-All Works shelves prepared series that were then removed from the result pool. The shared query now reads stored work documents directly, evaluates only the selected automatic collection's rule when filtering that shelf, and computes complete automatic memberships for returned page works. It preserves filtering before pagination, exact totals, sorting, suggestions, owner isolation and explicit series views.

With 3,038 finished works for one synthetic reader, a 50-work Finished page took 3,358 ms before this change and 509 ms after it; All Works took 1,670 ms and 414 ms respectively. These individual embedded measurements are not hosted latency guarantees. Regression tests make unexpected hidden-series aggregation fail and count membership evaluations to ensure off-page works do not receive display-only membership calculations.

`npm run perf:db` now includes a `finished-page` scenario and seeds up to 3,038 finished works per reader. Use `PERF_WORKS=3038 npm run perf:db` for libraries matching that collection size. Apply the new migration to the hosted database to activate this fix; no website or companion update is required. Explicitly showing series still incurs series aggregation costs, and hosted latency remains to be verified after rollout.

## Incremental Loading and Collection Facets

Migration `20261026000300_incremental_library_loading.sql` extracts one shared owner-scoped candidate pool for page queries and filter facets. The frontend requests pages with `includeFacets: false`, loads tag suggestions and fandom counts separately, and caches them across sorting, pagination and search changes. Legacy RPC callers retain inline facets by default. Ordinary manual collections use the existing `(collection_id, library_entry_id)` primary key to select candidate IDs before processing metadata. Explicit series views retain all work context needed for series progress and inferred membership.

On 26 October 2026, three local comparison reads with 3,038 works per reader and three synthetic readers measured one 151-work manual collection at 228/182/317 ms before and 99/76/87 ms after, with identical page identities and totals. A separate benchmark recorded the candidate membership index returning 151 rows. No additional membership index was needed. These are embedded PostgreSQL observations, not hosted percentiles. `PERF_WORKS=3038 npm run perf:db` records navigation, collection facets, manual-collection pages and their inner query plans in `artifacts/performance/library.json`.

The 10,000-work mocked browser regression recorded initial results at 847 ms desktop and 654 ms mobile layout. It asserts zero catalog requests during browsing and one facets request across page-size changes, searches, Back/Forward and detail navigation before reload. Navigation counts remain background work and may take longer than results; the local 3,038-work database run measured that independent RPC at 4,369 ms. This change removes it from the initial result dependency, but does not establish hosted timeout resolution.

## Collection Count Timeouts

Migration `20261026000400_compact_navigation_series.sql` adds a compact projection to the shared series aggregation function. Navigation sends only series membership, identity and reading status into that projection, and skips preview metadata and search text. Full series consumers retain the existing single-argument function and complete payload. Counts continue to use the shared shelf and automatic collection predicates, with the same owner policies and grants.

The migration caches plans for frequently called shelf, one-shot, text and normalization helpers using the established PL/pgSQL pattern. It also disables JIT for the navigation function to avoid compilation startup costs. A hosted check on 26 October 2026 reproduced an eight-second timeout with 4,908 works, 442 saved series and two automatic collections; three revised reads completed in 5,580 / 5,522 / 5,867 ms in a transaction that rolled back all changes. These observations are not latency percentiles. This validation did not deploy the migration. Regression tests compare compact series fields and shelf counts with full query results and make unexpected preview aggregation fail deterministically.

## Query Payloads and Membership Counts

Migration `20261026000500_library_query_payloads.sql` carries only the requested normalized search scope through the shared candidate pool. Pages without search terms and collection facets omit all three large normalized strings. Interactive page, pool and facet functions disable JIT compilation startup costs. Filter semantics, pagination, owner policies and response contracts stay with their existing implementations.

Navigation uses the existing shelf matcher on compact shelf fields, expands manual collection memberships once, and evaluates automatic rules only for automatic collections. Empty collections and membership timestamps remain included. This avoids comparing every full work document against every manual collection.

A local PostgreSQL transaction with 5,000 synthetic works, 100 series and 20 manual collections measured navigation at 4,955 ms before / 3,011 ms after, full-library facets at 401 / 302 ms, and the first 50-work page at 1,068 / 602 ms. A second transaction confirmed identical complete JSON responses for navigation, facets, a library page and the second Currently Reading page. Both transactions rolled back their fixtures and schema changes. These are individual local observations, not hosted latency guarantees; remaining automatic-rule and series work can still be substantial. The benchmark now includes full-library facets and a nonempty Currently Reading page, including for smaller fixtures.

## Retrieval Capacity and Fairness

The hosted Edge Function handles exactly one job per invocation. The supplied one-minute Cron schedule therefore has a nominal maximum of 60 jobs/hour globally, before retrieval latency, failures, pauses and lease recovery. The global gate also enforces at least 15 seconds between eligible hosted requests; running a more frequent scheduler cannot exceed its nominal 240 requests/hour limit. The continuous Node worker waits 15 seconds after each attempt, in addition to attempt time. These are code-derived upper bounds, not measured AO3 throughput.

The extension processes one leased job per account at a time and waits three seconds after successful completion before another claim. Page loading, confirmation/sign-in, failures and browser suspension reduce actual throughput. Its five-minute lease differs from the hosted worker's two-minute lease. The hosted runner reports observed completions, observation window and attempt durations separately for each retrieval mode; it cannot infer representative capacity from an idle or tiny sample.

Claims now prefer the least recently served eligible account and then the least recently served batch. This prevents an older, large import from draining before another user's small import, and rotates batches within an extension account. The original gates, account locks, cancellation checks, retry limit, recovery and fencing tokens remain in place and retain regression coverage.

Recent shared-metadata reuse was considered and left disabled: explicit metadata refreshes should still retrieve new information, and extension-only metadata must remain private. A future reuse policy should distinguish initial imports from explicit refreshes, define a freshness interval and provenance/completeness requirements, and measure saved AO3 requests without bypassing reading-location verification or the pacing gate.

## Rollout

Apply all versioned migrations through `20261026000500_library_query_payloads.sql` before deploying the frontend. The frontend requires its new facets and navigation RPCs. The first migration backfills private search documents and adds source-maintenance triggers; the second adds paginated import history and queue fairness; the third batches metadata projections and skips unchanged updates. No hosted migration, deployment or AO3 retrieval was performed by these checks.

## Revision-Based Navigation and Counts

Migration `20261027000200_indexed_library_navigation.sql` extends the existing private document projection with indexed status, favorite/Rec and sort fields. Ordinary work queries select identities using these fields and manual or automatic membership indexes. The shared filter still evaluates complex predicates; the existing series pipeline retains its complete work context. Only the selected work page loads display documents. Seeded random ordering, title tie-breaks, missing-value placement and the browser filter contract remain covered by parity tests.

A server revision advances transactionally after effective document changes, membership/series changes, collection-rule changes and verified tag evidence changes. Page responses and navigation snapshots include their revision. A page retries selection when that revision changes during document loading. The client rejects responses older than a revision it has already observed. Cache tables are private; RPCs derive the owner from authentication.

Exact matching identities and totals are cached by filter combination and revision, with at most 20 cache entries per reader. Pagination and page size reuse the matching set. Sorting and shuffling reuse its identities and counts, applying only the new order. Dashboard section counts are calculated together and shared across categories with identical filters. Combined library/collection navigation counts are cached until the revision changes. The cache stores identities and counts rather than display documents.

Automatic memberships are derived in a separate table, leaving manual memberships editable through the established path. Effective metadata/progress/tag changes update affected memberships in the same transaction. Rule edits rebuild the affected collection; verified alias changes rebuild the reader's memberships. The resolver batches alias evidence updates before rebuilding once. Shared matchers and explicit owner aliases cover worker writes without a reader JWT. Converting an automatic collection still snapshots the shared rule's current matches into manual membership.

The client keeps counts and pages until invalidation. It checks the lightweight server revision when the tab returns to the foreground, when an observed import completes, and on navigation if no check has occurred for 45 seconds. A visible-tab timer is a 45-second fallback; hidden tabs do not poll. Identical revisions preserve caches. Local saves refresh affected results immediately. Import-history polling accumulates affected entries, refreshes at most once per 30 seconds while work continues, and flushes at completion.

Old cards and their exact total stay together while a newer result loads. Pagination marks the count `Updating…`; stale totals cannot disable Next or reject an otherwise valid positive page jump. The new response clamps a deleted last page. Refresh failures retain known counts with `Couldn’t update` and a retry action; unknown counts display as unavailable rather than zero. Navigation badges likewise retain their last known values during background refresh or failure.

`npm run perf:db` records both the revision/cache-aware RPC and the production candidate-selection statement, explained separately without caching. It includes a repeated navigation read and a sort change. Embedded timings are development observations, not hosted latency or concurrent-write guarantees. Apply the migration before deploying the updated client.

A local single-process run on 27 October 2026 used 1,000 works per reader and three readers. The first 50-work page took 12 ms, the last page 9 ms, a sort change 13 ms, and a filtered 250-work page 176 ms. Navigation took 215 ms initially and less than 1 ms from its revision cache. The compact catalog took 126 ms without automatic collections and 141 ms with five automatic collections. The existing full series path took 672 ms. Bulk fixture setup analyzes the derived membership table before steady-state reads, as it already does for the other fixture tables. These are individual embedded measurements, not hosted percentiles or concurrent-write measurements.

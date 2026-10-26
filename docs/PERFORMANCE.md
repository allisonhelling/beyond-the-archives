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

The application fetches a compact identity/organization catalog for shelves, pickers and duplicate detection, then paged cards. The catalog includes all saved identities and compact series membership information; this is an intentional remaining O(library-size) transfer, not a download of every summary, note, chapter map or tag list. Full work and series metadata load on demand. The results cache retains six pages per mounted user provider; keys include user ID, mode, collection, every filter, grouping, sorting, page and effective size. Sign-out destroys the cache and scroll/measurement state. There is no speculative next-page prefetch. Detail reads preserve cached pages; mutations invalidate page/count results and refresh affected work or series state. Refresh requests serialize, and generation checks reject obsolete results. Full work details share a 100-record retention budget across navigation and targeted refreshes; oldest unprotected records become compact catalog entries. Mounted work editors and visible saved series works remain available. A visible series larger than 100 may exceed the budget until it unmounts, when retention returns to the limit.

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

## Retrieval Capacity and Fairness

The hosted Edge Function handles exactly one job per invocation. The supplied one-minute Cron schedule therefore has a nominal maximum of 60 jobs/hour globally, before retrieval latency, failures, pauses and lease recovery. The global gate also enforces at least 15 seconds between eligible hosted requests; running a more frequent scheduler cannot exceed its nominal 240 requests/hour limit. The continuous Node worker waits 15 seconds after each attempt, in addition to attempt time. These are code-derived upper bounds, not measured AO3 throughput.

The extension processes one leased job per account at a time and waits three seconds after successful completion before another claim. Page loading, confirmation/sign-in, failures and browser suspension reduce actual throughput. Its five-minute lease differs from the hosted worker's two-minute lease. The hosted runner reports observed completions, observation window and attempt durations separately for each retrieval mode; it cannot infer representative capacity from an idle or tiny sample.

Claims now prefer the least recently served eligible account and then the least recently served batch. This prevents an older, large import from draining before another user's small import, and rotates batches within an extension account. The original gates, account locks, cancellation checks, retry limit, recovery and fencing tokens remain in place and retain regression coverage.

Recent shared-metadata reuse was considered and left disabled: explicit metadata refreshes should still retrieve new information, and extension-only metadata must remain private. A future reuse policy should distinguish initial imports from explicit refreshes, define a freshness interval and provenance/completeness requirements, and measure saved AO3 requests without bypassing reading-location verification or the pacing gate.

## Rollout

Apply `20261020000100_library_query.sql`, `20261020000200_import_history_and_fairness.sql`, and `20261020000300_bound_metadata_documents.sql` before deploying the frontend. The first migration backfills private search documents and adds source-maintenance triggers; the second adds paginated import history and queue fairness; the third batches metadata projections and skips unchanged updates. No hosted migration, deployment or AO3 retrieval was performed by these checks.

# AO3 Hierarchy Crossover Filtering

Implemented on **11 November 2026**, including the subsequently approved validated-omission policy. Live AO3 recovery and hosted deployment have not been verified. This document supersedes the earlier guarded-foundation report; historical B1 reports describe their original scope.

## Classification Contract

The existing plural `crossovers` payload, URLs, saved defaults, draft/Apply controls, chips and collection rules retain Allowed / Only / Exclude. Allowed includes every status; Only includes verified `crossover`; Exclude retains `not_crossover` and `unknown`. Multiple display names never establish a crossover.

`ao3_hierarchy_v1`, classifier version 1, uses app-owned canonical IDs and AO3-qualified evidence. Verified aliases deduplicate identity; distinct parent/child fandoms keep distinct identities. Verified ancestor/shared-ancestor proofs connect effective fandoms transitively, including A–B–C bridges. One connected component establishes non-crossover even with incomplete negative closure. Multiple components require complete, fresh ancestry for every relevant node. Negative proof expires at 30 days. Missing identities, disputed mappings, invalid parser versions, missing endpoints, cycles preventing complete closure, and traversal limits preserve unknown. Confirmed known-empty or one verified identity without unresolved candidates can be non-crossover; a rendering-default empty array cannot.

## Verified-Omission Policy

The user approved accepting intentional omission as no direct metatags after validating the complete profile. This explicitly replaces the original requirement for a literal empty list.

AO3's [profile template](https://github.com/otwcode/otwarchive/blob/master/app/views/tags/show.html.erb) omits `.meta` when `direct_meta_tags` is empty. The [tree helper](https://github.com/otwcode/otwarchive/blob/master/app/helpers/tags_helper.rb) renders direct parents separately from nested ancestors. General Parent Tags include media and never establish fandom metatag edges.

Parser `ao3_fandom_profile_v2` requires exact identity, Fandom category, a verified canonical indicator, recognized English profile structure, a normal parent-list container, an AO3 footer after the main region, and real source closing tags for HTML/body/outer/main/profile/footer. Parse5 source locations distinguish explicit end tags from repaired/truncated HTML. Unexpected profile sections and suspicious unrecognized metatag headings prevent completeness. A present metatag section must have the recognized heading/tree and valid direct links. Missing `.meta` becomes `verified_empty` only after all completeness checks. An empty synthetic list, partial page, changed structure, interstitial or parse failure does not establish absence.

`profile_complete` describes document structure; `hierarchy_complete` describes the direct-parent snapshot only. The pure classifier independently checks the complete ancestor closure. A structurally recognized document cannot mathematically guarantee transport or taxonomy completeness: this is an explicit, versioned interpretation of AO3's observed template. AO3's recorded relationships are not a universal statement about fandoms or its private crossover algorithm.

## Historical Fixtures

`server/ao3/fixtures/fandoms/manifest.json` records original URLs, archive URLs, UTC capture timestamps and SHA-256 checksums. Dates below are UTC. Compressed fixtures preserve captured HTML for:

- Batman (Comics), 8 June 2026: canonical, direct Batman – All Media Types and DCU (Comics) metatags.
- Batman – All Media Types, 16 August 2026: canonical, aliases and direct DCU metatag.
- Batman Universe, 10 October 2025: Fandom synonym of Batman – All Media Types.
- DCU, 4 December 2025: canonical profile with intentionally omitted metatags.

These are historical parser regression fixtures, never current production evidence or a backfill seed. The original live request returned HTTP 418. After recovery, verify current markup with a few paced requests; changed markup must fail conservatively until parser fixtures/version are updated.

## Identity, Storage And Privacy

- `canonical_fandoms.id` is an app-owned UUID. Display names are not unique identity keys. Existing `fandoms` rows continue preserving raw imported metadata.
- `external_fandom_mappings` qualifies exact keys by site, category and identity scheme. `ao3_tag_profile_v1` uses an exact verified AO3 profile name within AO3's namespace. No fuzzy, case/accent or franchise-name matching grants identity.
- `ao3_fandom_profiles` holds public identity/alias evidence, direct metatag link candidates, provenance, parser version, attempt/success/failure timestamps, completeness and semantic revision. A parent becomes a usable edge only after independently verified canonical/category mappings exist at both endpoints.
- Trusted `store_fandom_profile` reuses the foundation's atomic UUID/alias allocation and conflict quarantine. Complete v2 snapshots replace direct-parent lists; incomplete refreshes preserve prior positive observations. Failed fetches retain prior successful evidence. Disputes do not automatically clear or merge identities.
- `fandom_evidence_state` fences concurrent evidence updates. `fandom_classifications` caches private effective observation sets, status, dependencies, expiry and worker leases. `fandom_resolution_requests` is an account-private retry queue; public evidence contains no account/work membership or request counters. Failed, previously unseen private candidates stay in the private retry queue and are never inserted into shared evidence.
- All tables force RLS. Browsers can read only their own classification cache, cannot write evidence/status/queues, and cannot call privileged claim/commit/expiry RPCs. Service handlers derive accounts from verified authentication. Cache hashes are checked against exact observation arrays; they are not canonical fandom IDs.

## Processing And Publication

Imports and edits reuse the existing effective-metadata → search-document trigger. The trigger registers the exact fandom set, reuses a cached classification immediately, and queues missing observations without making network requests. An uncached set is conservatively unknown until the background batch runs. Oversized manual observations (over 256 candidates or a name over 2,000 UTF-8 bytes) remain intact and unknown without entering indexed enrichment queues, so index limits cannot block saving the story. Explicit manual empty overrides are distinguishable from missing metadata. Series metadata writes also register unsaved preview member sets.

`claim_fandom_classifications` leases at most 20 sets for one owner and assembles at most 4,096 reachable profile names. `classifyFandomBatch` prepares verified app-ID snapshots and calls the same pure `classifyCrossover` used by sample/unit tests. There is no competing SQL graph algorithm. `commit_fandom_classifications` requires the lease token and unchanged evidence revision, then updates affected stored documents, automatic memberships and owner revisions in the same transaction. Evidence changes dirty dependent sets; unused observation sets/requests are pruned during maintenance.

A batch is bounded by observation-set count and evidence nodes, not by the number of saved works sharing a set. Publication can update many affected documents in one transaction; measure that fan-out against actual libraries before hosted rollout.

Background processing uses the existing `tag-resolution` endpoint and global reserve/pause gate. A call classifies at most two 20-set batches and fetches at most one profile. Requests are independent of browsing/pagination. Successful evidence refreshes after 30 days; failures retry no sooner than ten minutes; global pacing can defer either. Browser processing starts after a short delay and pauses while hidden/offline. Existing non-fandom suggestions retain their authenticated resolver/cache path.

For unattended processing and expiry, schedule the existing-style bounded operator command once per minute:

```sh
npm run metadata:fandoms
```

Supply `SUPABASE_URL` and `SUPABASE_SECRET_KEY` through the trusted scheduler environment or ignored `.env.worker`. The command processes up to 20 pending owners, reuses global pacing and logs aggregate counts only. It requires no new job framework. Scheduling is an operator deployment step; no hosted scheduler was configured here.

Expiry needs no successful AO3 fetch. The scheduled worker expires negative proofs, and the existing `library_revision` boundary performs an indexed owner expiry check before page/navigation/series/facet caches are reused. Expiration and pending changed evidence downgrade to unknown at the next owner revision check and refresh memberships/revisions before cached results are reused. Retained offline projections also discard expired crossover authority locally and recompute crossover-rule memberships when retained rule definitions are available. Other cached memberships remain intact.

## Filtering Surfaces And Performance

Library, Currently Reading, shelves, author scopes, series, automatic collections, exact counts, pagination, navigation snapshots, compact catalogs and retained organizer filtering use the stored policy projections. Series match any individual installment; fandoms are never unioned to manufacture a crossover. Unsaved preview works read the same owner-private cached classification. Full-library export/edit paths also retain stored projections when evaluating automatic membership.

The shared dropdown/help, draft/Apply, chips, Clear All, URLs and saved defaults reuse existing controls/codecs. No separate filtering pipeline was introduced. `library_crossover` and frontend `isCrossover` raw-name-count helpers were removed. The standalone EPUB reader's existing source-label-count facet is accurately named **Fandom Count**, retains its saved values, and does not claim organizer evidence support.

Sample mode reclassifies effective metadata against an explicitly simulated, versioned graph using the shared classifier. Its help identifies demonstration evidence. A daily simulation clock preserves repeatable resets while keeping synthetic evidence fresh; unrecognized imported fandoms remain unknown. Derived sample statuses are not written into source snapshots/backups.

Queries perform no recursive graph traversal or AO3 requests. Status is stored/indexed in `library_search_documents`; Allowed retains the existing unfiltered identity-selection path. The owner expiry check uses a partial expiry index. Benchmarks and validation results are recorded below; local PGlite measurements do not establish hosted concurrency or fan-out performance.

## Migration And Deployment Order

1. Review/apply the full ordered chain, including `20261111000100_fandom_identity_foundation.sql` then `20261111000200_hierarchy_crossover_filter.sql`. Never edit applied migrations or reset an established database. The latter conservatively registers current effective observations and changes legacy saved filters to verified three-state semantics. Backfill work and membership-refresh cost must be measured with representative data.
2. Regenerate types with `npm run db:types:embedded` or the normal local Supabase generator.
3. Deploy updated `tag-resolution`, configure the scheduled command, and verify bounded processing/failure recovery in staging. With AO3 unavailable, multi-fandom observations remain unknown rather than falling back to name counts.
4. Deploy both frontends together for the shared-helper/reader label update; verify counts, memberships, saved filters and retained behavior.
5. After AO3 recovery, verify current profile markup and observe enrichment/status distributions before relying on classification coverage.

No hosted migration, Edge deployment, scheduler setup or live AO3 recovery verification was performed. Rolling back UI must retain compatible SQL/status semantics for saved rules. Do not restore name-count classification while leaving hierarchy-based memberships or caches in place.

## Future Sources

Future adapters can map verified source-qualified observations into the same UUID identity space. They must preserve raw metadata/provenance and establish AO3 backing before using `ao3_hierarchy_v1`. Native crossover assertions or another authority cannot silently change this policy. No FF.net/Wattpad ingestion, provider registry or universal tag ontology was added.

## Validation

Embedded SQL exercises actual migrations, constraints, grants and RLS through the existing minimal Auth harness; it does not establish hosted Auth/PostgREST behavior.

| Check | Result |
| --- | --- |
| Complete `NODE_OPTIONS=--no-experimental-webstorage npm run check` | Passed: lint, organizer TypeScript/build, 177 Vitest files / **1,993 tests**, seven integration-configuration tests and security checks. Subsequent SQL input-bound and reader-only offline membership refinements were covered by the focused/SQL/build/browser checks below. |
| Final `npm run test:db` | Passed: 37 files / **358 tests**, including the oversized manual-observation guard. |
| Final focused retained/pipeline checks | Passed for retained storage/provider and crossover SQL, including preventing reader-only books from acquiring organizer automatic memberships. |
| `npm run build` in `reader/` | Passed. Root/reader builds retain their existing large-chunk warnings. |
| `npm run db:types:embedded` | Passed on all 125 migrations; generated types were not hand-edited. |
| Deno check with repository config for `supabase/functions/*/index.ts` | Passed for all nine entrypoints after correcting the shared type import's `.ts` extension. |
| Combined desktop/mobile browser workflows | Passed: **10 cases** covering crossover Apply, unknown handling, chips, URLs, defaults, Clear All, the existing word-sort/publication flow and shared Any/All/Custom tag workflows. Browser transport is mocked; actual SQL behavior is covered separately. |
| Sample browser workflow | Passed on desktop/mobile: simulated related/unrelated/unknown evidence, staged Apply, Only/Exclude and no AO3/Supabase requests. |
| Final `npm run test:offline` | Passed: production build plus both retained cold-start/uncached-start cases. Unit coverage additionally verifies expired crossover-rule membership changes. |
| Populated upgrade rehearsal | Passed in disposable PGlite: upgraded 124→125 migrations with existing private data, confirmed unchanged source/private entry JSON, conservative unknown backfill, and working classification claim/commit. |
| `npm run perf:db` | Passed with 10,000 works per owner / three owners, including new Allowed/Only/Exclude count/plan checks. Measurements follow below. |
| Migration ledger / `git diff --check` | Passed; ledger matches 125 ordered migration filenames. |
| `npm run db:lint` | Unavailable: local PostgreSQL port 54322 refused the connection. |
| `npm run test:integration` | Unavailable: local Supabase is not running. No reset or hosted fallback was attempted. |
| Hosted deployment/security/concurrent performance and live AO3 recovery | Not performed. Full unrelated browser suites were not run. |

The embedded benchmark observed 52 ms for an ordinary first page, 51 ms with explicit Allowed, 2 ms for Only, and 54 ms for Exclude. The synthetic libraries have unresolved fandoms, so Only correctly returns zero and Exclude retains all 10,000 owner works. The Only plan uses `library_crossover_status`; this is not a measurement of a populated verified-crossover result set, real network throughput, hierarchy fan-out or hosted concurrency. The later input-bound guard changes indexing of oversized metadata, not the measured query-selection path. Existing cold tag-expression scans remain materially slower (approximately 4.7–6.1 seconds in this run). The ignored artifact is `artifacts/performance/library.json`.

Intermediate checks found and corrected an outdated schema inventory, an unsupported pagination value in a new test, source-label helper use in the standalone reader, nondeterministic sample timestamps, a Node JSON import dependency and an ambiguous browser Clear All selector. Initial browser runs also required installing matching Chromium and permitted local server binding. Registry access for Deno required a permitted retry. No product/test timeout was increased, and failed attempts are not counted as passing gates above.

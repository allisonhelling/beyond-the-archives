# Reader Cloud Receipt Benchmark Results

This is the pre-implementation comparison. See the [final protocol benchmark](FINAL.md) for the shipped schema and RPC measured in isolation.

## Initial Recommendation

Prototype a **versioned hybrid for new mutations**. Keep original accepted values for normalized or otherwise non-reconstructible responses. Continue to replay stored v1 results through the existing RPC. The synthetic hybrid savings justify a prototype and a native PostgreSQL recheck. They do not establish the fallback share in real traffic or justify changing the protocol for public launch before testing generation-safe deletion and mixed clients.

A typed envelope with full payload retains v1 replay compatibility but gives little storage reduction. Gzip materially reduces this workload's storage and preserves serialized PostgreSQL output, but it needs a server-side codec inside the existing atomic write path or a redesigned server boundary. The benchmark measured its codec and representation, independent of a deployed API integration.

## Existing Synchronization Contract

The receipt table has a composite primary key on `(user_id,id)`, an Auth-user cascade, forced RLS, and no authenticated direct access policy. In the owning RPC, a successful write inserts the active value and receipt in one transaction. The owner-scoped advisory lock covers the UUID lookup and write. Receipts exist for accepted mutations. Conflict and stale-edit tombstone early returns do not create receipts. An EPUB deletion purges all earlier receipt payloads for that account and book, then records its own accepted result. [Receipt Schema](../../supabase/migrations/20261030000100_reader_cloud.sql#L14), [Checked RPC and Purge](../../supabase/migrations/20261030000300_reader_deletion_and_invited_access.sql#L18)

| Situation | Required Information and Behavior |
| --- | --- |
| First success | The reader consumes the accepted key, value, and revision. A normalized success can differ from what the device sent. |
| Retry after a lost response | Return the original accepted result by account and UUID without reapplying. A reader's `cloud-flight` retains the request across reloads and offline periods. |
| Intervening write | Return the original accepted revision. `acceptCloud` uses it to rebase a newer pending edit, allowing an intervening value to raise a conflict. Reconstructing from the latest active row can grant a newer edit the wrong base. |
| Normalized fields | Shared progress, status, favorite, and recommendation can adopt organizer or sibling EPUB values. A replay must preserve what the server chose even if the submitted value or current row differs. The stored legacy result alone cannot reveal the original submitted value. |
| Concurrent devices | A different UUID with a stale base and different value receives a conflict from current cloud state. Replay and new operations must remain distinct. A conflict response needs the current value and revision, separate from compact success receipts. |
| Tombstones and restoration | A returned tombstone carries its own key, boolean value, and revision. While true, it blocks stale edits and uploads. A restore advances that marker and can restart per-field revisions. Exact replay can still return the historical true result. A separate generation check is needed for current file removal and writes. |
| Older clients | The legacy RPC looks up a valid UUID without rechecking the original request arguments. The organizer's offline queue can send the same UUID with a newly read base. A compact design that depends on request equality requires version negotiation. |

[Reader Flight and Tombstones](../../reader/src/cloud.ts#L132), [Acceptance and Rebase](../../reader/src/storage.ts#L179), [Shared-Field Normalization](../../supabase/migrations/20261102000300_reader_shared_markings.sql#L146), [Organizer Offline Queue](../../src/features/offline/OfflineProvider.tsx#L41)

## Method and Environment

The scripts used the repository's embedded PostgreSQL test harness. The server was PostgreSQL **17.5, wasm32**, matching the project's PostgreSQL major version. It used 8 KiB pages, PGLZ TOAST, 128 MiB of shared buffers, `fsync=off`, `synchronous_commit=on`, and `wal_level=replica`. This binary does not support LZ4. PGlite uses an in-memory filesystem and one backend, so latency reflects that environment. Native filesystem durability, hosted cache behavior, replication, and concurrent sessions were not measured. Code, migrations, settings, receipts, and polling in the production application were outside the experiment. [Project PostgreSQL Version](../../supabase/config.toml#L13), [PostgreSQL TOAST Storage](https://www.postgresql.org/docs/17/storage-toast.html)

The supplied hosted figures describe 23,817 receipts, 20,743 object-valued receipts across 367 keys, 20,728 distinct object values within those keys, approximately 84 MB in results, and 101 MB in physical relation size. The fixture is synthetic and interleaves the same counts of full receipts and object receipts across 12 users. It includes repeated manifest and position revisions, scalar markings and progress, notes, completed arrays, and alternating deletion and restoration receipts. The large objects contain generated metadata and high-entropy summaries. The row set does not claim to reproduce hosted field mix, entropy, user distribution, or activity rates. Normalized outcomes are exercised through the real SQL in correctness tests. In size trials the fallback ratios are assigned independently of field and payload size.

Three trials per design rotate the run order. A 1,000-row batch, a 9,000-row batch, and a 12,817-row batch measure receipt-only insert time. A 1,000-operation tail then upserts active values and appends receipts in a SQL loop, modeling successive mutations without recycling old receipt rows. Analyzed relations are probed by indexed account/UUID lookup, using the same deterministic set of 512 IDs. The first lookup pass is reported separately from nine warm passes. It is first-touch within an already running engine. Schema creation, source generation, and startup are outside the insert and lookup timings.

Physical measurements use `pg_total_relation_size`, `pg_relation_size`, and `pg_indexes_size` for both the main relation and its TOAST relation. Auxiliary forks account for the remainder. The harness also reports `pg_stats` widths and null fractions, column compression counts, and lookup and purge plans. Key cleanup targets the same 140 receipts for one account and book. `VACUUM (ANALYZE)` follows the write wave, followed by a timed deletion and a separate `VACUUM (FULL, ANALYZE)`. Gzip uses Node's zlib level 6 and stores compressed PostgreSQL JSON text as `bytea` with EXTERNAL storage. Its SQL insert uses pre-encoded input. Encode and decode time are recorded separately.

## Measured Storage and Performance

The fixture produced **20,728 distinct object values** across **367 keys**, with **3,811 bytes** of JSON text per result on average and a **50,594-byte** maximum. It held **86.56 MiB** of serialized result text and **87.63 MiB** from summing the source JSONB column datum sizes. The baseline allocated **105.19 MiB**. These three measures capture different things.

Bulk insert and warm lookup cells give the median and observed range. Bulk insertion measures 22,817 receipts per trial. Warm lookup is per returned result, derived from a 512-result batch and including the gzip decode time where relevant. These are amortized latencies.

| Design | Physical MiB | Savings | Bulk Insert ms | Warm Lookup µs/result | Compatibility |
| --- | ---: | ---: | ---: | ---: | --- |
| Full JSONB | 105.19 | Baseline | 1,847 (1,730–1,933) | 23.8 (21.2–30.4) | Existing v1 |
| Structured, Full Payload | 104.37 | 0.8% | 1,831 (1,650–2,113) | 24.9 (23.6–39.9) | v1 replay compatible |
| Hybrid, 5% Fallback | 11.01 | 89.5% | 982 (969–1,011) | 50.5 (48.1–52.5) | Versioned only |
| Hybrid, 25% Fallback | 30.53 | 71.0% | 1,023 (994–1,099) | 42.3 (41.6–57.1) | Versioned only |
| Hybrid, 50% Fallback | 55.08 | 47.6% | 1,383 (1,378–1,561) | 37.4 (37.3–50.1) | Versioned only |
| JSON Text / PGLZ | 106.01 | -0.8% | 2,899 (2,135–3,661) | 26.9 (24.9–32.7) | v1 replay compatible |
| Gzip / Bytea | 64.09 | 39.1% | 634 (607–1,001) | 184.7 (177.9–233.2) | Requires a server codec |

### Relation Breakdown

The scale columns are measured at those exact row counts. Heap, indexes, TOAST, and bytes per row are for 23,817 receipts, before maintenance. Main heap and TOAST heap are main forks. Auxiliary forks account for the small gap between the components and total.

| Design | 1,000 MiB | 10,000 MiB | Bytes/Receipt | Main Heap MiB | Ordinary Indexes MiB | TOAST Heap MiB | TOAST Indexes MiB | Auxiliary MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Full JSONB | 3.80 | 43.86 | 4,631 | 3.43 | 1.53 | 99.00 | 1.16 | 0.07 |
| Structured, Full Payload | 3.83 | 43.57 | 4,595 | 4.46 | 1.82 | 96.88 | 1.13 | 0.07 |
| Hybrid, 5% Fallback | 0.56 | 4.69 | 485 | 4.34 | 1.82 | 4.73 | 0.07 | 0.05 |
| Hybrid, 25% Fallback | 1.18 | 12.78 | 1,344 | 4.37 | 1.82 | 24.00 | 0.30 | 0.05 |
| Hybrid, 50% Fallback | 2.02 | 23.09 | 2,425 | 4.40 | 1.82 | 48.23 | 0.58 | 0.05 |
| JSON Text / PGLZ | 3.89 | 44.25 | 4,667 | 4.93 | 1.82 | 98.04 | 1.15 | 0.07 |
| Gzip / Bytea | 2.58 | 26.70 | 2,822 | 4.77 | 1.82 | 56.75 | 0.70 | 0.05 |

### Update, Cleanup, and Maintenance

| Design | Bulk Rows/s | 1,000 Repeated Updates ms | First Lookup Batch ms | Purge 140 Rows ms | After Vacuum MiB | After Delete MiB | After Rewrite MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Full JSONB | 12,351 (11,807–13,191) | 210 (201–436) | 13.5 (12.8–18.4) | 8.90 (8.65–10.65) | 105.20 | 105.20 | 107.87 |
| Structured, Full Payload | 12,459 (10,800–13,827) | 138 (137–160) | 13.8 (13.5–14.7) | 0.74 (0.68–1.28) | 104.38 | 104.38 | 106.89 |
| Hybrid, 5% Fallback | 23,242 (22,578–23,551) | 129 (120–136) | 31.9 (27.9–32.4) | 0.68 (0.66–0.69) | 11.02 | 11.02 | 10.64 |
| Hybrid, 25% Fallback | 22,298 (20,753–22,950) | 129 (117–138) | 23.4 (21.6–27.2) | 0.67 (0.65–0.72) | 30.55 | 30.55 | 30.90 |
| Hybrid, 50% Fallback | 16,496 (14,621–16,557) | 155 (148–163) | 26.6 (25.0–30.8) | 0.68 (0.66–1.00) | 55.09 | 55.09 | 56.21 |
| JSON Text / PGLZ | 7,870 (6,232–10,688) | 194 (158–234) | 17.3 (15.4–26.9) | 0.72 (0.68–0.78) | 106.02 | 106.02 | 108.57 |
| Gzip / Bytea | 35,965 (22,796–37,607) | 135 (121–152) | 113.9 (94.4–126.8) | 0.67 (0.63–0.73) | 64.11 | 64.11 | 65.34 |

The baseline cleanup plan used the primary-key owner prefix and examined that owner’s JSON results. The other plans used an owner/book expression index and a prefix filter. These cleanup timings illustrate the index effect as well as the representation effect. They do not establish a speedup for a single hot production account. The indexed UUID replay path was present for all candidates. Page allocation was identical across trials before maintenance. Purge did not release allocated pages immediately, and some rewrites packed the relations less densely than the original incremental load.

PostgreSQL reported no values stored with native PGLZ compression for this fixture despite PGLZ being enabled and out-of-line TOAST being used. This makes the compression results sensitive to the fixture's generated summary entropy. Gzip encoded **51.01 MiB** of payloads in **1.53 s** and decoded them in **0.33 s** in a separate Node 24.22.3 and zlib 1.2.12 run. Encoding averaged **64 µs per receipt** before SQL insertion. The insert table excludes producer encoding. Gzip lookup timings also include the embedded client's bytea transport and decoding and should not be read as native database codec timings. No hosted LZ4 or native-server codec comparison was run.

## Compatibility and Correctness

The correctness harness reruns the real migrated RPC against the original table, and against SQL copies that substitute the isolated candidate receipt lookup, insert, and purge. This retains the actual access checks, advisory lock, current-state writes, shared-field normalization and deletion logic. The scenarios model devices using different operation UUIDs and observed revisions for the same account, and use separate Auth identities for owner isolation. They exercise interleavings in one backend. They do not measure simultaneous SQL sessions, the real Storage service, or the PostgREST serializer.

| Design | Classification and Evidence |
| --- | --- |
| Existing, structured full payload, and text/PGLZ | **Fully compatible with current receipt replay.** Tests return identical PostgreSQL JSONB text for the original accepted result, even after an intervening write or a retry with a different valid request. First-write responses, normalized replies, conflicts, and account isolation remain intact. The stored value or text is always available. |
| All hybrid ratios | **Coordinated server and client changes required.** For compact rows the original accepted value can be reconstructed only from a request with the stored key and accepted-input hash. Omit the payload only if the server compares the accepted and input canonical JSON text at write time. Normalized results remain stored. A changed valid request under the same UUID is rejected on a compact row, where v1 would return the historical success. A missing original request or request canonicalization change can also prevent replay. |
| Gzip | **Unavailable as a drop-in with the existing SQL RPC.** The harness verified exact gzip round trips, separate-owner UUID scope, and key purge in PostgreSQL under the private table privileges. It did not route live mutation handling through gzip. Exact replay could be compatible with unchanged clients if an approved transactional server-side codec can restore the same JSONB. A separate service would need to preserve RPC security and atomicity. |
| Key/revision only or latest-value pointer | **Unable to preserve the required semantics.** The historical accepted value can be overwritten, normalized, or removed. The current row and a receipt hash cannot recover arbitrary historical bytes. |

The SQL tests also verify that newer local work rebased on the original revision still conflicts after another device advances the key. A retained v1-style tombstone acknowledgement still returns the historical true value after the book is restored. The harness verifies that it differs from the current marker and should confer no current deletion authority. The current client can act on that historical reply. No representation change alone fixes that, and no generation fence or Storage integration was implemented by this benchmark. PostgreSQL JSONB text equality was measured. Actual HTTP byte equality also depends on PostgREST serialization and response handling.

## Supabase Cost Projection

Supabase currently lists a 500 MB database size allowance per Free project. Supabase distinguishes that metric from provisioned disk space, including WAL and other transient files. This projection treats the supplied MB values as a consistent reporting unit. It uses the supplied 101 MB receipt relation as one cohort, multiplies measured size ratios rather than adding the benchmark’s MiB to hosted MB, and holds other database usage at 203 MB. [Supabase Pricing](https://supabase.com/pricing), [Database and Disk Size](https://supabase.com/docs/guides/platform/database-size)

**Assumption for scale and duration.** Each active user adds one cohort of 23,817 successful receipts per month with the same mix and no expiry. The historical receipt count is a stock measurement and does not establish that monthly rate. The 10-, 100-, and 1,000-user columns show new receipt growth per month. Time starts at the current 304 MB, keeps legacy receipts in place, and uses the stress-rate assumption with all new operations on the named design.

| Design | Equivalent 101 MB Relation → MB | Reduction MB | 10 Users MB/mo | 100 Users MB/mo | 1,000 Users MB/mo | Days to 500 MB at 10 / 100 / 1,000 Users |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Full JSONB | 101.0 | 0.0 | 1,010 | 10,100 | 101,000 | 5.82 / 0.582 / 0.0582 |
| Structured, Full Payload | 100.2 | 0.8 | 1,002 | 10,021 | 100,212 | 5.87 / 0.587 / 0.0587 |
| Hybrid, 5% Fallback | 10.6 | 90.4 | 106 | 1,057 | 10,570 | 55.6 / 5.56 / 0.556 |
| Hybrid, 25% Fallback | 29.3 | 71.7 | 293 | 2,932 | 29,316 | 20.1 / 2.01 / 0.201 |
| Hybrid, 50% Fallback | 52.9 | 48.1 | 529 | 5,289 | 52,885 | 11.1 / 1.11 / 0.111 |
| JSON Text / PGLZ | 101.8 | -0.8 | 1,018 | 10,179 | 101,788 | 5.78 / 0.578 / 0.0578 |
| Gzip / Bytea | 61.5 | 39.5 | 615 | 6,154 | 61,542 | 9.55 / 0.955 / 0.0955 |

The reduction column is a hypothetical replacement of the entire old relation after physical reclamation. Compact v2 deployment alone does not achieve that reduction. At a tenth of the assumed operation rate, time to the allowance is ten times as long, holding the rest constant. Real account growth, smaller public-user libraries, retained legacy writers, backfills, application-wide growth, and disk reporting can dominate these estimates.

Hybrid reduces TOAST writes in the tested workload at the cost of computing a request digest on applicable writes and replays. Indexes add per-write work, and a dual-write migration temporarily adds another set of writes. Gzip trades CPU and codec complexity for storage reductions. Compaction with the same response shape saves **zero client response bytes by itself**. A negotiated compact response might save mutation egress. Routine snapshots, EPUB downloads, and the frontend polling change are independent.

## Validation Summary

- `node benchmarks/reader-cloud-receipts/benchmark.mjs 3` completed all 21 trials and emitted stats, size breakdowns, and query plans. Each design retained exactly 23,817 rows before the purge, and cleanup removed the same 140 rows.
- `node benchmarks/reader-cloud-receipts/verify.mjs` passed the original and six SQL-storage paths, plus the gzip representation checks. It reproduced the historical-delete replay for every SQL path.
- `npm exec -- vitest run supabase/tests/reader-cloud.test.ts` passed all eight existing reader-cloud database tests.
- `npm exec -- eslint benchmarks/reader-cloud-receipts/*.mjs --max-warnings 0` and `git diff --check` passed.
- The local environment probe confirmed PostgreSQL 17.5 and PGLZ support. Its LZ4 DDL probe reported the codec unsupported. The Docker socket was inaccessible under the sandbox, and no native server timings were collected. The reproducible setup uses the repository dependency already installed.

See the [Migration Proposal](MIGRATION.md) for the staged design, backup, mixed-version rollout, and rollback requirements.

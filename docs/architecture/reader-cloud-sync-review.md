# Beyond the Archives Reader Cloud Sync Review

## Executive Summary

`reader_cloud_receipts` is a durable idempotency ledger for successful mutations. It stores the original RPC response under the account and operation UUID. An old receipt is read when a client retries that exact UUID. Routine pulls, new-device recovery, and conflict resolution instead use current rows in `reader_cloud_values` and account-local IndexedDB state.

Receipts occupy **101 MB**, about **33% of the measured 304 MB database** and **39 times** the size of the active cloud-value table. Most measured object-valued receipts contain distinct accepted values within their key. The schema defines no receipt age limit or acknowledgement cleanup. Removing receipts by age would let old retries fall through to normal execution, including in cases where the server can increment a revision or apply a stale intent.

The storage priority is to preserve operation identity while reducing the successful result stored per operation. The egress priority is to avoid downloading full cloud snapshots when nothing changed. The visible reader polls every 30 seconds, and a separate 15-second transfer poll can start a full sync before discovering an empty inbox.

This is a static review of repository commit `4ed1c939dae3b215ca3dae42bdb6fd702e4a7b95` and the supplied Supabase measurements. Hosted function definitions, schedules, deployed client versions, traffic attribution, and migration outcomes remain unverified. Existing tests were inspected in source.

## Supplied Measurements

| Measure | Value |
| --- | ---: |
| Database size | 304 MB |
| Monthly egress | 4.063 GB |
| Monthly Logs Query | 10.044 GB |
| Monthly Logs Ingest | 0.595 GB |
| Receipt rows | 23,817 |
| Receipt table physical size | 101 MB |
| Receipt TOAST storage | 93 MB |
| Stored receipt result JSONB | 84 MB |
| Active cloud-value rows | 1,843 |
| Active cloud-value physical size | 2.6 MB |

There were **20,743 object-valued receipts** across **367 keys**, with **20,743 distinct revisions** and **20,728 distinct values** when summed across keys. Of those keys, 169 had multiple receipts and only two had repeat values. Object-valued receipts accounted for approximately **82 MB**. The 93 MB of TOAST storage is included in the 101 MB physical size. The 84 MB payload measurement is a separate view of the data.

## Current Synchronization Flow

1. **Save and queue locally.** `saveBook` and `mutateBook` call `putBook` to update the book and catalog and queue changed cloud fields in the same IndexedDB transaction. `cloudBookFields` splits a book into a manifest, position, progress, notes, markings, completion state, and individual `history:<event-id>` records. Preferences use a separate key. `queueCloud` creates a UUID with `crypto.randomUUID()` and uses the last known revision, defaulting to zero. Later edits replace the unsent entry for that key. Account libraries have separate IndexedDB databases. [Account storage](../../reader/src/storage.ts#L7), [book writes](../../reader/src/storage.ts#L91), [queue](../../reader/src/storage.ts#L160), [field model](../../reader/src/cloud-model.ts#L3)
2. **Start a cloud pass.** `App.sync` waits for pending position saves. `syncCloud` requires an online account reader, coalesces calls within a page, and uses an account-scoped Web Lock when available. `performSync` verifies owner access, reads deletion markers, resumes any persisted `cloud-flight`, and prioritizes deletion keys among newly selected edits. Ordinary book edits ensure the immutable, hash-addressed EPUB is uploaded if an original is locally available and the upload is unconfirmed. [App orchestration](../../reader/src/App.tsx#L317), [owner check, upload, and sync](../../reader/src/cloud.ts#L98)
3. **Freeze and send the request.** The reader persists the exact operation ID, key, value, and base in `cloud-flight` before calling `reader_cloud_apply`. The RPC accepts a typed UUID and checks account access, a nonnull ID, a key of 1–200 characters, a nonnull JSONB payload of at most 2 MiB as SQL text, and a nonnegative base. The advisory transaction lock serializes RPC calls for the account, including writes to absent keys. On a receipt hit the RPC returns the stored result before checking the tombstone or current row. The lookup is by `(user_id, id)` and does not compare the submitted key, value, or base against the original request. The UUID carries no age or installation identity. [Outbox](../../reader/src/cloud.ts#L132), [RPC](../../supabase/migrations/20261030000300_reader_deletion_and_invited_access.sql#L18)
4. **Apply or return current state.** A live tombstone blocks ordinary writes and returns the tombstone. For other writes, a mismatched base and different value produce a conflict with the current value and revision. An absent row uses revision zero. An equal value can succeed with a stale base and still produces a new revision and receipt. The shared-marking migration adds an initial association merge for linked progress, status, favorites, and recommendations, so an accepted value can differ from the request. The current row and successful receipt commit together. Conflict and tombstone early returns create no receipt. [Write and deletion logic](../../supabase/migrations/20261030000300_reader_deletion_and_invited_access.sql#L24), [shared-field merge](../../supabase/migrations/20261102000300_reader_shared_markings.sql#L146)
5. **Accept the reply and pull.** `acceptCloud` persists the returned key, value, and revision as the baseline. It clears the matching UUID, rebases a newer edit on the accepted revision, and applies a server-normalized shared field when necessary. `performSync` clears the flight after processing the reply. A failed request can replay across a reload. Each successful pass then downloads current rows in 500-row keyset pages, applies deletions and manifests before dependent fields, and skips ordinary dirty fields and unchanged revisions locally. [Reply processing and pagination](../../reader/src/cloud.ts#L147), [local acceptance](../../reader/src/storage.ts#L179), [remote application](../../reader/src/cloud.ts#L181)

### Other Readers and Writers

- **Organizer offline markings.** `OfflineProvider.mark` saves a UUID and marking in the organizer’s retained snapshot. On reconnect, `refresh` reads the current revision and sends the same UUID to `reader_cloud_apply`. It refreshes the base on each attempt and checks the response’s conflict flag before dropping the queued edit. Markings of an organizer entry instead use `updateEntry`. Any legacy RPC compatibility policy must cover both applications. [Organizer offline queue](../../src/features/offline/OfflineProvider.tsx#L35)
- **Shared fields and linkage.** `reader_prepare_shared_value`, `reader_share_cloud_value`, `reader_share_organizer_state`, and `reader_reconcile_account` initialize and propagate shared fields. `reader_write_work_field` directly updates cloud rows and increments revisions where the value differs, without creating a reader receipt. The trigger path does not acquire the reader RPC’s advisory lock in the reviewed code. The reader’s separate organizer queue uses `userscript_library` through `synchronize`, with checked saves and its own baselines. [Shared state triggers](../../supabase/migrations/20261102000300_reader_shared_markings.sql#L37), [organizer queue](../../reader/src/sync.ts#L11)
- **New devices and offline hub.** A device rebuilds its catalog from current manifests and fields, including the separate reading-history keys. `downloadCloud` downloads an original on demand and verifies its hash. `reader_offline_snapshot` projects active cloud rows, organizer stories, and availability for the organizer offline hub and reader collection counts. [Download](../../reader/src/cloud.ts#L243), [offline snapshot](../../supabase/migrations/20261101000200_reader_cloud_hub.sql#L3), [progress projection](../../supabase/migrations/20261102000200_reader_explicit_progress.sql#L2), [collection counts](../../reader/src/ReaderCollections.tsx#L99)

## Receipt Purpose and Lifecycle

| Use | Receipt Dependency |
| --- | --- |
| Lost response after commit | Replaying the original UUID returns the original success, even if another writer has advanced the row. The original accepted revision matters when rebasing a newer local edit. Substituting the latest revision could let that edit overwrite an intervening change without a conflict. |
| Ordinary synchronization and new-device recovery | These read current values. A never-sent offline edit has no receipt. A committed edit whose reply was lost can require a receipt after an arbitrarily long offline period under the current contract. |
| Conflict resolution | The RPC returns the current row and revision. `resolveCloud` saves the discarded variant in local `cloud-conflict:*` settings. Choosing the device value creates a new UUID at the observed cloud revision. Choosing the cloud value removes only the matching queued edit and applies the cloud state. |
| Historical records | Receipts incidentally retain earlier accepted results. They omit rejected conflicts, tombstone redirects, and direct trigger writes. No production receipt-history reader, history API, or timestamp was found. User-visible history is stored as current `history:*` values. |

The current reader uses `result.value` on successful replies. It saves the value as a baseline, applies normalization for shared fields, and interprets `value: true` on a deletion key as a tombstone. The stored payload can be omitted for classes of success where the exact result can be reconstructed or a versioned client understands a compact acknowledgement. Returning only a revision through the legacy RPC, echoing every input, or looking up the latest active value would change behavior. Conflict replies independently need the current value. [Conflict recovery](../../reader/src/cloud.ts#L224), [local acceptance](../../reader/src/storage.ts#L179)

### Deletion, Reimport, and Retention

`deleteBook` erases local files, reading data, queues, and conflict variants, and then queues `<hash>/deleted = true`. Explicit account deletion retains a catalog placeholder. A successful server delete keeps the tombstone and removes the other cloud rows, matching inbox rows, and all prior receipts for that hash using the key inside `result`. It then writes a deletion receipt. The client waits for Storage API removal before clearing the placeholder. Storage failures remain retryable, and an active tombstone blocks ordinary stale writes and Storage inserts. An explicit reimport queues `false` against the observed tombstone revision. Removing a download locally preserves cloud state. [Local deletion](../../reader/src/storage.ts#L115), [server deletion and Storage policies](../../supabase/migrations/20261030000300_reader_deletion_and_invited_access.sql#L27), [remote tombstones](../../reader/src/cloud.ts#L181), [reimport](../../reader/src/import-books.ts#L50)

EPUB deletion and Auth user deletion are the checked-in receipt removal paths. The Auth foreign keys cascade. The schema has no creation timestamp, expiry, or acknowledgement, and the repository defines no time-based cleanup for this table. Hosted cleanup outside the repository requires separate verification. [Schema and privileges](../../supabase/migrations/20261030000100_reader_cloud.sql#L14)

Two existing delete-and-restore scenarios deserve explicit verification. A cached successful deletion can outlive restoration, and a receipt hit occurs before the current tombstone check. The client can interpret that replay as authority to remove the current file. Also, a device that misses the active tombstone and returns after reimport can encounter a restarted per-key revision that matches an old edit. These scenarios follow from the code. Their occurrence in production is unverified. A revised protocol should distinguish the outcome of an old mutation from authority to write to or delete the current book generation.

## Storage, Egress, and Logging

### Confirmed Storage Drivers

Each successful RPC upserts a current value and inserts the full response into receipts. If that accepted value is still current, the same value exists in both tables. Earlier accepted values remain in receipts until a deletion path removes them. A same-value write under a fresh UUID can still increase the revision and write a receipt, while a hit for an existing UUID skips both writes.

The object-valued sample has only 15 occurrences above its distinct-value count, so exact deduplication has limited reach by row count. Byte savings from those duplicates remain unmeasured. Scroll and page turns update position locally, and local edits coalesce by key before sending. Position, preferences, manifest metadata, anthology updates, and organizer-driven book writes are plausible churn sources. The data supplied does not establish which families account for most receipt bytes. [Position capture](../../reader/src/ReadingView.tsx#L102), [position writes](../../reader/src/App.tsx#L458), [organizer projection](../../reader/src/sync.ts#L137)

### Paths to Profile

| Path | What to Measure |
| --- | --- |
| App schedule and cloud pulls | Startup, reconnect, visible focus and visibility changes, and the 30-second visible-tab timer can trigger a pass. Each pass does a deletion preflight and a full pull. Linked organizer sync can cause a second pass. If all 1,843 rows belonged to one account, one full pull would require four pages plus the preflight. Measure actual transferred bytes per pass and the fraction downloaded with unchanged revisions. [Scheduling](../../reader/src/App.tsx#L317), [page reads](../../reader/src/cloud.ts#L161) |
| Transfer polling | The 15-second poll can run cloud sync before querying up to 50 inbox jobs. Measure empty polls, overlap with the app scheduler, and EPUB downloads separately. Real imports can require a fresh publication sync before acknowledgement. [Timer](../../reader/src/App.tsx#L414), [inbox worker](../../reader/src/transfers.ts#L146) |
| Organizer and offline snapshots | Measure connection checks, per-work reads, availability reports, and the offline snapshot. Background organizer refresh checks up to 50 candidate EPUB versions and has a one-minute checkpoint. Forced sync can scan all candidates. Offline snapshots may include metadata and notes as well as organizer stories. [Organizer refresh](../../reader/src/sync.ts#L41), [snapshot SQL](../../supabase/migrations/20261101000200_reader_cloud_hub.sql#L3) |
| Logs and billing attribution | The reviewed mutation SQL emits no per-success application log, and reader sync status updates in-page state. Request volume can still generate platform log ingestion. Logs Query measures log data scanned, while Logs Ingest measures data the platform receives. Separate Database and Storage egress before attributing the 4.063 GB total. [Reader status](../../reader/src/sync-status.ts#L13), [Supabase Logs Usage](https://supabase.com/docs/guides/platform/manage-your-usage/logs), [Supabase Egress Usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress) |

## Optimization Strategies

| Strategy | Benefits | Compatibility, Migration, and Safety |
| --- | --- | --- |
| Lossless changes behind the existing RPC | Typed key and revision fields can reduce envelope overhead and support targeted receipt deletion. Alternative encodings need benchmarking against current TOAST storage. | Legacy clients can continue retrying if every original response remains recoverable. A reference to the mutable current row alone is insufficient after another write. An immutable history table retaining all payloads mostly moves the storage cost. |
| Versioned compact receipts | Store operation identity, accepted key and revision, outcome, and request binding. A new client can use its frozen input for proven pass-through successes. Keep the value for normalized or otherwise non-reconstructible outcomes. | Add a versioned RPC and persist protocol version with in-flight requests. Preserve exact legacy replay and the original accepted revision. The organizer refreshes its base on retry today, so full request binding requires migrating that caller or designing for its retry contract. Tie current tombstone effects to the current generation. |
| Time-based expiry | Can bound storage once old requests have explicit server and client handling. Current rows have no creation time. | A missing legacy UUID can execute again. Same-value writes, initial shared-field merges, and revision reuse after reimport prevent base checks from being a universal replay guard. Expiry requires non-applying rejection or durable deduplication plus recovery that preserves local intent. Retain exact legacy replay while those queues remain supported. |
| Client acknowledgements | Accepted payloads can be reclaimed after the client acknowledges durable local processing. A compact applied-ID ledger or proven device watermark can prevent repeat application. | Handle lost acknowledgements, reinstallations, gaps, and out-of-order requests. Existing UUIDs are unordered and current clients do not acknowledge receipt consumption. Preserve their existing retry path. |
| Smaller payloads, fewer writes, and incremental reads | A lightweight change check or incremental response addresses repeated full downloads. Avoiding full sync on empty inboxes and coalescing high-frequency writes can lower request and write volume. | Cover direct organizer-trigger writes, deletions, restores, and fresh-device bootstrap. Preserve explicit reread resets and durable conflicts. Suppressing same-value revision increments changes the current contract. Separate retention of reading history from retention of operation receipts. |

### Expected Impact

**Storage ceiling.** At an assumed 150–300 bytes per row including indexes and overhead, 23,817 compact receipts would occupy about **3.6–7.1 MB**. Compared with the reported 101 MB relation, a successful rebuild or rewrite could recover **94–97 MB**, or about **31–32%** of the reported database size. This is an illustrative upper-end opportunity. Legacy payload retention, normalized responses, indexes, and the measured physical footprint after cleanup determine actual savings.

**Egress.** Storage-only receipt compaction with the same RPC response directly saves approximately **zero response bytes**. Estimate snapshot savings as full pulls avoided × measured transferred bytes per pull, minus replacement traffic. For example, avoiding two 250 kB pulls per visible minute for one hour a day over 30 days would avoid **0.90 GB** before replacement traffic. The byte size and activity pattern are assumptions. The on-disk cloud-value size does not measure network transfer.

## Recommended Implementation Sequence

### Phase 1 — Low-Risk Improvements

1. Verify hosted definitions, privileges, schedules, and deployed callers. Measure receipt bytes by key family and separate heap, index, TOAST, and free space. Profile an idle visible reader, active reading, and a Calibre import. Capture route-level counts, bytes, and timings without recording user payloads or credentials.
2. Establish isolated regression coverage for exact replay after an intervening write, server-normalized responses, a newer local edit arriving during a request, and organizer-trigger writes racing a reader call. Measure the receipt-purge query before adding an index.
3. Benchmark storage-only designs using a representative isolated copy. Require legacy response and purge parity, and include full fallback payloads in projections for the mixed-client period.

### Phase 2 — Synchronization Protocol Improvements

1. Reduce idle downloads. Separate a cheap inbox check from full sync while preserving deletion checks before consumption and publication before acknowledgement. Add a lightweight change check or a commit-safe per-account cursor with a full-snapshot fallback. Advance a cursor only after local application is durable, and cover every current-value writer and deletion path.
2. Add versioned compact acknowledgements. Keep the write and ledger record atomic. Preserve the accepted revision and normalized values as needed. Make local acceptance and flight clearing safe to retry. Introduce a book generation boundary and ensure old deletion replays cannot remove restored EPUBs. Verify synchronization with organizer-trigger writes.
3. Migrate both queue producers and exercise mixed builds. Keep a frozen legacy operation on its original replay path. Introduce acknowledgement or expiry only after the server can handle old IDs without reapplying them and upgraded clients can recover with local intent intact.

### Phase 3 — Database Cleanup and Migration

1. Restore a reader-specific backup in isolation before cutover. Include cloud values, receipts, relevant inbox state, and the original EPUB objects or verified references. Organizer backup and restore exclude Reader cloud data and Storage objects. [Reader backup scope](../../reader/docs/IMPLEMENTATION.md#L176)
2. Roll out additively and backfill in restartable batches. Verify owner and operation-ID coverage, exact legacy response parity, and EPUB deletion parity. Live deletes must purge both representations, and a resumed backfill must not reinsert erased receipts. Keep exact legacy replay until compatibility or an explicitly supported old-client recovery path is proven.
3. Measure logical savings and physical reclaim separately. Ordinary vacuum primarily makes space reusable. A fuller rewrite or validated table replacement can reduce physical size with lock and temporary disk costs. Choose a reclamation procedure after measuring lock time, headroom, rollback, and the hosted size metric. [PostgreSQL Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html), [PostgreSQL VACUUM](https://www.postgresql.org/docs/current/sql-vacuum.html)

## Test and Migration Requirements

| Scenario | Verify |
| --- | --- |
| Offline edits and reconnection | Reload while offline, coalesce multiple edits to one key, preserve separate history events, and apply a newer edit saved while a request is in flight. Verify fresh-device restoration from current state. |
| Timeouts and interruption | Drop replies before and after commit. Interrupt between local acceptance and flight clearing. Replay after an intervening write. Require one application per accepted operation and no repeated organizer side effects. Cover normalized values. |
| Concurrent devices and organizer edits | Test equal and differing values, organizer-trigger races, and tabs with and without Web Locks. Verify accepted revisions and the conflict that follows an intervening edit. |
| Conflict recovery | Exercise both choices, retain the discarded variant, and ensure an outdated conflict cannot remove or silently overwrite newer edits. Include explicit progress decreases and rereads. |
| Deletes and tombstones | Cover lost delete replies, failed Storage removal, pending placeholders, receipt purge, and reimport. Race stale device mutations and old delete replay against restoration of the same hash. Verify publication before inbox acknowledgement. |
| Long-offline clients | Reconnect pre-upgrade Reader and Organizer builds. Cover never-sent operations and committed operations with lost responses across any new expiry boundary. Verify no reapplication and recovery that preserves local intent. |
| Interrupted migration | Stop backfill and cutover while writes and deletes continue. Verify resumption, parity, owner isolation, no restoration of erased data, temporary disk headroom, and rollback at each stage. |

Existing SQL tests cover basic replay, revision conflicts, deletion, reimport, and shared markings. Browser tests cover new-device sync, offline use, Storage removal failures, and Calibre publication. Add explicit coverage for replay after a different write, generation races, mixed client versions, and interrupted migration. [SQL tests](../../supabase/tests/reader-cloud.test.ts#L21), [browser tests](../../reader/tests/browser/cloud.spec.ts#L14)

## Unanswered Questions

- Which key families and deployed client versions produced the 82 MB of object-valued receipt storage? How often would a compact receipt need to preserve an accepted value?
- Which hosted functions, grants, triggers, and schedules differ from the migration chain? Do external callers or old service-worker builds still use the legacy RPC?
- What share of actual egress comes from full cloud snapshots, inbox polling, organizer requests, and original-file downloads? Which services and queries account for log ingestion and scans?
- How frequently do installations reconnect with a persisted flight or organizer marking? Deployment age alone cannot establish that old queues have drained.
- How much receipt space is live payload versus reusable space? What lock time, headroom, and physical recovery does a representative rewrite require?

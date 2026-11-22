# Hosted Development Reader Protocol Reset

The hybrid protocol is a coordinated pre-release cutover. The forward migration refuses to run if any legacy reader receipts, reader cloud values, inbox rows, or Reader EPUB objects remain. Fresh isolated databases replay the complete migration chain without a reset.

**Owner authorization is required before any hosted reset, Storage removal, data disposal, or deployment.** The protocol was also validated on isolated Supabase staging with disposable EPUBs, the deployed Calibre inbox, and a locally built Reader.

## Before the Maintenance Window

1. Verify target project identity and rehearse with generated data on a disposable project. Verify the latest reader, organizer, and `reader-inbox` builds against the final schema.
2. Inventory cloud-only EPUBs and local downloads on every installation. Back up the private originals with checksums as well as Reader values, receipts, inbox metadata, and relevant reader linkage records. Include exportable local notes, positions, history, pending changes, and Calibre files. Use a secure destination. Existing Organizer JSON backup excludes Reader data.
3. Verify the backup by restoring a representative original and private reader state in an isolated environment. A fresh import restores an EPUB and publication metadata. It does not automatically restore an old cloud outbox, notes, or epochs.
4. Obtain approval for the specific hosted project, data categories, and expected loss of online Reader state. Obtain rollout approval separately if required by the release process.

## Quiesce and Reset the Opted-In Project

1. Stop Calibre transfers and the legacy delivery handler. Stop writes from both frontends. Close Reader and Organizer tabs and installed PWAs on all devices, including offline ones. Retire legacy service-worker and app builds through the controlled release process. Revoke old reader installation and Calibre pairing credentials after recording the destinations that need reconnecting.
2. After explicit authorization, remove the private Reader originals through the **Storage API**. Inventory and confirm the bucket is empty. SQL deletion of Storage metadata does not remove the object bytes.
3. After explicit authorization, clear Reader cloud values, mutation receipts, and inbox rows. Reset stale Reader availability reports and obsolete installation pairing state as applicable. Preserve the Auth users, Organizer library, Organizer settings and unrelated browser companions. The migration checks the three Reader tables and EPUB bucket across the project.
4. Apply `20261121000100_reader_hybrid_sync.sql` and `20261121000200_reader_inbox_access_grant.sql` through the repository's approved migration workflow. Verify the only RPC signature is `reader_cloud_apply(uuid,text,jsonb,bigint,bigint)`, the ledger has forced RLS, and Storage only accepts generation-qualified paths. Verify the Edge Function's service role can read `reader_app_access.user_id` to authorize Calibre deliveries. Deploy the compatible Reader, Organizer, and Edge Function together before reopening writes.
5. On each installation, back up any remaining local-only edits before clearing the old **account** IndexedDB library and its cloud flights and baselines, plus the Organizer Offline cache and pending markings. Clear obsolete Reader service-worker caches and fully close old app tabs. A guest library is independent and should be preserved. Clear or restage Calibre jobs and pairings so old transfer UUIDs are not retried into the empty development database.
6. Sign in on the new builds, reconnect the organizer and Calibre as needed, and reimport verified EPUBs from the owner backups. Verify a two-device lost-response retry, a Calibre upload, and deletion followed by same-hash reimport. Verify the old object path cannot remove the restored file.

Verify physical removal with the Storage API's deletion result and a fresh authenticated download using a unique query parameter. A previously cached download URL can briefly return the retired EPUB while [Supabase CDN invalidation](https://supabase.com/docs/guides/storage/cdn/smart-cdn) propagates.

## Recovery

Stop writes if any cutover gate fails. Restore a matched pre-cutover snapshot only together with the matching pre-cutover application, Edge Function, and Storage backup. The old and new layouts are not interchangeable. After the new protocol has accepted changes, capture those changes separately before considering rollback. A failed guard should leave the old schema intact.

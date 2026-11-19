# Library Backups

DNF cleanup adds compact reading records and account cleanup preferences to JSON backups, and `reading_records.csv` to CSV exports. Apply `20261024000200_dnf_cleanup.sql` for these fields. Older version-1 files remain accepted with an empty compact archive. See [DNF cleanup](DNF_CLEANUP.md) for retention and recovery behavior.

Apply migrations through `supabase/migrations/20261118000300_crosspost_organization.sql` before deploying the frontend. In Settings → Export Backup, download a versioned JSON file or choose **Save Backup to Supabase** to store a private copy. Both use the same consistent database snapshot of the signed-in account, independent of loaded pages and PostgREST's row limit.

Included: all library entries and their original URLs, source metadata and normalized authors/fandoms/tags, chapter verification data, personal/extension overrides, reading progress and dates, notes, favorites, ratings, personal tags, collections and memberships (including appearance, order, visibility and automatic rules), saved series and memberships, metadata preferences, import batches/items/jobs/logs, and timestamps. Works referenced only by retained import jobs are included too. Browser display/date/page-size/reading/collection-sort preferences come from the exporting browser and are stored separately as `browser_preferences`.

Excluded: Auth accounts/passwords/sessions/MFA, application role assignments and administrative audit, reader cloud records and original EPUB bytes, provider configuration/keys, paired-device secrets, active worker lease credentials, global worker throttling/fairness state, backup save cooldown/leases, and derived search documents. Whole-project recovery must preserve verified Auth UUID continuity or use separately approved ownership/object-prefix remapping; matching an email is not identity recovery. Reconnect paired devices through the approved recovery process. The application schema, policies and functions come from migrations, rather than the data file. This is an account data export, not a whole Supabase project dump. Future incompatible schema changes must bump the backup version and add a format migration before accepting older files.

Unlinked AO3-only libraries export version 1. Libraries with universal manual stories export version 2, and libraries with linked versions export version 3. Current restore accepts all three versions. Linked backups include confirmed chapter correspondence, shared reading status, and reconciled organization alongside original source data. Upgrade the database, organizer, and infrastructure restore script before restoring linked backups.

Export site mappings separately from **Settings → Imports & Connections → Site Mappings**. The portable file can be imported for review. **Classification Rules → Export Rules** downloads rules for reference. Both rule types sit outside the account backup and restore payload.

The approved production recovery policy, encrypted bundle tooling, independent retention/custody and full Auth/Storage/configuration recovery ceremony are maintained in [Recovery And Staging Acceptance](security-foundation/RECOVERY_AND_STAGING_ACCEPTANCE.md). The [production rollout runbook](security-foundation/PRODUCTION_ROLLOUT_RUNBOOK.md#backup-coverage-and-restore-boundaries) governs action approvals. A successful account restore does not establish whole-project recovery or authorize any hosted action.

## Restore Your Own Account in the App

Under Settings → Export Backup → Restore Backup, choose a local JSON/JSON.gz file or preview a saved Supabase backup. Files must use backup version 1, 2, or 3 and belong to the signed-in account. CSV ZIP exports are for spreadsheets and cannot be restored here. The file limit is 50 MiB, with a 128 MiB expanded limit for compressed files.

The server validates ownership, references within the file, automatic collection rules, and database constraints. Preview exercises the existing restore transaction inside a rolled-back subtransaction, then shows current and backup counts. Cancel leaves the library unchanged. Both preview and restore briefly lock the application tables, so larger libraries can interrupt other library requests while validation runs. Each request has a 60-second database limit; use an administrator restore for libraries that exceed it.

Confirmation explicitly replaces the current account's private data, including items absent from the backup. Before sending that request, the app exports the current library and browser preferences and saves a safety copy through the existing `save-backup` endpoint. Upload, retention cleanup, or cooldown failures stop the restore. The safety copy follows the normal three-copy retention policy and one-save-per-minute limit. The database requires a recent owned safety-copy path and checks that library data has not changed since preview, under the restore locks. If it has changed, cancel and preview again. Keep other devices idle and pause imports while restoring.

The account wrapper selects the target solely from the authenticated identity; users cannot select another account or call the administrator/internal engines. Existing shared AO3 works and normalized metadata are preserved. Missing works get public identity-only placeholders, while the backup reader restores effective source metadata, chapter links, and dates into the account's private extension fields. Manual corrections remain separate. Private row identities are regenerated to avoid collisions and fence stale jobs, and collection IDs in browser preferences are remapped. Metadata jobs keep the existing restore engine's lease reset behavior. Automatic memberships are recalculated from restored rules and private metadata.

After a successful database restore, the app applies the five allowlisted browser preferences and presents **Reload Library** to discard cached pages and use the restored settings. Sign-in credentials and paired devices are retained. Browser storage failures are reported as preference failures after a successful database restore. Database constraint failures roll back the replacement completely. If a connection drops during restore, reload and inspect the library before retrying; the safety copy remains available in Saved Backups.

This uses the existing authenticated client, Storage bucket, and `save-backup` Edge Function; there is no new endpoint to deploy. The account-restore migration must be applied before releasing this frontend. The safety copy also remains if the replacement fails after upload.

## Infrastructure Restore Of Application Tables

S1 limits the checked-in operator restore script to the verified synthetic local stack. It derives local credentials from Supabase CLI status, rejects hosted URLs/foreign keys and does not load `.env.worker`. Use synthetic backups only. Production recovery needs a separately reviewed/approved release procedure; do not bypass the guard or copy personal backups into staging. [S1 setup](security-foundation/LOCAL_AND_STAGING.md) owns the target checks and outstanding full recovery requirements.

This is infrastructure recovery authority, separate from application Admin/Owner roles. Neither application role receives access to another account's library or restore operations.

Pause approved active enrichment jobs and avoid app writes during restoration. Hosted job changes require their own approval. The restore transaction briefly locks application tables, restores data with foreign keys/check constraints enforced, preserves saved timestamps, and rebuilds the derived search index. A failure rolls back the whole operation, including trigger changes.

```sh
# Empty account/application tables; refuses to replace any existing private data.
npm run backup:restore -- /path/to/backup.json --user TARGET_AUTH_UUID

# Explicitly replace all of the target account's application data.
npm run backup:restore -- /path/to/backup.json --user TARGET_AUTH_UUID --replace

# Saved Supabase backups download as gzip files in browsers with compression.
npm run backup:restore -- /path/to/backup.json.gz --user TARGET_AUTH_UUID --replace
```

New Auth accounts receive starter collections automatically, so normally require `--replace` even before any works have been imported. Replacement also removes private rows absent from the backup. Other accounts' private rows are retained. Shared AO3 metadata and work author/fandom/tag links for backed-up works are overwritten with the snapshot; other readers of those shared works will also see the restored metadata. Shared natural keys are reconciled with existing work/fandom/tag/author identities; private IDs are remapped when restoring into another account. Orphan shared catalog rows are not globally deleted.

In-flight metadata jobs resume as pending with fresh leases; an interrupted fourth attempt can run again. Completed and failed history stays intact. Resume only separately approved enrichment jobs after successful restoration, and reload the application. Hosted AO3 work retrieval stays retired. The infrastructure restore function remains restricted to the service role. Browser users can invoke only the account-scoped preview and restore wrappers described above.

## Restore Browser Preferences

Database restore cannot access browser storage. To restore preferences from the companion `<backup.json>.browser-preferences.json` file written by the restore command, open the app's developer console and run this snippet. Choose that companion file when prompted (it remaps hidden collection IDs for the destination account); the page reloads after applying its five allowlisted settings. Other local storage, including sign-in credentials, is untouched.

```js
const picker = document.createElement('input');
picker.type = 'file'; picker.accept = '.json,application/json';
picker.onchange = async () => {
  const backup = JSON.parse(await picker.files[0].text());
  if (!['between-chapters-backup', 'between-chapters-browser-preferences'].includes(backup.format) || backup.version !== 1) throw new Error('Unsupported backup');
  const keys = ['date-format', 'display', 'page-size', 'reading-preferences', 'collection-sort'];
  for (const name of keys) {
    const key = `between-chapters:${name}:v1`;
    const value = backup.browser_preferences?.[key];
    if (value === null) localStorage.removeItem(key);
    else if (typeof value === 'string') localStorage.setItem(key, value);
  }
  location.reload();
};
picker.click();
```

## Backend Storage

Choose **Save Backup to Supabase** to create a timestamped, immutable object under your account's folder in the private `library-backups` bucket. Native browser gzip compression is used when available; otherwise plain JSON is saved. Saved copies appear with their date/size and Download/Delete actions. Deletion uses the shared confirmation dialog. A new backup never overwrites an older copy, and users cannot list, download, upload into, or delete another account's backups. Creation and retention run through the authenticated `save-backup` Edge Function. Direct browser uploads are denied by Storage policies. Downloads and manual deletion use owner-scoped Storage access; no public or signed URLs are created.

The three most recent successful backups are retained per account. A new file uploads successfully before the oldest retained file is removed, using the Storage API so both metadata and physical files are deleted. Failed uploads preserve the existing three copies. Creation is limited to **one attempt per account per minute**, including failed attempts, with an account-wide lease preventing concurrent saves across devices. The lease is released on success/failure and expires after ten minutes if a worker crashes. GET/list reconciles older pre-policy copies and interrupted cleanup without consuming the creation cooldown. Local exports and downloads do not use this gate. There is no automatic backup creation schedule. The bucket's per-file limit is 50 MiB (the project's global Storage limit must also permit the file size). Downloaded `.json` and `.json.gz` files both work with the infrastructure restore command. Downloads preserve the stored bytes. Save success is shown only after upload and retention cleanup both succeed. If Storage cleanup is unavailable, the new file and existing copies are preserved; the UI asks the user to reload the page to retry cleanup. A later save must finish outstanding cleanup before uploading another file, preventing failed cleanup from accumulating unlimited objects. A fourth copy can temporarily remain during an upload or interrupted cleanup. List failures can be retried separately. Keep an external downloaded copy too.

Serve the endpoint locally through `npm run db:serve` using the guarded synthetic configuration. Hosted function deployment and migration execution require exact target/artifact verification and their separate approvals in the [production rollout runbook](security-foundation/PRODUCTION_ROLLOUT_RUNBOOK.md); this guide does not authorize an unguarded CLI deployment. The function uses the server-only service credential and verifies each user or scoped capability; no privileged key is sent to browsers.

The checked-in prune utility is local-only: `npm run backup:prune -- --local` uses verified synthetic CLI credentials and rejects a hosted target or foreign key. It reuses the endpoint’s lease/retention implementation, skips busy accounts with a nonzero exit status, and creates no backups. All-account hosted pruning or scheduling is a separate explicitly approved maintenance action; no production pruning runner is provided by this guide.

Run `npm run perf:backup` for the repeatable 10,000-work test. It reuses the existing large-library fixture with long summaries, private notes/overrides, 5,000 authors, 100 fandoms, 120,000 tag links, 10,000 collection memberships and 200 saved series. It checks complete export, lossless gzip round trip, restoration into empty tables, replacement after edits, every exported row, and the rebuilt search document count. Results and the synthetic compressed fixture are written to `artifacts/performance/backups.json` and `backup-fixture.json.gz` (ignored by Git). This is embedded PostgreSQL evidence. The guarded `npm run test:integration` creates its own small synthetic fixtures and rejects `INTEGRATION_BACKUP_FIXTURE` or other external backups; it does not validate this large payload through Storage. Do not bypass that guard. Use the dedicated `npm run perf:restore:staging` runner and [staging acceptance prerequisites](security-foundation/RECOVERY_AND_STAGING_ACCEPTANCE.md#large-restore-acceptance) for generated large-payload HTTP/Storage testing; actual hosted acceptance remains separate release evidence.

Earlier local embedded PostgreSQL measurement: 43,516,412 bytes JSON, 4,189,741 bytes gzip, export 3.9 seconds, empty restore 40.4 seconds, replacement restore 41.3 seconds. The [S4 report](security-foundation/S4_RELEASE_READINESS.md) records the current release-validation run. These are synthetic local measurements, not production timings or a measurement of the user's library. The regular suite separately tests import history, personal tags, series memberships, rollback, and private access. Browser repository tests cover compressed 10,000-entry uploads and exact downloaded bytes; `npm run test:integration` checks the actual local Storage API with two accounts, including failed cross-account access, direct-upload bypass attempts, cooldowns, concurrent saves, and retention after successful uploads.

The saved-backup migration gives only the export/restore functions a 60-second statement timeout, rather than changing all API requests. Supabase's [API timeout ceiling](https://supabase.com/docs/guides/database/postgres/timeouts) is 60 seconds; libraries requiring longer administrative restores should use a direct database connection with an appropriate session timeout. Validate hosted performance against representative production data before scheduling large exports. Browser-only preferences are attached from the browser making the backup.

Supabase documents [private bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [database backup coverage](https://supabase.com/docs/guides/platform/backups). Storage file contents are not included in Supabase database backups, so storing exports in the same project does not provide independent disaster recovery.

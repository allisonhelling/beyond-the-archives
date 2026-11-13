# Library Backups

DNF cleanup adds compact reading records and account cleanup preferences to JSON backups, and `reading_records.csv` to CSV exports. Apply `20261024000200_dnf_cleanup.sql` for these fields. Older version-1 files remain accepted with an empty compact archive. See [DNF cleanup](DNF_CLEANUP.md) for retention and recovery behavior.

Apply migrations through `supabase/migrations/20261112000400_universal_backup_compatibility.sql` before deploying the frontend. In Settings → Export Backup, download a versioned JSON file or choose **Save Backup to Supabase** to store a private copy. Both use the same consistent database snapshot of the signed-in account, independent of loaded pages and PostgREST's row limit.

Included: all library entries and their original URLs, source metadata and normalized authors/fandoms/tags, chapter verification data, personal/extension overrides, reading progress and dates, notes, favorites, ratings, personal tags, collections and memberships (including appearance, order, visibility and automatic rules), saved series and memberships, metadata preferences, import batches/items/jobs/logs, and timestamps. Works referenced only by retained import jobs are included too. Browser display/date/page-size/reading/collection-sort preferences come from the exporting browser and are stored separately as `browser_preferences`.

Excluded: Auth accounts/passwords/sessions, API keys, paired-device secrets, active worker lease credentials, global worker throttling/fairness state, backup save cooldown/leases, and derived search documents. Recreate Auth accounts and reconnect paired devices as needed. The application schema, policies and functions come from migrations, rather than the data file. This is an account data export, not a whole Supabase project dump. Future incompatible schema changes must bump the backup version and add a format migration before accepting older files.

Backups containing universal manual stories use version 2 to protect their private source identity from older readers. AO3-only libraries still export version 1. Current restore accepts both; upgrade the database, organizer and administrator restore script before restoring version 2. Private source URLs, manual field times, reading provenance and chapter history are retained.

## Restore Your Own Account in the App

Under Settings → Export Backup → Restore Backup, choose a local JSON/JSON.gz file or preview a saved Supabase backup. Files must use backup version 1 or 2 and belong to the signed-in account. CSV ZIP exports are for spreadsheets and cannot be restored here. The file limit is 50 MiB, with a 128 MiB expanded limit for compressed files.

The server validates ownership, references within the file, automatic collection rules, and database constraints. Preview exercises the existing restore transaction inside a rolled-back subtransaction, then shows current and backup counts. Cancel leaves the library unchanged. Both preview and restore briefly lock the application tables, so larger libraries can interrupt other library requests while validation runs. Each request has a 60-second database limit; use an administrator restore for libraries that exceed it.

Confirmation explicitly replaces the current account's private data, including items absent from the backup. Before sending that request, the app exports the current library and browser preferences and saves a safety copy through the existing `save-backup` endpoint. Upload, retention cleanup, or cooldown failures stop the restore. The safety copy follows the normal three-copy retention policy and one-save-per-minute limit. The database requires a recent owned safety-copy path and checks that library data has not changed since preview, under the restore locks. If it has changed, cancel and preview again. Keep other devices idle and pause imports while restoring.

The account wrapper selects the target solely from the authenticated identity; users cannot select another account or call the administrator/internal engines. Existing shared AO3 works and normalized metadata are preserved. Missing works get public identity-only placeholders, while the backup reader restores effective source metadata, chapter links, and dates into the account's private extension fields. Manual corrections remain separate. Private row identities are regenerated to avoid collisions and fence stale jobs, and collection IDs in browser preferences are remapped. Metadata jobs keep the existing restore engine's lease reset behavior. Automatic memberships are recalculated from restored rules and private metadata.

After a successful database restore, the app applies the five allowlisted browser preferences and presents **Reload Library** to discard cached pages and use the restored settings. Sign-in credentials and paired devices are retained. Browser storage failures are reported as preference failures after a successful database restore. Database constraint failures roll back the replacement completely. If a connection drops during restore, reload and inspect the library before retrying; the safety copy remains available in Saved Backups.

This uses the existing authenticated client, Storage bucket, and `save-backup` Edge Function; there is no new endpoint to deploy. The account-restore migration must be applied before releasing this frontend. The safety copy also remains if the replacement fails after upload.

## Administrator Restore of Application Tables

Use a trusted terminal with this repository and installed dependencies. Configure `SUPABASE_URL` and the server-only `SUPABASE_SECRET_KEY` in the environment or `.env.worker`. Never put the secret in a `VITE_*` variable. Apply the migrations to the destination project first, and create/invite the target Auth account. Use its UUID from Supabase Authentication, which may differ from the exported account UUID.

Stop metadata workers and avoid app writes during restoration. The restore transaction briefly locks application tables, restores data with foreign keys/check constraints enforced, preserves saved timestamps, and rebuilds the derived search index. A failure rolls back the whole operation, including trigger changes.

```sh
# Empty account/application tables; refuses to replace any existing private data.
npm run backup:restore -- /path/to/backup.json --user TARGET_AUTH_UUID

# Explicitly replace all of the target account's application data.
npm run backup:restore -- /path/to/backup.json --user TARGET_AUTH_UUID --replace

# Saved Supabase backups download as gzip files in browsers with compression.
npm run backup:restore -- /path/to/backup.json.gz --user TARGET_AUTH_UUID --replace
```

New Auth accounts receive starter collections automatically, so normally require `--replace` even before any works have been imported. Replacement also removes private rows absent from the backup. Other accounts' private rows are retained. Shared AO3 metadata and work author/fandom/tag links for backed-up works are overwritten with the snapshot; other readers of those shared works will also see the restored metadata. Shared natural keys are reconciled with existing work/fandom/tag/author identities; private IDs are remapped when restoring into another account. Orphan shared catalog rows are not globally deleted.

In-flight metadata jobs resume as pending with fresh leases; an interrupted fourth attempt can run again. Completed and failed history stays intact. Restart workers after successful restoration, and reload the application. The administrator function remains restricted to the service role. Browser users can invoke only the account-scoped preview and restore wrappers described above.

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

The three most recent successful backups are retained per account. A new file uploads successfully before the oldest retained file is removed, using the Storage API so both metadata and physical files are deleted. Failed uploads preserve the existing three copies. Creation is limited to **one attempt per account per minute**, including failed attempts, with an account-wide lease preventing concurrent saves across devices. The lease is released on success/failure and expires after ten minutes if a worker crashes. GET/list reconciles older pre-policy copies and interrupted cleanup without consuming the creation cooldown. Local exports and downloads do not use this gate. There is no automatic backup creation schedule. The bucket's per-file limit is 50 MiB (the project's global Storage limit must also permit the file size). Downloaded `.json` and `.json.gz` files both work with the administrator restore command. Downloads preserve the stored bytes. Save success is shown only after upload and retention cleanup both succeed. If Storage cleanup is unavailable, the new file and existing copies are preserved; the UI asks the user to reload the page to retry cleanup. A later save must finish outstanding cleanup before uploading another file, preventing failed cleanup from accumulating unlimited objects. A fourth copy can temporarily remain during an upload or interrupted cleanup. List failures can be retried separately. Keep an external downloaded copy too.

Deploy/serve the new endpoint alongside this migration. For local development, run `npx supabase functions serve save-backup --no-verify-jwt`; the handler verifies bearer tokens with Supabase Auth itself. For hosted rollout, deploy with `npx supabase functions deploy save-backup` and apply migration `20261021000900_backup_retention.sql` before releasing the frontend. The migration blocks old clients from directly uploading. The function uses the built-in Supabase service-role environment variable; no privileged key is sent to browsers. Do not delete Storage metadata directly with SQL.

After applying the migration, run `npm run backup:prune` from a trusted terminal with the server-only project environment to reconcile **all existing accounts**, including inactive users. Use `npm run backup:prune -- --local` for the local stack; this explicitly uses local CLI credentials instead of hosted environment settings. This command reuses the endpoint's lease and retention implementation, skips busy accounts with a nonzero exit status for retry, and can also be scheduled as retryable maintenance. It never creates backups or consumes the creation cooldown.

Run `npm run perf:backup` for the repeatable 10,000-work test. It reuses the existing large-library fixture with long summaries, private notes/overrides, 5,000 authors, 100 fandoms, 120,000 tag links, 10,000 collection memberships and 200 saved series. It checks complete export, lossless gzip round trip, restoration into empty tables, replacement after edits, every exported row, and the rebuilt search document count. Results and the synthetic compressed fixture are written to `artifacts/performance/backups.json` and `backup-fixture.json.gz` (ignored by Git). Afterward, with the local Supabase stack running, run `INTEGRATION_BACKUP_FIXTURE=artifacts/performance/backup-fixture.json.gz npm run test:integration` to check that exact 10,000-work payload through the real Storage upload/download API and account policies.

Measured locally with embedded PostgreSQL: 43,516,412 bytes JSON, 4,189,741 bytes gzip, export 3.9 seconds, empty restore 40.4 seconds, replacement restore 41.3 seconds. These are synthetic local measurements, not production timings or a measurement of the user's library. The regular suite separately tests import history, personal tags, series memberships, rollback, and private access. Browser repository tests cover compressed 10,000-entry uploads and exact downloaded bytes; `npm run test:integration` checks the actual local Storage API with two accounts, including failed cross-account access, direct-upload bypass attempts, cooldowns, concurrent saves, and retention after successful uploads.

The saved-backup migration gives only the export/restore functions a 60-second statement timeout, rather than changing all API requests. Supabase's [API timeout ceiling](https://supabase.com/docs/guides/database/postgres/timeouts) is 60 seconds; libraries requiring longer administrative restores should use a direct database connection with an appropriate session timeout. Validate hosted performance against representative production data before scheduling large exports. Browser-only preferences are attached from the browser making the backup.

Supabase documents [private bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [database backup coverage](https://supabase.com/docs/guides/platform/backups). Storage file contents are not included in Supabase database backups, so storing exports in the same project does not provide independent disaster recovery.

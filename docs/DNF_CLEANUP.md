# DNF Cleanup

Apply `supabase/migrations/20261024000200_dnf_cleanup.sql` before deploying the updated app. Cleanup is account scoped and off by default. Settings → DNF Cleanup offers **24 hours, 7 days, 30 days, 60 days**, or a custom whole number of hours/days. The default is **7 days**; custom durations range from 24 hours to 3650 days.

Save settings to authorize future automatic cleanup. Changing the duration can make existing DNF entries immediately eligible. The preview and **Clean up now** action also work with automatic cleanup disabled. Each manual confirmation considers only the displayed batch, up to 100 entries. Changes to saved settings or an entry since preview require another preview. Entries which become ineligible are skipped.

Favorites/recommendations, personal notes/ratings/tags, and manual collection memberships are protected by default. Pending or processing metadata jobs always protect an entry. Changing notes or refreshing metadata does not reset the DNF clock. Leaving DNF clears it; returning to DNF starts a new period. Existing records use a known DNF transition when available, otherwise the migration establishes a new baseline. No historical dates are guessed.

## Enable Background Execution

Enable pg_cron in the target Supabase project, then run `supabase/scheduling/dnf-cleanup.sql` as the database administrator. This installs the `dnf-cleanup` job at minute 17 of every hour. It calls the same transactional implementation used by manual cleanup, with up to 100 entries per opted-in account per invocation. Cleanup runs while the app is closed; it makes no AO3 requests. Timing depends on scheduler availability and remaining batches. Run `select cron.unschedule('dnf-cleanup');` to remove the job. Account settings can independently disable cleanup without removing the schedule.

The service-role-only `run_scheduled_dnf_cleanup()` function can also be invoked by an existing trusted scheduler. Browser accounts cannot call it or write reading records directly. No schedule or production migration is installed by the frontend.

## Preserved Data and Recovery

`reading_records` preserves each removed entry's UUID as a reading-lifecycle identity, account ownership, AO3 work/bookmark identity, URL, title/authors, fandoms/language/AO3 rating, known reading dates, DNF/archive dates, recorded chapter progress, word/chapter-count context, and the existing reading timeline. It has no dependency on the deleted library entry or shared work. Archiving and deletion commit together; failure preserves the detailed entries. Shared AO3 work data and separately saved series are not deleted.

Summaries, complete tags, chapter maps, notes, personal ratings, personal tags, and collection memberships are not copied into reading records. Recovery of these details requires a full backup. The compact archive is not an undo snapshot. Existing import history remains subject to its existing retention behavior.

Settings includes a paginated archive and **Add again** links for known AO3 works. Routine CSV imports and library sync skip archived identities until an explicit add creates a new reading lifecycle. An explicit link import or manual add retains the earlier archived outcome.

The owner-scoped `reading_activity` view provides one shared compact shape for current entries and archived records. Future statistics should distinguish unique works from reading attempts. Recorded progress is not measured words read; stored word count is context. Elapsed reading duration stops at DNF and represents calendar time excluding recorded pauses, not time spent reading. Missing historical events remain unknown. The existing Stats page remains its planned-feature placeholder.

JSON backups include cleanup preferences and reading records; account and administrator restores remap ownership and lifecycle identities through the existing restore engine. Older version-1 files without reading records remain accepted and restore an empty archive. Restoring an older full backup can restore detailed entries removed by cleanup and replace the current archive/settings. CSV ZIP exports include an optional `reading_records.csv`; CSV is not a full restore format.

Local sample mode does not run account cleanup. Verification uses embedded PostgreSQL for migration, ownership, archive atomicity, eligibility, imports, and backup restore, plus component and desktop/mobile browser tests for Settings.

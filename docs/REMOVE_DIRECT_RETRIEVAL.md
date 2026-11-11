# Extension-Only Retrieval Cutover

## Implemented Scope And Source Audit

| Path | Existing Responsibility | Result |
| --- | --- | --- |
| `src/features/imports/repository.ts` | URL/chapter/Wayback submission, CSV, listing imports, retries, series preview | Revalidates companion connection before queue mutations; previews always capture browser HTML. |
| `extension.ts`, `useDesktopCompanion.ts`, `DesktopRetrievalGate.tsx` | Website companion transport and eligibility | One capability protocol and shared UI gate; authentication follows capability verification. No viewport/UA eligibility rule. |
| `companions/chrome/background.js` | Owner-authenticated queue claims, work/series/index capture, scans | Advertises `metadata-retrieval-v1` only to configured origins; existing pacing, checkpoints, confirmation, pause and recovery stay in use. |
| `ImportPage`, `ImportLinkForm`, `ImportedSeriesNotice`, `MetadataControls`, `SeriesPage` | Import, refresh and preview controls | Automatic/bulk controls require the compatible desktop companion. History and saved data remain accessible. |
| `server/ao3/worker.ts`, `extension-metadata` | Trusted result commit | Retains shared commit store and ingestion authentication, owner/lease validation and parsing. Removes hosted work orchestration. |
| `series-preview`, `server/ao3/series-handler.ts` | Authenticated series parsing and hosted retrieval | Keeps bounded snapshot parsing; URL-only requests return 410 without AO3 traffic. |
| `import-worker`, `server/import-worker.ts`, package worker script | Hosted work acquisition | Edge tombstone returns 410, Node tombstone fails immediately, npm worker command removed. |
| `server/ao3/adapter.ts`, `series.ts` | Parsers, hosted work/series fetching, bounded request utility | Removes work/series fetch functions. Retains parsers and bounded utility required by tag resolution. |
| Migration `20261109000300_extension_only_retrieval.sql` | Mode selection, settings and queue cutover | New/retried jobs extension-only; safe in-place legacy migration, count validation, disabled hosted claim RPC. |
| Safari/shared companion, `userscript_library`, library storage/validation/RLS | Single-work on-AO3 saves, personal changes, cross-device storage | Existing authenticated channel unchanged; no mobile job processor introduced. |
| `wayback-lookup`, tag-resolution | Archive discovery and canonical tag evidence | Retained. They do not originate work/series metadata retrieval. Shared pacing state/functions remain dependencies. |
| Account backup/restore | Restores settings and records | Legacy preference writes normalize to extension-only, including the restore engine after it re-enables user triggers. Terminal job history remains readable; no destructive migration. |

BookFusion associations use saved-library metadata only and remain independently available. Manual saves reuse the validated editor without metadata jobs. The mobile primary import path is opening a work on AO3 and using the existing companion; no new URL-only or mobile retrieval pipeline is introduced.

## Job And Compatibility Contract

The migration locks the job table against concurrent claims/completions during cutover. Pending direct jobs and expired direct leases in uncancelled batches are converted in place, retaining batch/item/work identities, source URLs and personal data. Processing logs retain original mode, status and attempt counts. Expired exhausted direct attempts are capped at three to permit one browser recovery attempt, with the original count logged. Backoff eligibility is preserved. No import entries or history are deleted.

A still-live direct lease remains direct until completion or expiry. The old claim RPC returns null, so it cannot acquire another request. Extension claiming defers while the account has a live direct lease, then migrates expired jobs on reconnection before using the established fair claim algorithm. Cleared fencing tokens reject late direct results. A direct completion that schedules a retry is changed to extension mode by the status trigger. Explicit retries of historical failures likewise use extension mode. Completed, failed and cancelled history remains in its original mode until an explicit retry. Existing extension timeouts, retry limits and cancellation semantics remain unchanged.

New jobs are forced to extension mode at the database trigger, including requests from stale clients or restored direct-mode settings. The frontend requires a capability handshake and authenticated connection before submission; no mobile website action queues a job its companion cannot service. This is a browser capability check, not server attestation of physical hardware. An authorized older/custom API client can still enqueue an owner-scoped extension job, but cannot cause hosted retrieval. Queue/lease/result ownership and service-role mutation boundaries remain the security controls.

Companion 0.7.8 is required for the new website handshake. Older companions can finish their existing work but must be rebuilt/reloaded to enable new website controls. No cookies or AO3 passwords are forwarded. AO3 login and rate-limit recovery stay in browser tabs. No automatic metadata refresh scheduling is added. Manual corrections, reading events, collections, favorites and notes retain their existing storage paths. Fixed Wayback sources and chapter-index options travel through the existing extension claim and result channel.

## Release Procedure

These are deployment actions requiring explicit production approval. None are executed by editing this repository or running its local tests.

1. In staging, record direct job counts grouped by status, retrieval mode, owner and lease expiry. Export an account backup and retain previous app/function/companion artifacts. Inspect active scheduler/process configuration; do not reset databases or clear extension storage.
2. Apply the complete migration chain through `20261109000300_extension_only_retrieval.sql`. Check that `claim_metadata_job()` returns null, new jobs select extension mode and existing history counts remain intact. Existing in-flight leases may drain; new claims cannot start. Review `extension_migration` logs.
3. Keep `extension-metadata` deployed with its existing Supabase configuration. Build/release Chrome/Edge companion 0.7.8 with `npm run build:extension` (and `npm run build:extension:local` for local testing); reload the existing installation and verify capability/authentication and checkpoint recovery before updating the website.
4. Deploy snapshot-only `series-preview`, then the website. Verify connected desktop work/chapter imports, CSV/chapter dates, series selection/Related Series, Full Scan/Quick Sync and continued checkpoints, authenticated restricted work, metadata refresh, fixed Wayback snapshots and manual overrides. Verify narrow desktop and wide devices without a companion. Verify mobile on-AO3 Add/Collect metadata and reading actions; check cross-device library visibility.
5. Let old live leases finish or expire. Reconnect affected accounts to recover expired direct jobs. Monitor pending/processing age, migration logs, failures, cancellations, deduplication and history. Do not report a job completed until metadata commit succeeds. Check terminal direct history and restored backups.
6. After staging acceptance and production approval, deploy the `import-worker` 410 tombstone. Stop the external Node worker process and run the retirement-only SQL in `supabase/scheduling/import-worker.sql` to unschedule `ao3-metadata-worker`. Inspect for separately named/custom schedules before considering shutdown complete. Remove `IMPORT_WORKER_TOKEN` and Vault `import_worker_url`/`import_worker_token` through the approved secrets workflow. Retain Supabase service-role configuration needed by other functions; `.env.worker` may also supply backup utilities, so remove only obsolete worker values.
7. Observe hosted work/series traffic and stuck-job rates for a release cycle. Keep tombstones and historical migrations for stale callers/auditing. Do not remove archive lookup or shared tag-resolution pacing infrastructure.

The migration prevents future claims but cannot recall a network request already started by a live worker. Production traffic shutdown requires the process/scheduler checks above. Supabase preview deployments may automatically apply committed migrations; coordinate the backend cutoff with the companion release.

## Validation And Remaining Acceptance

Run `npm run check`, companion build commands, and `npx playwright test metadata-preferences.spec.ts`. The embedded PostgreSQL tests replay the full schema; the cutover regression starts before the new migration and exercises pending/expired/live jobs, history, retries, settings, fencing and owner isolation. Existing suites cover extension HTML validation, chapter progress, manual overrides, series/Wayback data, scan pacing/recovery and Safari/shared on-page saves. Tests use fixtures and do not send live AO3 requests. Responsive browser workflow tests inject a compatible desktop transport at both viewport sizes; separate unavailable-companion tests cover physical mobile behavior without that fixture. Actual built-extension tests use isolated Chromium profiles and local fixture servers.

Hosted Auth/PostgREST, hosted deployment, production job inventories, real signed-in restricted AO3 pages, mobile Safari installation, browser restarts and cross-device acceptance still require staging/production verification. Local tests are not evidence those deployments occurred.

## Rollback

Retain previous deployment artifacts and backups. Roll back frontend/companion/function versions together only after reviewing queued jobs and migration logs. Keep migrated extension jobs and saved user data; do not reset identities, delete history, restore an old database over recent personal edits, or automatically turn hosted fetching back on. Reconcile any live leases and obtain explicit approval before a separately reviewed backend rollback. Leaving the backend extension-only while repairing/reconnecting companions preserves the no-hosted-fetch contract.

## Recorded Validation

- `npm run check`: lint, TypeScript/production build, **1,939 tests across 170 files**, and all **7** integration-configuration checks passed. Its final security stage initially matched `eval(` inside the hook name. The hook was renamed to `useDesktopCompanion`; the security checker was not weakened.
- After that name-only change, `npm run lint`, `npm run build`, `npx vitest run src/features/imports/DesktopRetrievalGate.test.tsx src/features/library/series/SeriesPage.test.tsx src/features/imports/extension-config.test.ts` (**27 passed**) and `npm run check:security` all passed. The full suite above preceded only this hook rename; affected consumers were rerun afterward.
- `npx playwright test metadata-preferences.spec.ts series.spec.ts activity.spec.ts foundation.spec.ts`: **50 passed**, covering both viewport projects, unavailable companions, narrow eligible desktop, imports, series and loading/recovery behavior.
- `npx playwright test extension.spec.ts --project=desktop`: **2 passed**, exercising actual hosted/local builds in isolated Chromium with local fixture servers.
- `npx playwright test library.spec.ts features-guide.spec.ts --grep 'metadata refresh|Add Story opens|completed direct fic import|End Scan review|bookmark scans show|mass import tabs'`: **22 passed**, including refresh, Related Series, saved scan recovery and draft preservation.
- `npm run build:extension`, `npm run build:extension:local`, `npm run build:userscript`: **passed**.
- `npx --yes deno check --config supabase/functions/deno.json supabase/functions/*/index.ts`: **passed** for every function entrypoint.
- `git diff --check`: **passed**. The production build retains its large-chunk advisory; jsdom emits existing scroll/localStorage warnings. No unresolved test failures remain. A resource-related UI timeout in an earlier concurrent run passed in the final full run.

No production migrations, function deployments, scheduler changes, secret removals or live AO3/device acceptance were performed. Those remain the explicitly approved rollout work described above.

## CI Regression Follow-Up

The remaining CI fixtures now follow the extension-only contract. The settings layout check measures the existing **Extension Connection** fieldset and its direct label. DNF Add Again and the responsive desktop refresh workflow reuse `desktopCompanion` to test a supported connection at either viewport size; unavailable-companion behavior remains covered separately. No product gate was relaxed and no timeout was increased.

The local integration runner claims through the authenticated account's `claim_extension_job`, verifies concurrent callers acquire exactly one lease for that account, rejects cross-account claims and direct client result commits, checks private metadata storage, and fences duplicate and cancelled results. It also asserts the retired service-role claim returns null. Queue preconditions are scoped to temporary test accounts, and the test no longer changes the global hosted-worker throttle.

Validation: `npx playwright test display-settings.spec.ts dnf-cleanup.spec.ts responsive-layouts.spec.ts` — **72 passed, 2 existing project-specific skips**; `npm run test:integration` — **30 passed** against the running local Supabase stack; `npx vitest run supabase/tests/imports.test.ts supabase/tests/extension-only-retrieval.test.ts` — **28 passed**; `npm run test:integration:config` — **7 passed**. Lint, build/typecheck, JavaScript syntax and diff checks passed. Docker Desktop and the local stack were started for the integration run without a database reset; test fixtures were cleaned up normally.

## Changed Files

- `.env.example`
- `README.md`
- `companions/chrome/README.md`
- `companions/chrome/background.js`
- `companions/chrome/background.test.js`
- `companions/safari/README.md`
- `docs/IMPLEMENTATION.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/REMOVE_DIRECT_RETRIEVAL.md`
- `package.json`
- `scripts/build-extension.mjs`
- `scripts/test-database.mjs`
- `server/ao3/adapter.test.ts`
- `server/ao3/adapter.ts`
- `server/ao3/series-handler.ts`
- `server/ao3/series.test.ts`
- `server/ao3/series.ts`
- `server/ao3/worker.ts`
- `server/import-worker.ts`
- `src/features/imports/CsvImportForm.test.tsx`
- `src/features/imports/DesktopRetrievalGate.test.tsx`
- `src/features/imports/DesktopRetrievalGate.tsx`
- `src/features/imports/ImportLinkForm.test.tsx`
- `src/features/imports/ImportLinkForm.tsx`
- `src/features/imports/ImportPage.test.tsx`
- `src/features/imports/ImportPage.tsx`
- `src/features/imports/ImportedSeriesNotice.test.tsx`
- `src/features/imports/ImportedSeriesNotice.tsx`
- `src/features/imports/MetadataControls.tsx`
- `src/features/imports/MetadataSettings.test.tsx`
- `src/features/imports/MetadataSettings.tsx`
- `src/features/imports/extension-config.test.ts`
- `src/features/imports/extension.ts`
- `src/features/imports/library-sync-sample.test.ts`
- `src/features/imports/metadata-preferences.ts` (Removed)
- `src/features/imports/repository.test.ts`
- `src/features/imports/repository.ts`
- `src/features/imports/settings-sections.ts`
- `src/features/imports/useDesktopCompanion.ts`
- `src/features/imports/useMetadataRefresh.ts`
- `src/features/library/series/SeriesPage.test.tsx`
- `src/features/library/series/SeriesPage.tsx`
- `supabase/config.toml`
- `supabase/functions/import-worker/index.ts`
- `supabase/functions/series-preview/index.ts`
- `supabase/migrations/20261109000300_extension_only_retrieval.sql`
- `supabase/scheduling/import-worker.sql`
- `supabase/tests/extension-only-retrieval.test.ts`
- `supabase/tests/import-fairness.test.ts`
- `supabase/tests/imports.test.ts`
- `supabase/tests/wayback-imports.test.ts`
- `tests/e2e/activity.spec.ts`
- `tests/e2e/desktop-companion-fixture.ts`
- `tests/e2e/features-guide.spec.ts`
- `tests/e2e/foundation.spec.ts`
- `tests/e2e/library.spec.ts`
- `tests/e2e/metadata-preferences.spec.ts`
- `tests/e2e/series.spec.ts`
- `scripts/test-supabase.mjs`
- `tests/e2e/display-settings.spec.ts`
- `tests/e2e/dnf-cleanup.spec.ts`
- `tests/e2e/responsive-layouts.spec.ts`

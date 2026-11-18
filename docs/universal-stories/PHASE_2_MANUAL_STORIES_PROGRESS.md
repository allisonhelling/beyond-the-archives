# Phase 2 — Universal Manual Stories And Reading Progress

Implemented on `universal-stories/02-manual-stories-progress`, based on refreshed reviewed integration `main` at `df19dcc`. Phase 1 (`43e3468`) was present; the working tree was clean before branch creation. Verification date: 13 November 2026. Nothing was pushed, merged or deployed, and no shared database was changed.

## Audited Architecture And Implementation

The implementation extends `StoryForm`, the existing checked save/merge RPCs, private `library_entries`, UUID work stubs, source adapter, indexed document/revision/membership pipeline, shared dialogs/status controls, sample repository, chapter timeline and backup engine. No second story store, query stack, dependency, CSS system, DOM mapping or crosspost synchronization is introduced. Current native AO3 numbers, reader/anthology associations and the seven persisted reading statuses retain their meanings; Caught Up is a derived display condition.

One private entry remains one source version. New unsupported-site stories use an owner-private serialized `source_url` candidate and empty work UUID stub; source metadata is stored only in private overrides. The existing typed URL parser serializes international hosts/paths while the exact submission is retained separately. Both values are unverified user assertions. Candidates accept bounded public HTTP(S), reject unsafe protocols/credentials/local addresses, and never confer fetch permission or canonical verification. Reading opens the safe candidate, with no fabricated chapter URL. AO3 mappings retain their existing chapter actions, including unread chapter 1. Exact duplicates are rejected; similar URL candidates require an explicit choice on both client and server. Owner/base-URL transaction locks guard stale catalog races. A bounded SHA-256 index supports long candidate URLs; full URL comparisons govern identity and duplicate review. Foreign labels have neither AO3 alias expansion nor an AO3 crossover classification key.

New universal single-story saves require 1–100,000 published chapters and store the manual count checkbox. Published and planned totals stay separate. An unchanged older plan may fall below a newly entered published count; the editor warns and preserves it. Known published counts bound progress, with planned totals used only when published counts are unknown. Existing unknown values remain nullable and are never converted to zero; the requirement is enforced in the new save workflow. Server-recorded `metadata_confirmation_times` live separately from metadata values. A checked manual count is user-asserted, an unchecked count stays unconfirmed, and manual provenance never becomes source verification. Field-aware confidence filters and Needs Completion Verification use the same SQL/local/automatic-collection pipeline. Details expose secondary provenance; no final source badge/stripe design is chosen.

Reading status, publication evidence and progress remain independent. Complete publication or a manual Abandoned/Deleted declaration can finish a fully read story on every source. Ongoing/hiatus publication yields Waiting for Updates; unknown completion yields Caught Up · Completion Unconfirmed. Imported private unavailability alone does not authorize Finished. The existing owner-confirmed deletion action records a manual declaration, and a manual publication correction takes precedence over an availability projection. Existing saved statuses/history are not rewritten by a backfill.

Status intent is recorded separately in existing `reading_provenance`. Metadata/notes edits preserve origin; selecting Finished explicitly upgrades even an unchanged derived Finished state. Numeric corrections preserve an existing explicit status when the status itself is unchanged. The shared Chrome/Safari bar supplies optional `statusOrigin`: Finish Fic and actual status choices are explicit; ordinary chapter reads are derived. Ambiguous older clients are treated conservatively as explicit, without guessing intent from a chapter event alone.

Count edits retain current progress. Explicit Finished increases offer Keep N Read (default), I've Read All N, or Keep Finished as Manual Override, with a visible mismatch. Derived states recalculate without a prompt. Valid decreases preserve progress. Decreases below progress require review and a confirmed reduction; chapter and reread history remains intact, with out-of-range references flagged. Mapped links beyond a manually revised count are not used for navigation; verified AO3 mappings beyond stale automatic counts retain legacy behavior. There is no history-deletion action in this editor. Existing chapter Undo remains separately guarded. Checked count baselines also protect automatic metadata changes and concurrent reading decisions; a stale choice cannot overwrite a newer reading decision.

## Migrations And Compatibility

1. `20261112000200_universal_manual_stories.sql`: private source candidate/field-time columns, owner-scoped uniqueness, source/URL guards, reused save/Undo/view/index/catalog paths and generic hierarchy isolation.
2. `20261112000300_chapter_total_review.sql`: chapter-review guards, nullable legacy handling, explicit/derived provenance, server-set times, checked baselines, source confidence filters, companion intent and manual deletion confirmation.
3. `20261112000400_universal_backup_compatibility.sql`: version 2 exports for libraries containing universal stories, version 1/2 readers, source validation during restore and a source URL constraint that remains active when user triggers are suspended.

The existing account restore engine retains caller-derived ownership, reference validation, preview fingerprint and owned safety-copy requirements. Current readers accept old version 1 backups; AO3-only libraries still export version 1. Version 2 prevents older readers/backends from silently discarding new identity fields. Work JSON remains its existing v1 envelope with the already versioned source snapshot; CSV exports do not become a new universal import format. Companion schema/capability and bigint AO3 addressing retain their meanings; `statusOrigin` is optional. General-source extraction is not advertised.

Apply reviewed migrations before deploying the organizer and rebuilt companions. Do not reset established data. Keep additive identity/provenance fields and user data when rolling back frontend code; older UI cannot author these workflows and older backup readers reject version 2. The projection refresh has not been benchmarked on a large hosted library. No hosted migration/Auth/PostgREST/Storage or installed mixed-version rollout is claimed.

## Verification Record

Final commands and results are recorded below after completion. Earlier attempts exposed and corrected migration signature/quoting mistakes, stale test-only snapshot/key expectations, overbroad AO3 stale-count validation, provenance edge cases, and pre-existing browser selectors that assumed the footer lacked the new Read Offline shortcut. Failing attempts are not counted as acceptance evidence.

| Command | Result |
|---|---|
| `NODE_OPTIONS=--no-experimental-webstorage npm run check` | Passed: ESLint, TypeScript/organizer build, 184 Vitest files / 2,102 tests, 7 integration-configuration tests and security checks. |
| `NODE_OPTIONS=--no-experimental-webstorage npx vitest run supabase/tests/universal-manual-stories.test.ts --maxWorkers 2` | Passed: 46 SQL workflow tests, including owner isolation, count reviews, provenance, long URLs, stale duplicate decisions and backup round trips. Included again in the full check. |
| `VITE_SAMPLE_DATA=true npx playwright test tests/e2e/universal-manual.spec.ts` | Passed: 12 desktop/mobile sample-browser tests. |
| `npx playwright test tests/e2e/library.spec.ts tests/e2e/features-guide.spec.ts tests/e2e/backup-restore.spec.ts --grep 'manual library workflow\|book-spine footer reflects\|work info retains\|finished work tiles begin\|exports one work\|previews a compressed'` | Passed: 12 desktop/mobile native workflow regressions. Pipes in this command are alternation within the quoted regular expression. |
| `npm run db:types:embedded` | Passed: types regenerated from all 129 ordered migrations. |
| `npm run build --prefix reader` | Passed. |
| `VITE_SUPABASE_URL=https://phase2-fixture.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_phase2_fixture EXTENSION_APP_ORIGIN=https://phase2-fixture.example npm run build:extension -- --outDir /tmp/phase2-chrome-build` | Passed using fixture public configuration. |
| `VITE_SUPABASE_URL=https://phase2-fixture.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_phase2_fixture EXTENSION_APP_ORIGIN=https://phase2-fixture.example npm run build:userscript -- --outDir /tmp/phase2-safari-build` | Passed using fixture public configuration. |
| `git diff --check` | Passed. |
| `docker info --format '{{.ServerVersion}}'` | Docker daemon unavailable; no service-stack migration, SQL lint or real-service integration result is claimed. |

Node 25 required the local web-storage flag above; this does not change the CI Node version. Existing bundle-size warnings and jsdom `scrollTo` notices were nonfatal. The earlier long-URL index attempt exposed PostgreSQL's stable `convert_to` classification; the final fixed-UTF-8 immutable wrapper passed migration replay and the long-URL acceptance test. Browser checks use sample data and Chromium desktop/mobile profiles, not a hosted account or installed Safari extension. `supabase migration up --local`, `npm run db:lint` and `npm run test:integration` remain release checks pending a running disposable local stack.

## Manual QA And Release Checks

1. Upgrade a disposable populated local Supabase stack; verify legacy AO3/EPUB unknown counts, identity, private overrides and histories before testing the new flow. Run SQL lint and the real service integration suite before shared rollout.
2. Without an extension, save a generic story at 0/20 with 30 planned chapters. Confirm safe Read Story, manual count confirmation, independent publication confidence and Original Works membership.
3. Track complete, ongoing, unknown and manually declared Abandoned/Deleted stories. Confirm the original status icon and honest Caught Up/mismatch labels on desktop/mobile and with keyboard focus.
4. Review all three 20→25 choices, a safe 15/20→15/18 edit, and the blocking 20→15 reduction. Cancel, edit on another device, retry, and verify retained reread/chapter events and out-of-range flags. A failed save must retain the draft without a success signal.
5. Export/preview/restore a version 2 backup with its safety copy and compare source identity, exact submission, field times, progress/history and collection membership. Confirm another account cannot preview/read it. Recheck a version 1 AO3-only backup.
6. Rebuild/reload Chrome/Edge and Safari companions; verify Mark Read versus explicit Finish Fic, reread/history Undo, and archives unfolded associations. Automated shared-bar/Chromium checks do not establish native Safari or installed browser release behavior.

## Phase 2 Review Checkpoint — 17 November 2026

The checkpoint initially found a direct-write bypass. In a fresh embedded database with the current ordered migrations, create a universal story explicitly Finished at 20/20, then as its authenticated owner update `library_entries.metadata_overrides.published_chapters` to 25 and `last_read_chapter` to 25 in one direct table update. The update succeeds without a chapter-review choice. The owner has column-level update permission from `20261014000100_foundation.sql`; `review_chapter_total()` in `20261112000300_chapter_total_review.sql` requires the Finished-increase choice only when `app.chapter_edit` is true, which the checked save RPC sets but the direct update does not. This demonstrates a bypass of the review gate; it is not evidence of cross-account access or that the normal editor silently changes progress. The follow-up migration `20261117000200_guard_finished_chapter_increases.sql` closes the direct manual-override path. Regression tests cover direct owner updates, the older save RPC, account isolation, checked choices, and derived states. Source observations that do not change a manual count override, explicit status, or current progress remain allowed; existing unknown-count imports retain their behavior; the change does not claim that all automatic ingestion paths require the three-way review. Do not edit applied migration files in shared environments.

Checkpoint verification: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx vitest run supabase/tests/universal-manual-stories.test.ts src/features/library/StoryForm.test.tsx src/features/library/ChapterReadingHistory.test.tsx src/features/backups/restore.test.ts --maxWorkers=2` passed 85 tests. The temporary embedded-database reproduction described above passed by confirming the currently accepted bypass; it was removed after the review. The 16 November/17 November existing desktop sample manual-flow run passed six tests. These tests do not prove real PostgREST behavior, installed companions, or hosted migration safety.

Follow-up verification on 17 November 2026: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx vitest run supabase/tests --maxWorkers=2` passed 43 files and 444 tests; the desktop/mobile sample manual-story browser suite passed 12 tests. A separate temporary local PostgreSQL container replayed all 132 migrations, including the new guard; SQL lint passed. A rolled-back test using synthetic authenticated accounts confirmed that the direct count/progress bypass is rejected and the second account cannot see the first account’s entry. A targeted Auth/PostgREST test on the same disposable stack passed: synthetic owner and second-account isolation, rejection of the direct update, and an approved keep-read save. The same service-level scenario is now in `scripts/test-supabase.mjs`; the broader local integration suite and hosted rollout remain unverified. The new guard allows source-observation updates that preserve the manual override, status, and progress; checked manual editing still requires a choice.

Migration review: the three Phase 2 migrations preserve the existing owner policy and checked-save ownership design, use owner-scoped source uniqueness and invoker views, restrict direct execution of trigger helpers, and extend backup validation. The underlying foundation enables and forces RLS, uses `auth.uid()` for owner access, and grants authenticated users selected column updates. Embedded tests cover cross-account read/edit rejection and backup ownership, and targeted local PostgreSQL, SQL lint, Auth, and PostgREST checks now pass. Broader service-stack integration, native Safari, and hosted rollout remain unverified. Several migrations rewrite existing function definitions with text replacement, including replacements without individual match assertions; replay and inspect the final definitions against the exact target migration state before any shared deployment. The full-library document refresh in the chapter migration also needs a representative scale/timing check.

## Open Decisions And Next-Phase Dependencies

The user's final completion policy supersedes the original proposed complete-only rule: manually declared Abandoned/Deleted stories can finish on every source; unavailability alone stays unconfirmed. Final tile source-indicator design and ML remain undecided. No new persisted status is required.

Phase 3 must retain the new server-side manual-count guard and complete outstanding real-service, installed-companion, and migration checks before shared rollout. The direct-write bypass was fixed in a follow-up migration; automatic source observations remain a separate compatibility path. Phase 3 must add reviewed generic capture/mapping evidence through capability negotiation, preserve these private identities/overrides/reading decisions and validate fetch/redirect permissions before any network retrieval. Phase 4 owns bulk generic ingestion and resumable unresolved-count review; current bulk/AO3 imports retain their existing behavior. Phase 5 owns source-version associations, crosspost equivalence, source switching and any explicit progress synchronization. A URL candidate or matching chapter number never establishes crosspost identity/equivalence.

## Modified Paths

- `README.md`
- `companions/shared/bar.js`
- `companions/shared/bar.test.js`
- `docs/BACKUPS.md`
- `docs/IMPLEMENTATION.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/adr/0001-source-identity-boundary.md`
- `docs/architecture/source-compatibility.md`
- `docs/architecture/source-contracts.md`
- `docs/architecture/source-data-flow.md`
- `docs/universal-stories/01-story-architecture.md`
- `docs/universal-stories/06-reading-progress.md`
- `docs/universal-stories/08-security-and-migration.md`
- `docs/universal-stories/09-compatibility-contracts.md`
- `docs/universal-stories/IMPLEMENTATION_PLAN.md`
- `docs/universal-stories/PHASE_2_MANUAL_STORIES_PROGRESS.md`
- `docs/universal-stories/README.md`
- `server/restore-backup.mjs`
- `src/features/backups/repository.ts`
- `src/features/backups/restore.test.ts`
- `src/features/backups/restore.ts`
- `src/features/library/ChapterProgress.tsx`
- `src/features/library/ChapterReadingHistory.test.tsx`
- `src/features/library/ChapterReadingHistory.tsx`
- `src/features/library/LibraryPages.tsx`
- `src/features/library/LibraryProvider.tsx`
- `src/features/library/PublicationStatusIndicator.tsx`
- `src/features/library/ReadingFilterControls.tsx`
- `src/features/library/StoryForm.test.tsx`
- `src/features/library/StoryForm.tsx`
- `src/features/library/browsing/browsing.ts`
- `src/features/library/chapter-edit.ts`
- `src/features/library/edit-merge.ts`
- `src/features/library/model.test.ts`
- `src/features/library/model.ts`
- `src/features/library/reading-filter-labels.ts`
- `src/features/library/reading-search.ts`
- `src/features/library/repository.ts`
- `src/features/library/sample/repository.test.ts`
- `src/features/library/sample/repository.ts`
- `src/features/library/story-source.ts`
- `src/types/database.ts`
- `supabase/migrations/20261112000200_universal_manual_stories.sql`
- `supabase/migrations/20261112000300_chapter_total_review.sql`
- `supabase/migrations/20261112000400_universal_backup_compatibility.sql`
- `supabase/tests/deleted-bookmarks.test.ts`
- `supabase/tests/library.test.ts`
- `supabase/tests/safe-edits.test.ts`
- `supabase/tests/universal-manual-stories.test.ts`
- `tests/e2e/library.spec.ts`
- `tests/e2e/universal-manual.spec.ts`


# Phase 2 Implementation Report

Phase 2 provides a persistent, manually managed AO3 library and reading dashboard, building on the existing Phase 1 authentication, schema, navigation, and RLS. Requirements follow the supplied Implementation Plan Phase 2 (pages 2–3), Specification sections 2–3 and 13, and the detailed Phase 2 request. Custom collections and personal tags are included now as explicitly requested, although the broader plan also discusses collections in Phase 4.

## Implemented Features

- Library with all saved works, title/author search, story details, Add Story, editing, and confirmed removal.
- Prominent Add menu with Save for Later and Starting a Fic. Import History is a disabled, labeled Phase 3 placeholder.
- Six reading statuses, favorites, personal ratings, private notes, personal tags, and multiple authors, fandoms, and AO3 tags.
- Manual metadata entry with separate AO3 rating and publication status; published chapters, total chapters, word count, and summary. Unknown chapter totals remain NULL and display as `?`.
- Default shelves derived from status/favorite state. Currently Reading and To Read open the reading dashboard. DNF works remain searchable in Library and recoverable by changing reading status.
- Custom collection creation, renaming, confirmed deletion, filtering, and multiple memberships. Memberships are edited in story details. Deleting a collection preserves its stories.
- Currently Reading dashboard with search, sorting, cards, status/favorite controls, full summaries, progress, original AO3 links, and details. Sections distinguish Complete on AO3, New Chapter, Waiting for Updates, View All, and To Read.
- Numeric progress dialog with Save and Cancel, count validation, and next unread chapter calculation. Mark as Caught Up requires a known published count and preserves reading status. AO3 completion never marks a reader Finished. Re-reading and DNF transitions preserve stored information.
- Responsive desktop/mobile forms, navigation, cards, empty/loading/error states, and destructive-action confirmations.
- Transactional save of private metadata, progress, collections, and personal tags through Supabase. Reads paginate through the API response cap, including memberships, to avoid silent truncation.

## Database Migration and Security

Added `supabase/migrations/20261015000100_core_library.sql`; the Phase 1 migration is unchanged.

1. Adds `works.verified_chapters`, a JSON object mapping verified positions to chapter identifiers. Only existing trusted shared-metadata writers may write it; browsers cannot populate it. No mappings are retrieved during Phase 2.
2. Adds `validate_manual_entry()` and its library-entry trigger. It validates metadata value types, counts, ratings, publication state, and progress against known private counts.
3. Adds `save_library_story(...)`, an authenticated SECURITY DEFINER function with an empty search path and explicit ownership checks. It accepts an AO3 URL instead of an owner/work UUID, validates identity, creates or reuses a bare shared work record, and atomically saves only the caller’s private entry and memberships. Invalid foreign collections roll back the entire transaction. Anonymous execution is revoked.
4. Preserves all twelve existing tables, RLS policies, restricted browser grants, shared/personal separation, unique AO3 identity, immutable original submissions, verified canonical URL rules, and UTC timestamps. No tables or existing data are deleted.

The new migration was applied with `supabase migration up --local` to the existing local development stack. No reset was used. No hosted database was changed.

Manual titles, authors, fandoms, tags, counts, publication status, and summaries are private `metadata_overrides`; they are never written into another account’s shared metadata. JSON keys provide field-level overrides. Updates merge those keys so unrelated override fields survive. Future refreshes must use this precedence and leave private overrides untouched. Normalized shared authors/fandoms/tags tables remain available for a later metadata adapter.

## Chapter Links and Conservative Decisions

AO3 chapter identifiers are not chapter positions. URL parsing and progress inference are tested separately: a verified chapter 1 yields To Read / 0; verified chapter 4 yields Reading / 3; unverified chapter identifiers yield no inferred progress. The manual form permits explicit reading status and progress, including Starting a Fic’s explicit Reading default.

Phase 2 has no chapter verification service. New manual chapter links therefore remain unverified, preserve the original URL, and require manually entered progress. Cards/details offer Read Chapter only when a trusted position-to-ID mapping supplies that exact destination. They always offer the original URL. Canonical URLs stay unverified until trusted verification actually occurs.

Published chapter counts entered by the reader are saved snapshots. Unread counts describe those saved counts, not an automatically observed AO3 update. The New Chapter section intentionally shows an empty state; no fabricated update event is inferred from unread chapters. Last Updated uses known AO3 timestamps, puts unknown dates last, and uses title ordering for ties. Most Chapters Ready uses saved published counts; unknown counts sort last.

Move to Library explicitly moves a tracked story to To Read and retains progress and notes; this behavior is explained beside the menu action. Collection names and confirmations use browser-native prompts/dialogs. AO3 URL variants for the same work can be edited and are stored as a private `manual_url` override; the original submitted URL remains separate and accessible. Updated destinations are validated against the saved AO3 work identity before being linked. Work identity is immutable during edits; correcting the saved work to a different AO3 identity requires a separate entry. No importer, email, series, statistics, extension, or backup pipeline is included.

## Verification Results

| Check | Result |
| --- | --- |
| TypeScript and Vite production build | Passed |
| ESLint with zero warnings | Passed |
| Vitest unit, auth, repository, server-boundary, and actual embedded PostgreSQL tests | 101 passed |
| Local Supabase configuration tests | 7 passed |
| Desktop and mobile Chromium browser tests | 12 passed |
| Live local Supabase Auth/PostgREST integration | 27 checks passed |
| Supabase database lint after Phase 2 migration | No schema errors |
| Security checks | Passed privileged-key build rejection, bundle canary, frontend boundary, environment exclusions, private signup settings |

PostgreSQL coverage includes manual creation without retrieval, duplicate URL variants, invalid URLs, malformed metadata, negative/excess progress, all status transitions, DNF recovery, re-reading, unknown totals, caught-up versus Finished, AO3 completion independence, favorites, personal tags, multiple collection memberships, collection rename/delete, atomic rollback, override preservation, owned deletion, anonymous denial, and cross-account protection. Phase 1 schema/RLS tests still pass.

Browser coverage uses mocked Auth/REST contracts and checks persistence through refresh/logout/login, metadata edits, private notes, progress, collections, favorites, confirmed/cancelled deletion, Add defaults, invalid URLs, duplicates, cancellation, and viewport fit. Real Auth/PostgREST is tested separately against the local development stack using temporary accounts. The live suite checks stored data after logout and sign-in with a fresh client, using real PostgreSQL and ownership policies; fixtures are removed afterward. No automated tests target hosted or production data.

The source workspace contains cloud-backed files that stalled initial dependency reads and caused startup timeouts. A temporary verification copy with fresh dependencies from the unchanged lockfile confirmed the cause. The ignored original `node_modules` was then restored from that locked installation, and final frontend/build/browser checks passed in the original project using its normal scripts. Local Supabase migration/lint/live checks also passed; a fresh-client persistence run additionally passed from the temporary copy against the same local stack. Early startup timeouts and one ambiguous test selector were resolved; they are not passing results counted above.

## Files Created

- `src/features/library/model.ts`
- `src/features/library/model.test.ts`
- `src/features/library/repository.ts`
- `src/features/library/repository.test.ts`
- `src/features/library/LibraryProvider.tsx`
- `src/features/library/StoryForm.tsx`
- `src/features/library/LibraryPages.tsx`
- `supabase/migrations/20261015000100_core_library.sql`
- `supabase/tests/library.test.ts`
- `tests/e2e/library.spec.ts`
- `docs/PHASE_2_REPORT.md`

## Files Modified

- `src/app/App.tsx`: connects library routes and Add menu; updates roadmap content.
- `src/app/App.test.tsx`: retains Phase 1 auth coverage and updates Add expectations.
- `src/styles.css`: responsive library, forms, cards, and progress dialog styles.
- `src/types/database.ts`: migration-derived verified chapter map and RPC types.
- `scripts/generate-test-types.mjs`: retains generated table types and includes the save RPC contract.
- `scripts/test-supabase.mjs`: adds real Phase 2 saving, ownership, organization, and login-persistence checks.
- `tests/e2e/foundation.spec.ts`: retains Phase 1 browser tests and enables Phase 2 Add controls.
- `README.md`: current feature, migration, manual usage, and verification instructions.

The pre-existing user modification to `docs/Phase_1_Steps_Followed.md` was left untouched. Dependency manifests, lockfile, credentials, Phase 1 auth implementation, and original PDFs were not changed.

## Configuration and Remaining Limits

The local development database is migrated. For a hosted Supabase project, review and apply the versioned migrations with `supabase db push --dry-run`, then `supabase db push`. Hosted application behavior, invitation/recovery email delivery, production deployment, and real tablet hardware have not been tested. Desktop and mobile browser emulation pass; the responsive layout also adapts at intermediate widths. The live integration suite validates local Auth rather than external email delivery.

Use the existing invited account and public Supabase URL/key configuration in `.env.local`. No new privileged frontend credential or Edge Function deployment is needed for Phase 2. The optional Phase 1 account-status function and invitation utility remain unchanged.

To run locally:

```sh
cd FanficTrackerLibrary
npm ci
# Keep the existing .env.local; configure the public URL/key if needed.
npx supabase migration up --local  # only for a local stack not already migrated
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. A hosted Supabase project requires applying the migration there before using the new save controls. For verification use `npm run check`, `npm run test:e2e`, `npm run db:lint`, and `npm run test:integration` with the local stack running.

No code was committed, pushed, or deployed. No secret was introduced into source or browser bundles, and environment files remain ignored. Phase 1 authentication, invitation/recovery UI, protected navigation, session restoration, sign-out, and isolation tests pass. Phase 3 functionality has not started.

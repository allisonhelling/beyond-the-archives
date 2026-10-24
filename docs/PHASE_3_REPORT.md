# Phase 3 Implementation and Operations Report

Implemented against `AO3_Implementation_Plan.pdf` (Phase 3, steps 3.1–3.5) and `AO3_Project_Specification.pdf`. Code is ready for review; production migrations, worker deployment and scheduling have **not** been performed.

## Delivered Behavior

- `/imports`, main/mobile navigation, the Add menu and the Library toolbar expose the importer.
- Paste 100+ links, including links embedded in text. The explicit maximum is 2,000 URL tokens per batch. Preview shows detected and unrelated URL counts.
- Submission atomically stores tracked AO3 inputs, saves editable work identities and private library entries, and enqueues one metadata job per distinct work in the batch. AO3 retrieval is separate from submission.
- Every tracked AO3 input retains its submitted URL, result, status, duplicate relationship, identity, metadata status, last attempt, errors and verified chapter position where available. Unrelated hosts create no history records; an entirely unrelated submission leaves no empty batch.
- Saved identities survive restricted, unavailable, timed-out, blocked and unparseable metadata responses. Missing titles display `AO3 work <id>` until metadata or a manual correction is available.
- Batch selection exposes submission date, tracked/imported/already-saved counts, pending/processing/completed/failed/skipped/cancelled counts, progress, cancellation and individual results. History is reloaded every five seconds, with pagination over API response limits.
- Individual results link to existing story details and metadata editing. Eligible failed jobs have Retry Metadata controls. Existing work progress requires a separate explicit approval action.
- Story details offer Retry / Update Metadata, retrieval timestamps and removal of individual manual overrides. Imported stories use the same Library, Currently Reading, details, notes, ratings, favorites, collections and reading controls as manual stories.

## Identity, Deduplication and Chapter Verification

`src/features/imports/urls.ts` is the shared TypeScript parser used by manual entry and imports. It accepts HTTP/HTTPS AO3 work links, optional `www`, collection-qualified work links, chapters, trailing slashes, query parameters and fragments. It rejects unsafe numeric IDs, unsupported paths, credentials and custom ports. Standalone chapter links cannot establish a work identity and are unsupported.

The normalized candidate is `https://archiveofourown.org/works/<work-id>`. Normalization does **not** establish a verified canonical URL. The original parsed URL token is retained, including meaningful query/fragment punctuation. Pasted text extraction recognizes URL tokens and removes prose delimiters when necessary; manual parser calls preserve the exact input string.

The database independently validates the submitted URL array. The work ID is the sole identity. Existing unique constraints on `works.ao3_work_id` and `(library_entries.user_id, work_id)` protect concurrent submissions. Duplicate items remain in history and point to the first item, but share one job and one library entry. A separate batch can refresh the same work without recreating the entry.

Only explicit numbered AO3 chapter selector options establish a chapter-position-to-ID map. Neither chapter IDs nor DOM order become chapter numbers. The adapter validates positions against published chapter count and rejects ambiguous maps. A chapter link absent from the verified map remains unverified and does not infer progress.

For a newly created, untouched entry, the maximum verified position across every occurrence of that work in the batch sets fully read chapters to `position - 1`. Thus chapter 6 followed by chapter 2 produces five read chapters. Chapter 1 and unverified links remain To Read at zero. Existing entries retain their reading status and progress. The explicit approval action advances with `greatest(existing, position - 1)` and leaves status unchanged. Any user edit while initial retrieval is pending suppresses automatic initial progress.

## Database Migration and Security

New migration: `supabase/migrations/20261016000200_bulk_imports.sql`.

- Adds `import_batches`, `import_items`, `metadata_jobs`, `processing_logs` and the private singleton `metadata_worker_state` gate.
- Adds `works.automatic_metadata` for series names and verified series memberships, and `works.last_metadata_success`. Existing metadata check, provenance, canonical verification and verified chapter fields are reused.
- Reuses normalized authors, work-author links, fandoms, work-fandom links, categorized tags and work-tag links.
- Adds ownership foreign keys, batch/work uniqueness, ordinal uniqueness, status/attempt constraints, queue/ownership/relationship indexes, two-minute leases and unique claim tokens.
- Enables and forces RLS. Browser roles receive owner-only SELECT on import records and no direct queue mutation privileges. Anonymous privileges are explicitly revoked, including inherited Supabase defaults. Worker state is inaccessible to browser roles.
- Authenticated RPCs submit URLs, cancel batches, retry eligible failures, approve verified progress and clear private overrides. Each derives ownership from `auth.uid()`; no caller-provided owner is trusted.
- Claim and commit RPCs are executable only by `service_role`, use an empty search path, and fence results against the current token, lease and cancellation state.
- Extends the existing manual save function's URL allowlist and permits metadata patches on existing records. New manual records still require a title; empty title corrections remain invalid. The migration edits the existing function definition in place rather than duplicating its implementation. Prior migrations and existing data are preserved.

The generated database types include the new tables and authenticated RPCs. Regenerate authoritative Supabase types after applying the migration to a running local stack.

## Metadata Adapter and Conflict Policy

The server implementation has separate responsibilities:

1. `server/ao3/adapter.ts`: allowlisted retrieval and pure HTML parsing. Input is a validated work ID and matching normalized URL; output contains structured automatic metadata, chapter verification, source URL, retrieval/error category, retry eligibility and pause duration. No database client or private library data enters the adapter.
2. `server/ao3/metadata-service.ts`: validates and allowlists fields, counts, dates, links, lists, series identities and chapter maps. Missing/null/invalid fields are omitted. Empty automatic strings/lists are conservatively omitted rather than clearing valid data.
3. `server/ao3/worker.ts`: claims one persisted job, calls the replaceable adapter, validates its output and invokes the transactional commit boundary.
4. `finish_metadata_job`: serializes application to the work record, updates only eligible automatic fields/relationships, records provenance and successful retrieval time, resolves per-link chapter positions and persists the result. Personal data is never merged with adapter output.

Retrieved fields include title, author names and links, summary, fandoms, tag categories, relationships, characters, freeform tags, rating, archive warnings, word counts, published/total chapters, completion, publication/update dates and verifiable series IDs/names/URLs/positions. Unknown counts remain NULL. A new published count can invalidate an obsolete smaller total; that stale total then becomes unknown. Partial responses retain other valid fields.

A canonical URL is written only after a successful parsed page provides matching work-owned identity evidence. Offsite redirects, login redirects and redirects to another work never change the saved identity. Same-work redirects are bounded and paced. No cookies, passwords, AO3 authentication or adult-confirmation bypass are used. Responses have time and size limits, and HTML is rendered as escaped text in React.

Private `metadata_overrides` remain the source of manual field provenance: key present means manually managed; key absent means automatic. Effective metadata overlays these private fields on shared automatic metadata. Existing overrides survive migration unchanged. Editing reading or organization data sends no automatic metadata as new overrides. Editing metadata sends only changed fields. Users can remove individual overrides to restore automatic management.

## Worker Execution, Scheduling and Recovery

The locally runnable worker is `server/import-worker.ts`, invoked with `npm run worker`. It runs independently of browser navigation. Each execution claims **one** job; the continuous local process waits 15 seconds between executions. The PostgreSQL gate allows only one active retrieval across worker hosts and at least 15 seconds between claims. Bounded same-work redirects also wait 15 seconds between requests.

The deployed option is the supplied `supabase/functions/import-worker/index.ts` Edge Function, invoked once per minute through Supabase Cron/pg_net. This keeps Vercel responsible for the existing static frontend, without introducing another hosting service or long-running Vercel request. Supabase documents this scheduling approach at https://supabase.com/docs/guides/functions/schedule-functions.

`supabase/scheduling/import-worker.sql` is an optional installation script, separate from schema migrations. It reads the function URL and a dedicated bearer token from Vault. The function checks `IMPORT_WORKER_TOKEN` itself; JWT verification is disabled specifically for this scheduled endpoint. It never accepts a browser-supplied user/work/job identity.

Configure the Edge Function secret, deploy it, enable pg_cron/pg_net, create the two documented Vault entries and run the scheduling script before expecting hosted background processing. These operations need the user's deployment configuration/approval and have not been executed. Do not run a separate scheduler unless desired; the shared database gate still bounds concurrent callers.

Resume behavior:

- Jobs are committed before any AO3 request. Closing the page does not cancel them.
- Unfinished processing leases expire after two minutes. A later execution reclaims them with a new token; late or duplicate completions cannot commit.
- Each job has at most four attempts, including recovery attempts. Exhausted interrupted jobs become terminal failures with an explanation.
- Transient failures retry automatically with exponential backoff (30, 60, 120 seconds before exhaustion), subject to global pacing. Permanent unavailable/restricted/parser/identity failures do not retry automatically.
- HTTP 429 pauses all retrieval for at least an hour and honors longer Retry-After values. HTTP 403 and blocking challenges pause it for 24 hours. The affected job needs an explicit eligible retry; it does not automatically keep probing AO3. Other pending jobs remain persisted during the pause.
- Cancellation invalidates pending/in-flight jobs and their tokens, preserving saved entries. An already sent HTTP request cannot be recalled; its result is rejected, and the global gate remains conservative until its lease expires.
- Retry Metadata requeues an eligible failure without resetting attempts or bypassing its due time/global pause. The story-level Update Metadata action explicitly starts a new refresh batch through the same pipeline.

The minute-based hosted schedule processes at most one work per minute (100 works therefore take at least roughly 100 minutes). The local continuous worker is faster but remains conservative. Delays, timeouts, retries and blocks can extend these times.

## Local Setup and Verification

From `FanficTrackerLibrary`:

```sh
npm install
# Start Docker Desktop before starting the local Supabase stack.
npm run db:start
npx supabase migration up --local
```

Set `.env.local` with the local Supabase URL and publishable/anon browser key. Set a separate ignored `.env.worker` with `SUPABASE_URL` and the local server-only `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`). Obtain local values from Supabase status; do not use privileged keys in `VITE_` variables.

```sh
npm run dev
# Separate terminal; this command loads .env.worker if present:
npm run worker
# Or a single bounded execution:
npm run worker -- --once
```

Sign in using the existing invited-user workflow, open Add → Import History from AO3, paste links, and submit. Valid identities are immediately editable. Leave the page, then return to `/imports` to see persisted processing results. Stop/restart the worker to exercise lease recovery. Cancel remaining retrieval or retry eligible failures from history. Node 22.12+ is required, consistent with package engines.

```sh
npm run check
npm run test:db
npm run test:e2e -- --workers=1
npm run db:lint
npm run test:integration
```

Use a disposable local database for integration tests. The live runner creates temporary accounts, cleans them up, and now includes real parallel worker claim requests. Stop other workers and finish/cancel pre-existing local jobs before queue integration tests; it refuses to claim unrelated pending work.

## Validation and Limitations

- `npm run check`: passed (lint; TypeScript and production build; 208 Vitest tests; 7 integration-configuration tests; browser/server boundary, privileged-key rejection and production-secret canary checks).
- Embedded PostgreSQL migration/RLS/library/import suite: 69 tests passed. This executes all versioned migrations in PGlite, including ownership, anonymous access, worker-only privileges, cancellation, recovery, deduplication, retries and preservation checks.
- `npm run test:e2e -- --workers=1`: 26 desktop/mobile tests passed, including 110-link import/reload/viewport coverage and existing login/logout, manual entry/editing, progress, favorites, notes, collections, search, DNF and persistence workflows. Browser tests use mocked Auth/PostgREST contracts; database behavior is covered separately.
- `npm run db:types:embedded`: passed. The Node worker module and adapter loaded successfully through Node's TypeScript execution path.
- `npm run db:lint`: attempted, including outside the sandbox; blocked by refused local database connection at 127.0.0.1:54322.
- `npm run test:integration`: attempted, including outside the sandbox; blocked because local Supabase is unavailable. Docker CLI is installed, but the Docker daemon is not running. The new real parallel-connection test is implemented but unexecuted.
- Edge deployment, Edge/Deno runtime verification, Vault/Cron installation, live Supabase schema lint and live AO3 smoke tests remain unverified. No production migration or external deployment was performed.
- Tests use committed representative AO3 HTML fixtures and mocked fetch responses, never repeated live AO3 requests. Actual AO3 markup/access may require adapter maintenance. Login-restricted and adult-gated works remain editable manually; no authentication or restriction bypass is attempted.
- The initial parallel browser run had navigation timeouts; a sequential rerun completed all 26 checks. Contract assertions were updated for Phase 3 behavior and newly loaded normalized metadata tables.
- Database statuses and metadata retrieval statuses are separate: metadata can fail while the work itself is safely saved. Standalone chapter URLs are unsupported, and no chapter position is invented when verification is absent.
- No application secrets were added to source or exposed to browser code. Security canary checks passed. No Git commit was created; deployment credentials remain a configuration task.
- Phase 4–6 features were not added: no advanced search parser, dedicated series/statistics pages, email ingestion, extension or full backup/restore workflow. Verified series metadata is stored only for the Phase 3 adapter.

## Files Created

- `docs/PHASE_3_REPORT.md`
- `src/features/imports/urls.ts`, `urls.test.ts`, `repository.ts`, `ImportPage.tsx`, `ImportPage.test.tsx`, `MetadataControls.tsx`
- `server/ao3/adapter.ts`, `adapter.test.ts`, `metadata-service.ts`, `worker.ts`
- `server/ao3/fixtures/work.html`, `partial.html`, `restricted.html`
- `server/import-worker.ts`
- `supabase/migrations/20261016000200_bulk_imports.sql`
- `supabase/tests/imports.test.ts`
- `supabase/functions/import-worker/index.ts`
- `supabase/scheduling/import-worker.sql`

## Existing Files Modified

- `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`, `README.md`
- `scripts/generate-test-types.mjs`, `scripts/test-supabase.mjs`
- `src/app/App.tsx`, `src/app/App.test.tsx`
- `src/features/library/model.ts`, `model.test.ts`, `repository.ts`, `StoryForm.tsx`, `LibraryPages.tsx`, `sample/repository.ts`
- `src/styles.css`, `src/types/database.ts`
- `supabase/config.toml`, `supabase/functions/deno.json`, `supabase/tests/foundation.test.ts`
- `tests/e2e/foundation.spec.ts`, `tests/e2e/library.spec.ts`

The only new runtime dependency is Cheerio, used on the server for HTML parsing. Existing React, Supabase, routing, form styles, library repository, metadata overrides and database relationships are reused.

## Local Configuration Follow-Up

The first one-link submission failed because `.env.local` targeted hosted Supabase, where `submit_import_urls` was absent (`PGRST202`), while `.env.worker` targeted local Supabase. The local app and worker have now been configured for the same local instance. Previous hosted browser settings are preserved in ignored `.env.local.hosted`; the hosted database was not changed.

Pending local migrations were applied without resetting data. Live function lint identified a dynamic-column inference error and an implicit enum assignment warning. Two additive migrations update only those blocks in the existing metadata commit function:

- `20261016000300_static_metadata_updates.sql`
- `20261016000400_explicit_tag_category_cast.sql`

Both are applied locally. Database lint now reports no schema errors. The 28 live Supabase integration checks passed, including concurrent claims and private-account isolation; all 69 embedded database tests also passed. This supersedes the initial delivery's local-Docker validation limitation. Edge deployment and live AO3 smoke testing remain unverified.

`src/features/imports/repository.ts` now reports a missing importer migration specifically, distinguishes permission failures, and validates the 2,000-link limit before contacting the database. Added `src/features/imports/repository.test.ts`; all 21 importer tests, lint and the production build passed during this follow-up.

Restart both the Vite development process and metadata worker after changing environment files. Local authentication is separate from hosted authentication; the local database initially had no accounts and needs a local account before interactive use. No hosted account or library was copied.

## Preserving AO3 Tag Order

Migration `20261016000500_preserve_source_tag_order.sql` adds nullable `work_tags.source_position` and an index for ordered reads. The metadata commit function records the position of each tag within its AO3 category using PostgreSQL ordinality; the library reads those positions before tag IDs. This preserves additional-tag order through persistence and refresh without duplicating metadata or changing private overrides. The migration is applied locally and database lint passes. Existing rows have unknown positions until their next successful metadata refresh. Parser fixtures and database tests cover nonalphabetical order and later source reordering.

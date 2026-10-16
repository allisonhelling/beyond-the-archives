# AO3 Library & Reading Tracker

Phases 1 and 2 of the supplied **AO3 Implementation Plan** and **AO3 Project Specification**, presented as **between chapters**. React, TypeScript, Vite, Tailwind CSS, and Supabase PostgreSQL. Hosting is prepared for Vercel, as specified in the PDF.

Phase 2 implements a private, manually managed library: story creation and editing, reading progress and statuses, favorites, notes, personal ratings, default shelves, multiple custom collections, and personal tags. All changes persist in Supabase. Automatic metadata retrieval and importing remain future work. See [the Phase 2 report](docs/PHASE_2_REPORT.md) for verification, decisions, and changed files.

The additive Phase 2 migration was applied to the local development Supabase stack. No hosted database was changed or deployed during this phase.

## Run locally

Requires Node **22.12+** (Node 22 LTS recommended) and npm.

```sh
npm ci
cp .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. Without environment configuration, the app shows a setup screen and makes no Supabase requests. The only browser configuration is the Supabase project URL and **publishable** key, or a legacy **anon** key. Never put a secret/service-role key, database password, or connection string in a `VITE_` variable. Build-time validation rejects privileged keys, even if mislabeled as public.

## Preview with sample stories

```sh
npm run dev:sample
```

Open the URL printed by Vite. This development-only mode opens a populated library immediately, without Supabase configuration or sign-in. Your 13 AO3 links become 14 stories: the series **of bards and witches and witchers** contains two works. The library has six Finished, two Waiting for Updates, two Reading, one Re-reading, and three To Read entries.

Search, filters, story details, chapter progress, favorites, ratings, notes, and collections work in the preview. Changes persist in this browser's local storage under `between-chapters:sample-library:v1`. **Reset sample data** restores the original examples. Preview mode makes no Supabase requests, and is disabled in production builds. Use `npm run dev` for the normal authenticated app. The sample mode flag comes from the committed `.env.sample`; do not set `VITE_SAMPLE_DATA=true` in `.env.local` if you want normal development mode.

Metadata in `src/features/library/sample/stories.json` was captured on October 15, 2026 from the supplied AO3 links (using AO3's official `secure.ao3.org` address when the main address returned errors). It is a static snapshot; starting the app does not fetch AO3. AO3 publication status stays independent from your requested reading status. Finished entries use their published chapter count; waiting entries use it when available. Reading and re-reading progress uses the chapter immediately before your saved link only where AO3's chapter index verified the position. Other progress starts at zero. These values illustrate the preview, rather than recording actual reading history. Notes, personal ratings, and favorites start empty.

Two works require AO3 sign-in: **On My Love** (8577016) and **Something’s Different About You Lately** (24973237). Their title, author, and fandom come from [a public reference for On My Love](https://fanfics.me/ftf213074) and [a public recommendation listing Something’s Different About You Lately](https://www.tumgik.com/tag/reset%20rewind%20rewrite). Their summary, tags, rating, dates, chapter counts, and publication status remain unknown. Their original chapter links are preserved, and you can fill in details in preview. No AO3 account credentials are used.

## Use the manual library

1. Sign in with your invited account. Choose **Library → Add Story**, or **Add → Save for Later / Starting a Fic**.
2. Enter an AO3 work URL and title. Enter optional authors, fandoms, tags, summary, rating, and chapter counts by hand. Leave unknown counts blank.
3. Choose reading status, fully read chapter count, favorites, private notes, personal tags, and any custom collections, then **Save story**.
4. Open **See Full Details** to edit metadata and organization. Click **Chapter # of #** to edit progress in an anchored menu, then save or cancel. Escape, outside clicks, and outside focus dismiss unsaved edits. **Mark as Caught Up** uses the saved published count and sets complete works to Finished or ongoing works to Waiting for Updates; unknown publication status preserves the current reading status. A dismissible two-minute Undo notice restores both progress and status.
5. Create collections with **New Shelf**. Choose a collection to rename or delete it. Deleting a collection keeps its stories. Removing a story requires confirmation and deletes that account’s private entry and memberships. The two-minute Undo notice restores its original entry ID, timestamps, metadata overrides, notes, rating, favorite, progress, and surviving collection/tag memberships.
6. DNF entries remain in the searchable Library and the **Did Not Finish** shelf. Change reading status to recover them. Re-reading preserves metadata and progress until you change progress explicitly.

No AO3 request is required to save. Chapter IDs do not identify chapter positions. An unverified chapter link preserves its full original URL and leaves inferred progress at zero. Enter progress manually. Only trusted, verified chapter mappings can produce a next-chapter destination; Phase 2 does not fetch or verify mappings. Unknown totals display as `?`.

For an existing local Phase 1 database, apply the additive migration without resetting data:

```sh
npx supabase migration up --local
npm run db:lint
npm run test:integration
```

Hosted projects require reviewing and applying the migrations through the normal `supabase db push --dry-run` / `supabase db push` workflow. Never run `db:reset` against an established database to upgrade it.

Account settings and Log out are available in the profile-icon menu, which shows the account’s saved display name or an email-based fallback. Settings no longer occupies a main navigation tab. In Add/Edit Story, select a personal rating with one of five stars; choosing the third fills three stars and saves the numeric rating 3/5. Clear rating removes it. Favorites sit beside the rating, and Save/Cancel are equal-size actions on one row.

Work-card author lines use smaller “By …” text. Story details use a larger “By …” line, and their return link uses an arrow icon with an underline on hover.

Work cards show maroon publication status, favorite and action-menu controls at the top, then the summary, full-details link, read/caught-up actions, and clickable chapter progress. The read button has square corners and fills the available row width; Mark as Caught Up shows button styling on hover or keyboard focus. Reading status and metadata dates remain available in full details. Details pages return to the originating Currently Reading tile or Library shelf, including after a refresh or edit. Canonical, original provided, and updated provided URLs are clickable metadata rows; verified chapter links are visibly underlined. **Mark as Finished** marks a fic Finished and all known published chapters read. If only the total is known it uses that count; if both counts are unknown it preserves progress. Notes stay unchanged. The action offers the same two-minute Undo notice. Unverified chapter destinations use a Read on AO3 button pointing to the saved link.

## Shared UI templates

Add `menu-surface` to a popup menu container to give its enabled buttons, links, and checkbox rows a shared hover and keyboard-focus background. Customize `--menu-hover-background` and `--menu-hover-color` on the container when needed. Story, Add, profile, filter, fandom, and suggestion menus all use it.

`src/components/UndoNotice.tsx` provides a reusable Undo banner. Pass an `id`, `message`, async `onUndo`, and stable `onDismiss(id)` callback. Optional `durationMs` (default 120,000), `undoLabel`, and `dismissLabel` adapt it to other actions. It handles expiry, dismissal, pending state, and retryable errors. LibraryProvider owns reading snapshots so Undo survives route and shelf changes.

## Currently Reading search and filters

Currently Reading has a sort/group/search/fandom toolbar and an expandable Filters panel. Fandom selection supports multiple fandoms, searchable names, per-fandom fic counts, and removable chips. The expanded Work Status filter selects AO3 publication status. Expanded filters include AO3 rating, favorites, relationship tags, AO3 tags, and an inclusive AO3 last-updated date range in UTC. Dates and chapter counts use saved metadata; unknown values are not invented. The toolbar is a separate tile; sort, title/author search, and fandom selection appear once. Dashboard selects use custom menus with keyboard navigation and remain open while selecting options. Menus close on outside clicks, outside focus, or Escape. The toolbar orders Sort By, Group by, Search title or author, and Fandom. Sort and grouping selections persist in browser storage across navigation and refreshes; Clear all filters preserves these display preferences. Filter names appear in uppercase beside their controls; the title/author search keeps its accessible label and uses only its placeholder visually. The desktop toolbar fits on one row. Search inputs and dropdown triggers share a compact 36px height and 14px font, including Characters and Tags. Clear/Hide filter actions have extra space above them. Fandom choices stay open while selecting multiple values and close when clicking away.

View All shows Reading, Waiting for Updates, and Re-reading entries. To Read shows saved-for-later entries. Complete on AO3 includes only Reading or Re-reading entries with complete publication status. In Progress on AO3 includes only Reading or Re-reading entries with in-progress publication status; Waiting for Updates and unknown publication status are excluded. Marking an unfinished work Waiting for Updates moves it out of In Progress on AO3. Desktop tiles put Complete on AO3, In Progress on AO3, New Chapter, and View All in the first row, with Waiting for Updates and To Read below. Small screens use two columns. New Chapter requires a saved, undismissed notification plus a verified unread chapter destination and published count; this update does not fetch metadata or create notifications.

Title/author, relationship, and Tags suggestions open on focus, even for an empty query. Suggestions use saved metadata; relationship suggestions use the saved AO3 Relationships category. Relationships, Characters, and Tags support multiple selections shown as removable chips, including after the suggestion menus close. Type a partial tag and press Enter to add it as a chip. Each selected relationship, character, or additional tag must match. Characters searches only AO3 Character tags; Tags searches only AO3 Additional Tags (freeform). AO3 tag categories are loaded from saved normalized metadata or private categorized lists. The sample snapshots retain the categories from their AO3 headers. Legacy unclassified tags remain searchable in Any field but are excluded from category-specific filters until classified in story details. Fandom options use compact checkboxes and numeric fic counts. Search scope and Search within results share one row. The icon at the right edge of the results input opens search help. Relationship and AO3-tag panels omit repeated headings and remain open as choices are selected.

Search within results supports `*` wildcards, spaces for AND, `||` for OR, quoted phrases, and leading `-` for NOT. AND/NOT bind before OR. Backslash escapes the next character, including literal operators. Matching ignores case and accents; ordinary terms also match partial words. Choose Any field, Summary, or Notes to set the search scope. Invalid syntax displays an error instead of silently changing the query. Filters combine with the selected tile; multiple selected fandoms match any selected fandom, while selected Additional Tags must each match. Clear all filters resets the filter panel, search, sort, and grouping.

Grouping supports fandom, author, and manually saved series names. Edit series names in story details; this is private manual metadata, not automated series retrieval or a series navigation system. Works with several authors, fandoms, or series appear in each relevant group. Missing group metadata is labeled explicitly. Filters are held in page state and are reset after leaving/reloading the page.

## Set up Supabase

Choose either a hosted project or a local Docker stack. Database changes always use versioned migrations under `supabase/migrations/`.

### Hosted project

1. Create a Supabase project in your own account. Keep the database password and secret/service-role keys outside this repository.
2. Authenticate the CLI interactively with `npx supabase login`, then link with `npx supabase link --project-ref YOUR_PROJECT_REF`.
3. Review the migration, run `npx supabase db push --dry-run`, then `npx supabase db push` to apply it. These are setup instructions; no hosted migration was applied during implementation.
4. **Disable “Allow new users to sign up” and anonymous sign-ins in the hosted Auth settings.** The local `config.toml` does not configure hosted Auth. An email/password provider must remain enabled for invited users.
5. Set the Site URL to your app origin. Allow the exact `http://127.0.0.1:5173/auth/callback` development redirect and the exact `https://YOUR-APP.vercel.app/auth/callback` production redirect. Avoid broad wildcard production redirects.
6. Set the minimum password length to 12 and require upper/lower case letters, a number, and a symbol. Configure your SMTP provider for reliable invitation and recovery delivery.
7. Set email templates as described below, then invite your own address from **Authentication → Users → Invite user**. No public registration form or signup API is used by this app.
8. Set the two public environment variables in `.env.local`, restart Vite, follow the invitation, set your password, and sign in.

Use these email-template links so the app can verify one-time token hashes and request a password for both invitation and recovery:

```html
<!-- Invite user template -->
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite">Accept invitation</a>
<!-- Reset password template -->
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

These templates target the configured Site URL; use separate development/production projects or change Site URL deliberately when testing. Default Supabase invitation/recovery redirect links are also recognized. PKCE recovery links must be opened in the browser that requested them. Expired or already consumed links fail closed.

For operator invitations, `npm run invite` is an alternative to the Dashboard. Supply `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `INVITE_EMAIL`, and `APP_ORIGIN` through your trusted terminal's environment/secret manager. It calls the Admin API from `server/` with session persistence disabled. Never store the secret in frontend env files, paste it into chat, or prefix it with `VITE_`.

### Local stack

Install and start Docker Desktop or a compatible Docker engine, then:

Run these commands one at a time. Continue only after the previous command succeeds. If startup reports a failed health check, the database may still be running while Auth and the API are unavailable; a successful reset/lint alone does not confirm the full stack is ready.

```sh
npm run db:start
npm run db:reset
npm run db:lint
npm run test:integration
```

`db:reset` **erases the local development database** and reapplies migrations. It is not a production rollback command. Copy the local API URL and **anon** key from `npx supabase status` into the two frontend variables; do not copy the service-role key. Local Studio is at port 54323; the local email inbox is at port 54324. Use Studio to invite a development user. Local public signup is disabled in `supabase/config.toml`.

Keep `[auth].enable_signup = false` and `[auth.email].enable_signup = true`. Despite its name, the latter setting also controls whether the Email provider is available for existing/invited accounts to sign in. Global signup remains disabled. After changing Auth config, use the normal `npx supabase stop` and `npm run db:start` to apply it; a database reset is unnecessary.

The live integration script reads local keys into process memory, creates two temporary accounts, signs in through real Supabase Auth, checks all twelve tables through PostgREST, and removes its fixtures. It refuses non-loopback endpoints. Do not point destructive integration tests at production.

If startup fails, retry `npm run db:start -- --debug` after confirming Docker Desktop is running. Already downloaded images are reused. If that returns success but lists Auth, Kong or PostgREST under **Stopped services**, run `npx supabase stop` (the default keeps a database backup), then `npm run db:start -- --debug` again. Do not use `--no-backup` for this recovery. The integration runner accepts both legacy flat status JSON and newer CLI status responses containing an `env` map. If it reports a missing API URL or keys, complete startup before retrying `npm run test:integration`; do not substitute your hosted project's credentials.

## Server boundary

`server/invite-user.mjs` is a trusted operator utility, never a frontend import. No browser-accessible endpoint can create accounts or mutate shared AO3 metadata. The authenticated `save_library_story` PostgreSQL function can create a bare shared work identity and atomically save only the caller’s private manual metadata and organization.

`supabase/functions/account-status/` establishes the authenticated Edge Function boundary. It verifies the supplied bearer token using `auth.getUser(token)`, derives identity exclusively from that verified user, restricts CORS to `APP_ORIGIN`, and returns only user ID and schema version with `Cache-Control: no-store`. The gateway JWT switch is off because the handler verifies tokens itself, including tokens using modern signing keys; it does **not** permit anonymous handler access. No privileged credential is required by this function.

To deploy it after project setup, set the **server-side** `APP_ORIGIN` secret in Supabase and run:

```sh
npx supabase functions deploy account-status
```

Supabase supplies its server URL and anon key. The function is optional for rendering the Phase 1 shell; future privileged operations must remain in trusted server code and must validate authorization for each operation. Importers and email handlers remain absent. Phase 2 library writes use a narrow authenticated PostgreSQL RPC; the account-status function remains optional.

## Schema and access model

| Tables | Purpose and browser access |
| --- | --- |
| `works` | Globally unique AO3 identity and canonical metadata; readable only through your library |
| `authors`, `fandoms`, `tags` | Normalized shared AO3 metadata; readable only when linked to your saved works |
| `work_authors`, `work_fandoms`, `work_tags` | Many-to-many AO3 metadata relationships; same visibility rules |
| `library_entries` | Private status, progress, favorite, rating, notes, original URL, and manual overrides |
| `collections`, `collection_works` | Owned shelves and membership of owned library entries |
| `personal_tags`, `library_entry_tags` | Private organizational tags and owned entry membership |

All twelve tables enable and force RLS. Anonymous table access is denied. Personal rows require `auth.uid() = user_id` for both existing and new values. Composite foreign keys also prevent attaching another account's entry, collection, or tag. Shared metadata has no browser write grants; a trusted server can write it using a secret key.

`library_entries` creation is restricted to the authenticated save and restore functions. `save_library_story` is a narrowly scoped SECURITY DEFINER function with an empty search path. It validates an AO3 work URL, derives ownership from `auth.uid()`, creates or reuses the work identity, and saves private overrides and memberships in one transaction. It accepts no caller-supplied owner or work UUID. Existing owners may update a limited set of personal columns or delete their own entry. Work identity and original submission remain immutable on edits. Shared AO3 metadata has no browser write grants.

Deletion Undo requires `20261016000100_restore_library_story.sql`. Its narrowly scoped `restore_library_story` transaction verifies the authenticated owner and matching AO3 work URL, restores the private snapshot and surviving links atomically, and rejects conflicts. It does not grant direct INSERT access or modify shared metadata. Apply it through the migration workflow above; no hosted migration is applied automatically. Sample mode restores its browser-local snapshot without a database.

Key modeling decisions:

- `works.ao3_work_id` is globally unique; `(user_id, work_id)` is unique per library.
- `library_entries.original_url` preserves the exact user's submission, including chapter/query parameters. It is separate from `works.canonical_url`, which remains NULL until verified. The latter must match the canonical AO3 work ID and have a verification timestamp.
- `published_chapters`, `total_chapters`, and `is_complete` are nullable. Unknown totals stay NULL; zero is not a substitute for an unknown total. Progress defaults to zero fully read chapters.
- Reading status and AO3 completion are independent. No trigger changes personal progress or completion when shared metadata changes.
- `metadata_overrides` lives on the private entry; automatic metadata and field provenance live on the work. Future metadata refreshes must leave private overrides untouched. Phase 1 establishes this storage boundary without implementing a Phase 3 refresh pipeline.
- All timestamps use `timestamptz`; PostgreSQL stores instants in UTC. Future UI timestamps should use the reader's local timezone.
- `collection_works.library_entry_id` intentionally references an owned library entry rather than a bare global work.
- No later-phase import/job, series, notification, or history tables are created.

## Project layout

```text
src/
  app/                 protected routes and responsive shell
  components/          shared presentation components
  features/auth/       session provider, sign-in and password recovery
  lib/                 public configuration and typed Supabase client
  types/database.ts    generated migration-derived types
  test/                frontend and server-boundary test setup
server/                trusted operator utilities, excluded from browser imports
supabase/
  migrations/          versioned PostgreSQL schema, constraints, grants and RLS
  functions/           authenticated server boundary
  tests/               PostgreSQL migration and isolation tests
scripts/               database harness, types, integration and security checks
tests/e2e/             desktop and mobile browser tests
docs/                  phase scope, verification, and changed-file inventory
```

`npm run db:types:embedded` regenerates types from the embedded migrated schema. With a running local Supabase stack, `npm run db:types` generates official Supabase types. Relationships, nullable values, inserts, updates, and enum types are included. Do not hand-edit generated types.

## Verify

```sh
npm run check                 # lint, TypeScript, production build, unit/SQL tests, security checks
npm run test:unit             # frontend, auth, config, server-boundary tests
npm run test:db               # real embedded PostgreSQL migrations/RLS; no Docker required
npx playwright install chromium
npm run test:e2e              # desktop and mobile Chromium, mocked Auth/REST contracts; real PostgreSQL and live local Supabase tested separately
npm audit --audit-level=moderate
npm run db:lint               # requires full local Supabase stack
npm run test:integration      # requires full local Supabase stack; real Auth and REST
npm run test:integration:config # status parsing and private email-sign-in config; no Docker needed
```

PGlite runs the actual PostgreSQL engine, SQL migration, grants, constraints, and RLS. Its `auth.users`, `auth.uid()`, and roles are a minimal test contract, **not** the full Supabase Auth service. Component/browser tests simulate authentication responses. The live integration script and Docker CI job cover the actual Auth/PostgREST layer when that infrastructure is available. The implementation environment had no Docker or connected Supabase project; those limits are recorded in `docs/PHASE_1_REPORT.md`. The Edge Function passed `npx --yes deno check supabase/functions/account-status/index.ts`; a deployed invocation still needs your Supabase project.

Security checks inspect frontend boundaries, reject a deliberately mislabeled privileged key at build time, build with a synthetic server-secret canary, and scan the resulting artifacts to ensure it is absent. Only test canaries are used; no real privileged key was provided. This is targeted automated coverage, not an external penetration test.

GitHub Actions runs lint/build/tests/security/audit/browser checks and a separate Docker Supabase migration/lint/live-integration job. It also type-checks the Edge Function with Deno. No GitHub repository was supplied or connected for this project, so this workflow has not run remotely.

## Vercel deployment

Connect your eventual GitHub repository to Vercel, choose Vite, and use `npm run build` with output `dist`. Set **only** the two public environment variables for the frontend. `vercel.json` supplies SPA route fallback, CSP and other security headers. Hosted Supabase uses `*.supabase.co`; update CSP deliberately if using a custom Supabase domain. Configure the exact production Auth URL/redirect and server `APP_ORIGIN` before inviting your production account. Verify an invite, sign-in, refresh, recovery, sign-out, unauthenticated API denial, and isolation using two accounts before relying on production.

Nothing was pushed, committed, migrated to a hosted database, or deployed during this implementation. For a new project, choose a GitHub repository and review the changes before the first push. Never commit `.env.local` or server credentials. The two original PDFs are unchanged.

## References

Requirements come from the two PDFs in this folder: Implementation Plan Phase 1 (pages 1–2), and Specification sections 2, 3, 8, 9, 11.6, and 13. Implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Vite environment variables](https://vite.dev/guide/env-and-mode).

# AO3 Library & Reading Tracker

Phases 1 and 2 of the supplied **AO3 Implementation Plan** and **AO3 Project Specification**, presented as **between chapters**. React, TypeScript, Vite, Tailwind CSS, and Supabase PostgreSQL. Hosting is prepared for Vercel, as specified in the PDF.

Phase 2 implements a private, manually managed library: story creation and editing, reading progress and statuses, favorites, notes, personal ratings, default shelves, multiple custom collections, and personal tags. All changes persist in Supabase. Phase 3 adds persistent bulk imports and a separately run metadata worker; see the Phase 3 section below for setup. See [the Phase 2 report](docs/PHASE_2_REPORT.md) for verification, decisions, and changed files.

The additive Phase 2 migration was applied to the local development Supabase stack. No hosted database was changed or deployed during this phase.

## Code organization

Keep components, behavior, styles, and unit tests beside the feature that owns them:

- `src/app/`: app shell, routes, and authentication boundary.
- `src/features/settings/`: Settings page layout, section navigation, account settings, and browser-bar pairing. The page composes feature-owned section definitions; each title, description, stable ID, and optional link aliases live together in that feature's `settings-sections.ts` and supply both navigation and section headings.
- `src/features/imports/`, `src/features/library/`, and `src/features/backups/`: their feature logic and settings, including import, display, and export settings.
- `src/features/library/collections/`: collection editors, membership controls, shelf/spine rendering, appearance, automatic rules, drag behavior, and tests.
- `src/features/library/series/`: series models, repository, search, cards, pages, controls, and tests.
- `src/features/library/display/`: display preferences, editor context, live rendering helpers, previews, styles, and tests.
- `src/features/library/browsing/`: browsing preferences, page-size settings, pagination, position restoration, styles, and tests.
- `src/features/library/summaries/`: summary extraction, safe shared rendering, styles, and tests.
- `src/features/imports/ExtensionConnection.tsx`: the extension connection lifecycle, separate from `MetadataSettings.tsx` and its settings form.
- `companions/shared/`: the AO3 bar, page parsing, editor adapters, styles, and shared tests.
- `companions/safari/`: Userscripts entrypoint, build tests, and installation guide.
- `companions/chrome/`: Chrome/Edge entrypoints, messaging bridge, metadata capture, list sync, tests, and installation guide.

Build commands remain in `scripts/`. Installable output still goes to `userscript/dist/`, `extension/dist/`, and `extension/local/dist/`. Shared card, form, and layout primitives stay in `src/styles.css`. Feature-only styles live beside their components; browsing, display, and summary styles load through `src/main.tsx`. Browser integration tests stay in `tests/e2e/`. Extend these feature boundaries incrementally when changing related code.

## AO3 metadata capture and display

The browser bar rereads work metadata when saving a new work. If a later chapter omits the work summary, it retrieves the first work page on AO3 before saving. Chapter summaries and chapter text are excluded from the saved metadata. Existing entries can use **Collect metadata** to refresh the same fields while keeping personal edits.

Settings → Tile and Page Information offers **Category** (AO3 relationship category), bookmarks, comments, hits, language, publication date/status, work ID, and the AO3 link alongside the existing work metadata. These fields can be shown, hidden, grouped, and reordered in work tiles and information pages. Category is also available for series tiles and information pages. New fields start hidden to preserve saved layouts.

Apply `20261023000500_complete_ao3_metadata.sql` for language and companion statistics, deploy the updated app/worker, and reload the rebuilt Chrome companion (v0.6.2). Existing incomplete records need a metadata refresh or **Collect metadata**; this change does not queue unsolicited refreshes.

## Summary formatting and tile text

Desktop work tiles (above the 1100px mobile-layout breakpoint) use the same 15px minimum text size as work info summaries. Mobile tile and summary typography keeps its existing sizes. Imported summaries retain semantic formatting (including emphasis, bold, paragraphs, line breaks, lists, and links) in a separate `summary_html` metadata field; plain summaries remain available for search and manual editing. The shared renderer strips active content and unsafe attributes. Plain-text manual corrections take precedence over older formatted metadata.

Apply `20261023000400_formatted_work_summaries.sql` and deploy the updated metadata worker and website. Rebuild/reload the Chrome extension or Safari userscript for imports from those companions. Refresh metadata for previously saved works to recover formatting; formatting discarded by older imports cannot be reconstructed from their plain text. Local builds do not deploy or apply these changes automatically.

## Run locally

Run commands from `FanficTrackerLibrary/`. Requires Node **22.12+**, npm, Docker Desktop running, and the Supabase CLI. The `npm run db:*` scripts expect `supabase` on your PATH; the equivalent `npx supabase ...` commands below also work without a global CLI install.

### First-time setup and database upgrades

```sh
npm ci
npx supabase start
npx supabase migration up --local
npx supabase status
```

Run each command after the previous one succeeds. `supabase start` starts the Docker services in the background; leave Docker running. Apply migrations again after pulling database changes. Use migration upgrades for an existing database; resetting it is optional and destructive, as described below.

On a fresh checkout only, create the browser configuration:

```sh
cp .env.example .env.local
```

Keep an existing `.env.local` rather than copying over it. Set these values using the local URL and **publishable/anon** key shown by `npx supabase status`:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_LOCAL_PUBLISHABLE_OR_ANON_KEY
EXTENSION_APP_ORIGIN=http://127.0.0.1:5173
```

Without valid public configuration, the app shows a setup screen. Server secret/service-role keys belong only in server configuration, never in `VITE_` variables. Restart Vite after changing `.env.local`.

Open local Studio at `http://127.0.0.1:54323` to invite a development user. Invitation and recovery emails appear at `http://127.0.0.1:54324`. Follow the invitation to set a password; public registration is disabled. The [Supabase setup section](#set-up-supabase) covers Auth configuration and operator invitations.

### Start each local session

Start Docker Desktop, then ensure Supabase is running:

```sh
npx supabase start
```

Run the following long-running commands in **separate terminals**. Leave each required process running while using the app.

| Terminal | Command | When needed |
| --- | --- | --- |
| 1 | `npm run dev` | Normal authenticated website at `http://127.0.0.1:5173` |
| 2 | `npx supabase functions serve extension-metadata` | Browser-extension imports and metadata refreshes |
| 3 | `npm run worker` | Direct retrieval mode; requires `.env.worker` below |

Use the URL printed by Vite. For extension mode, it must match `EXTENSION_APP_ORIGIN` exactly, including the port and `127.0.0.1` versus `localhost`. The extension and app must target the same Supabase instance.

**Extension mode needs both the website and the Edge Function handler.** A successful “Extension connected” message confirms authentication but does not prove the handler is running. If it is stopped, metadata uploads fail and older requests can hold up the queue. A `503` with `name resolution failed` from `/functions/v1/extension-metadata` means the local function runtime is unavailable; start terminal 2 and reconnect in Settings.

### Build and connect the local browser extension

With `.env.local` pointing to local Supabase, build into the local directory so the hosted extension build is preserved:

```sh
npm run build:extension:local
```

In Chrome/Edge, open `chrome://extensions` or `edge://extensions`, enable Developer mode, and **Load unpacked → `extension/local/dist`**. After rebuilding, click **Reload** on that extension's card. If you have an older local extension without the fixed ID, remove that older local installation and load the new local build once. In the local app's **Settings → AO3 metadata retrieval**, select **Browser extension**, and click **Save metadata mode**. The local app automatically selects the fixed ID of **AO3 Library Companion (Local)** and ignores any hosted extension ID. Use **Reconnect extension** after a browser restart. Complete any AO3 sign-in or adult-content confirmation in the requested AO3 tab.

Import one work with **Add → Add Story**, which opens **Add Story → Import from link**, or use **Add → Import History from AO3** for batches. Importing a verified chapter link opens the existing fic when already saved and sets its reading location: chapter 10 means chapters 1–9 read. This also supports returning to an earlier chapter. Metadata-only refreshes preserve reading location; edits made while retrieval is pending take precedence. Existing queued requests keep their original retrieval mode. See [the extension guide](companions/chrome/README.md) for hosted builds and detailed behavior.

### Configure the direct metadata worker

For **Direct retrieval** in Settings, create the ignored `.env.worker` with these server-only values from local Supabase status:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=YOUR_LOCAL_SECRET_OR_SERVICE_ROLE_KEY
```

`npm run worker` loads this file automatically and polls continuously. To process at most one eligible job and exit:

```sh
npm run worker -- --once
```

The worker processes direct jobs; the extension and Edge Function handler process extension jobs. Run the service for the mode being tested. Neither service changes the mode of already queued requests.

### Test a production build locally

```sh
npm run build
npm run preview
```

Open the preview URL printed by Vite, normally `http://127.0.0.1:4173`. Preview serves the built frontend; Supabase and the selected metadata service must still be running. To test extension imports there, run `EXTENSION_LOCAL_APP_ORIGIN=http://127.0.0.1:4173 npm run build:extension:local`, reload the local extension, and reconnect in Settings. The local extension ID is selected automatically. Settings stored under port 5173 do not carry over to port 4173.

### Stop local services

Press **Ctrl+C** in the Vite, function-handler, preview, and worker terminals that you started. When finished with the local database:

```sh
npx supabase stop
```

The default stop keeps a database backup for the next start. Avoid `--no-backup` when keeping development data.

### Optional: reset disposable local data

Only when you deliberately want to erase and recreate the local database:

```sh
npx supabase db reset --local
```

This deletes local library entries and test accounts and reapplies migrations. Use `npx supabase migration up --local` for normal upgrades instead.

## Preview with sample stories

Both `npm run dev` and `npm run dev:sample` show a **Local preview** toolbar on localhost. Select **Mobile · 390px** to test the existing responsive layout in a narrow viewport, then **Desktop** to expand it again. Save edits before entering mobile preview for the first time, which reloads the app in an embedded viewport. Subsequent switches keep that viewport mounted. These controls are excluded from production builds.

```sh
npm run dev:sample
```

Open the URL printed by Vite. This development-only mode opens a populated library immediately, without Supabase configuration or sign-in. The bundled default contains 23 works, 4 series, and 13 collections, including saved reading progress, personal edits, collection membership, order, and appearance. The works include nine Finished, two Waiting for Updates, three Reading, one Re-reading, seven To Read, and one Paused Reading entry.

The default is stored in `src/features/library/sample/default-state.json`, which reuses the work and series metadata in `stories.json` and `series.json` beside it. Anyone who downloads a checkout containing these files gets the same default when they first run `npm run dev:sample` in a fresh browser. **Reset sample data** restores that same bundled default. No copy of the original browser's storage is needed.

Search, filters, story details, chapter progress, favorites, ratings, notes, and collections work in the preview. Each reader's later changes persist in their browser's local storage under `between-chapters:sample-library:v1`; existing saved libraries are preserved until reset. Preview mode makes no Supabase requests and is disabled in production builds. Explicit Library Sync requests can use the local extension’s AO3 tabs to add works to sample storage. Use `npm run dev` for the normal authenticated app. The sample mode flag comes from the committed `.env.sample`; do not set `VITE_SAMPLE_DATA=true` in `.env.local` if you want normal development mode.

The underlying AO3 metadata snapshots were captured October 15–21, 2026. The saved default library state was captured October 23, 2026. These are static snapshots; starting the app does not fetch AO3. AO3 publication status stays independent from the saved reading status. The sample progress and personal fields illustrate the preview.

Two works require AO3 sign-in: **On My Love** (8577016) and **Something’s Different About You Lately** (24973237). Their title, author, and fandom come from [a public reference for On My Love](https://fanfics.me/ftf213074) and [a public recommendation listing Something’s Different About You Lately](https://www.tumgik.com/tag/reset%20rewind%20rewrite). Their summary, tags, rating, dates, chapter counts, and publication status remain unknown. Their original chapter links are preserved, and you can fill in details in preview. No AO3 account credentials are used.

## Use the manual library

1. Sign in with your invited account. Choose **Library → Add Story**, or **Add → Add Story**. Add Story opens with link import selected; choose **Enter manually** to use the manual form.
2. Enter an AO3 work URL and title. Enter optional authors, fandoms, tags, summary, rating, and chapter counts by hand. Each entered author has an optional AO3 author-page URL field; saved links make their name clickable on work cards and story details. These links are private manual metadata and can also be edited with the story's metadata. Leave unknown counts blank.
3. Choose reading status, fully read chapter count, favorites, private notes, personal tags, and any custom collections, then **Save story**.
4. Open **See Full Details** and use the pencil beside Personal rating to edit its stars, then the checkmark to save, add or edit a private note, and use the pencil icons to edit personal tags or collections inline. Note, tag, and collection editors offer Save and Cancel. **All tags** and **Other metadata** start collapsed; use **Edit** with the pencil icon at the right of the story title to edit metadata. The story title links to its saved AO3 URL. Click **Chapter # of #** to edit progress in an anchored menu, then save or cancel. Escape, outside clicks, and outside focus dismiss unsaved edits. **Mark as Caught Up** uses the saved published count and sets complete works to Finished or ongoing works to Waiting for Updates; unknown publication status preserves the current reading status. A dismissible two-minute Undo notice restores both progress and status.
5. Create collections with **New Collection** in the page header, the **New collection** spine, or the plus beside collection choices. The popup lets you enter a name, choose a preset or custom color, and select a symbol, with a live spine preview. These choices persist with the collection. Apply the collection appearance migration (`20261016000900_collection_appearance.sql`) to any hosted database before deploying this version. Choose a collection to rename or delete it. Deleting a collection keeps its stories. Removing a story requires confirmation and deletes that account’s private entry and memberships. The two-minute Undo notice restores its original entry ID, timestamps, metadata overrides, notes, rating, favorite, progress, and surviving collection/tag memberships.
6. DNF entries remain in the searchable Library and the **Did Not Finish** shelf. Change reading status to recover them. Re-reading preserves metadata and progress until you change progress explicitly.

No AO3 request is required to save. Chapter IDs do not identify chapter positions. An unverified chapter link preserves its full original URL and leaves inferred progress at zero. Enter progress manually. Only trusted, verified chapter mappings can produce a next-chapter destination; The Phase 3 background worker verifies mappings only when public AO3 metadata provides explicit positions. Unknown totals display as `?`.

For local database upgrades and checks, follow [Run locally](#run-locally) and [Verify](#verify).

Hosted projects require reviewing and applying the migrations through the normal `supabase db push --dry-run` / `supabase db push` workflow. Never run `db:reset` against an established database to upgrade it.

Account settings and Log out are available in the profile-icon menu, which shows the account’s saved display name or an email-based fallback. Settings no longer occupies a main navigation tab. In Add/Edit Story, select a personal rating with one of five stars; choosing the third fills three stars and saves the numeric rating 3/5. Clear rating removes it. Favorites sit beside the rating, and Save/Cancel are equal-size actions on one row.

Work-card author lines use smaller “By …” text. Story details use a larger “By …” line, and their return link uses an arrow icon with an underline on hover.

Work cards show maroon publication status, favorite and action-menu controls at the top, then the summary, full-details link, read/caught-up actions, and clickable chapter progress. The read button has square corners and fills the available row width; Mark as Caught Up shows button styling on hover or keyboard focus. Reading status and metadata dates remain available in full details. Details pages return to the originating Currently Reading tile or Library shelf, including after a refresh or edit. Canonical, original provided, and updated provided URLs are clickable metadata rows; verified chapter links are visibly underlined. **Mark as Finished** marks a fic Finished and all known published chapters read. If only the total is known it uses that count; if both counts are unknown it preserves progress. Notes stay unchanged. The action offers the same two-minute Undo notice. Unverified chapter destinations use a Read on AO3 button pointing to the saved link.

## Shared UI templates

Add `menu-surface` to a popup menu container to give its enabled buttons, links, and checkbox rows a shared hover and keyboard-focus background. Customize `--menu-hover-background` and `--menu-hover-color` on the container when needed. Story, Add, profile, filter, fandom, and suggestion menus all use it.

`src/components/UndoNotice.tsx` provides a reusable Undo banner. Pass an `id`, `message`, async `onUndo`, and stable `onDismiss(id)` callback. Optional `durationMs` (default 120,000), `undoLabel`, and `dismissLabel` adapt it to other actions. It handles expiry, dismissal, pending state, and retryable errors. LibraryProvider owns reading snapshots so Undo survives route and shelf changes.

## Library and Currently Reading search and filters

Library and Currently Reading share the same filters, suggestions, sorting, grouping, and browser-saved display preferences. Library filters apply within the selected shelf or collection and include every reading status.

Currently Reading has a sort/group/search/fandom toolbar and an expandable Filters panel. Fandom selection supports multiple fandoms, searchable names, per-fandom fic counts, and removable chips. The expanded Work Status filter selects AO3 publication status. Expanded filters include AO3 rating, favorites, relationship tags, AO3 tags, and an inclusive AO3 last-updated date range in UTC. Dates and chapter counts use saved metadata; unknown values are not invented. The toolbar is a separate tile; sort, title/author search, and fandom selection appear once. Dashboard selects use custom menus with keyboard navigation and remain open while selecting options. Menus close on outside clicks, outside focus, or Escape. The toolbar orders Sort (with a sort icon), Group (with a grouping icon), Search title or author, and Fandom. Sort and grouping selections persist in browser storage across navigation and refreshes; Clear all filters preserves these display preferences. Filter names appear in uppercase beside their controls; the title/author search keeps its accessible label and uses only its placeholder visually. The desktop toolbar fits on one row. Search inputs and dropdown triggers share a compact 36px height and 14px font, including Characters and Tags. Clear/Hide filter actions have extra space above them. Fandom choices stay open while selecting multiple values and close when clicking away.

Library collection sorting sits to the right of Edit Collections. Sort switches between manual order, alphabetical, creation date (oldest or newest first), last story update, and last edited (a story added to the collection) without changing saved manual positions. The selected sort persists in browser storage; entering Edit Collections returns to manual order so dragging changes that saved arrangement. Newly created collections immediately follow the active sort. Manual order appends new collections in creation order and preserves any saved rearrangements. Collection addition activity is tracked independently of notes, progress, and renames; existing story memberships retain their original addition timestamps on edits. Collection summaries are edited individually and shown below the selected collection title. Shift-click or Shift-drag custom books to select a range for bulk color/symbol edits or deletion; dragging a selected book moves the selected collections together in their existing order, and Alt plus an arrow moves the group with the keyboard; Edit Collections also offers tap-based selection. Bulk editing preserves names and summaries. Empty collections delete directly; confirmation appears when any selected collection contains a story, and deleting collections preserves the stories themselves.

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

Follow [Run locally](#run-locally) for the complete startup, environment, extension, worker, preview, and shutdown commands. Use [Verify](#verify) for automated checks. Local Studio is at port 54323; the email inbox is at port 54324.

If startup reports a failed health check, the database may still be running while Auth and the API are unavailable; a successful migration or lint alone does not confirm the full stack is ready.

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

Supabase supplies its server URL and anon key. The function is optional for rendering the Phase 1 shell; future privileged operations must remain in trusted server code and must validate authorization for each operation. The Phase 3 importer runs in a separate trusted worker; email handlers remain future work. Phase 2 library writes use a narrow authenticated PostgreSQL RPC; the account-status function remains optional.

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
- `metadata_overrides` lives on the private entry; automatic metadata and field provenance live on the work. Metadata refreshes leave private overrides untouched. The Phase 3 worker and field-level editing controls now enforce this original storage boundary.
- All timestamps use `timestamptz`; PostgreSQL stores instants in UTC. Future UI timestamps should use the reader's local timezone.
- `collection_works.library_entry_id` intentionally references an owned library entry rather than a bare global work.
- No later-phase import/job, series, notification, or history tables are created.

## Project layout

```text
src/
  app/                 protected routes and responsive shell
  components/          shared presentation components
  features/
    auth/              session provider, sign-in and password recovery
    settings/          Settings layout, navigation, account and pairing controls
    imports/           AO3 imports, sync, metadata retrieval and their settings
    backups/           backup/restore and CSV export, settings, styles and tests
    library/           shared library models, data access and work/reading UI
      collections/     collection controls, shelves, appearance, rules and tests
      series/          series data, search, pages, controls and tests
      browsing/        page size, pagination, restoration and settings
      display/         display preferences, editors, previews and settings
      summaries/       summary parsing, rendering, styles and tests
      sample/          local sample data and repository
  lib/                 public configuration and typed Supabase client
  types/database.ts    generated migration-derived types
  test/                frontend and server-boundary test setup
companions/
  shared/              AO3 bar, parsing, personal controls, styles and tests
  chrome/              extension entrypoints, capture, sync, messaging and tests
  safari/              userscript entrypoint, build tests and install guide
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

Run these from the project directory. `npm run check` runs lint, TypeScript/build, all Vitest tests, integration-configuration tests, and security checks. Browser tests, live Supabase integration, database lint, and dependency audit are separate checks.

```sh
npm run check
npx playwright install chromium  # first time, or after Playwright browser upgrades
npm run test:e2e
npx supabase db lint --local --level warning
npm run test:integration
npm audit --audit-level=moderate
```

Database lint and live integration require the local Docker stack from [Run locally](#run-locally). The integration runner creates temporary users/data and cleans them up; it refuses non-loopback endpoints. Browser tests start their own Vite server on port **4173** with mocked Auth/REST; stop any preview or other server using that port first. The normal development server on 5173 can stay running.

For focused checks and debugging:

| Command | What it checks |
| --- | --- |
| `npm run lint` | ESLint |
| `npx tsc -b` | TypeScript |
| `npm run build` | TypeScript and production frontend build |
| `npm test` | All Vitest tests, including embedded SQL and extension tests |
| `npm run test:unit` | Frontend and server tests |
| `npm run test:db` | Embedded PostgreSQL migrations, grants and RLS; no Docker required |
| `npm run test:integration:config` | Local status parsing and Auth configuration; no Docker required |
| `npm run check:security` | Frontend/server boundaries and build artifact checks |
| `npx vitest run src/features/imports/MetadataSettings.test.tsx` | Example: one test file |
| `npm run test:e2e -- --project=desktop --workers=1` | Desktop browser tests with one worker |

After schema changes, regenerate database types with one of the existing commands:

```sh
npm run db:types           # running local Supabase; requires the CLI on PATH
npm run db:types:embedded  # embedded migrated database; no Docker required
```

PGlite runs the actual PostgreSQL engine, SQL migration, grants, constraints, and RLS. Its `auth.users`, `auth.uid()`, and roles are a minimal test contract, **not** the full Supabase Auth service. Component/browser tests simulate authentication responses. The live integration script and Docker CI job cover the actual Auth/PostgREST layer when that infrastructure is available. The implementation environment had no Docker or connected Supabase project; those limits are recorded in `docs/PHASE_1_REPORT.md`. The Edge Function passed `npx --yes deno check supabase/functions/account-status/index.ts`; a deployed invocation still needs your Supabase project.

Security checks inspect frontend boundaries, reject a deliberately mislabeled privileged key at build time, build with a synthetic server-secret canary, and scan the resulting artifacts to ensure it is absent. Only test canaries are used; no real privileged key was provided. This is targeted automated coverage, not an external penetration test.

GitHub Actions runs lint/build/tests/security/audit/browser checks and a separate Docker Supabase migration/lint/live-integration job. It also type-checks the Edge Function with Deno. No GitHub repository was supplied or connected for this project, so this workflow has not run remotely.

## Vercel deployment

Connect your eventual GitHub repository to Vercel, choose Vite, and use `npm run build` with output `dist`. Set **only** the two public environment variables for the frontend. `vercel.json` supplies SPA route fallback, CSP and other security headers. Hosted Supabase uses `*.supabase.co`; update CSP deliberately if using a custom Supabase domain. Configure the exact production Auth URL/redirect and server `APP_ORIGIN` before inviting your production account. Verify an invite, sign-in, refresh, recovery, sign-out, unauthenticated API denial, and isolation using two accounts before relying on production.

Nothing was pushed, committed, migrated to a hosted database, or deployed during this implementation. For a new project, choose a GitHub repository and review the changes before the first push. Never commit `.env.local` or server credentials. The two original PDFs are unchanged.

## References

Requirements come from the two PDFs in this folder: Implementation Plan Phase 1 (pages 1–2), and Specification sections 2, 3, 8, 9, 11.6, and 13. Implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Vite environment variables](https://vite.dev/guide/env-and-mode).

## Phase 3: persistent AO3 imports

Open **Add → Import History from AO3** or `/imports` to submit batches of up to 2,000 URL tokens. Valid identities save immediately, independently of metadata retrieval. Run `npm run worker` in a separate terminal with ignored `.env.worker` server configuration to process persistent jobs locally; closing the import page does not stop that process. Hosted processing requires the supplied Supabase Edge Function and optional Cron/Vault setup.

See [the Phase 3 report](docs/PHASE_3_REPORT.md) for schema changes, retry/cancellation behavior, manual override protection, complete setup instructions, validation results and deployment limitations.

## AO3 bookmark and Marked for Later CSV imports

On `/imports`, choose **AO3 CSV files** to review one or more scraper exports (including combined exports with `source_list`, or older separate files). Up to 2,000 unique works and 20 MB can be reviewed per import. Series bookmarks use the same work picker as mass imports: load each series, explicitly select its installments or skip it, then continue to conflict review. No series works are preselected. Bookmark notes, including saved summaries, become personal notes; bookmark tags become personal tags. Work summaries remain separate.

Bookmarks later than the CSV work update date become Finished, with the historical bookmark date as Finished Date. Earlier or same-day bookmarks become Reading. The existing metadata worker or browser extension checks chapter release dates and marks only the verified chapter prefix posted strictly before the bookmark day as read. Missing dates never create guessed progress; retrieval failures appear in import history for retry. Existing Marked for Later entries are skipped; new ones are To Read. Review each bookmark conflict or use **Overwrite all works** / **Keep all works**. Overwriting replaces imported fields while retaining ratings, favorites, and collection memberships. Concurrent edits invalidate an overwrite review, and later personal edits take priority over queued progress inference.

Apply migrations through `20261022000300_ao3_csv_import.sql`, deploy the updated app and `extension-metadata` Edge Function, and restart the metadata worker. Extension users must rebuild and reload the extension for chapter-index snapshots. CSV imports remain available alongside browser-tab library sync described below.

## Browser-tab library sync

On `/imports`, **AO3 Library Sync** scans a complete unfiltered Bookmarks or Marked for Later list using AO3 Library Companion. Run each list separately. Start with **Full library scan**, then **Import scanned works**; later **Quick Sync** runs stop at previously imported record IDs. Existing personal edits are kept. Non-empty AO3 metadata on every observed work refreshes automatically, including previously saved works; empty values preserve saved fields, while zero counts and false completion flags remain valid. Explicit manual metadata corrections retain precedence. Quick Sync refreshes known rows on the overlap page, but cannot refresh works on pages it does not visit or detect removals/additions behind that boundary. Bookmark conflicts concern notes, personal tags, status, progress, or finished date—not title, summary, or AO3 statistics. Scans report these differences and keep personal data; CSV review offers Keep/Overwrite choices independently of the automatic work metadata refresh. The latest received non-empty observation wins; CSV files do not provide reliable capture timestamps to order historical snapshots.

The extension ports the Python scraper’s listing selectors and reuses the CSV metadata conversion and database validation. It saves page checkpoints separately from work-import jobs, uses one scan tab with a configurable request interval (15 seconds by default, minimum 5 seconds), and pauses on login, restriction, or unexpected pages for manual resume. Imports use saved listing metadata without opening individual work pages. Deleted-work bookmarks are retained; external and series bookmarks are skipped; historical chapter progress unavailable on listing pages remains unconfirmed.

Apply migrations through `20261022000600_deleted_bookmarks.sql`, deploy the updated website, rebuild/reload the extension, and reconnect in Settings. No new Edge Function or Python installation is needed. See [the library sync guide](companions/chrome/README.md#bookmarks-and-marked-for-later-sync) for limits, checkpoint privacy, recovery, and installation.

Use **Time Between Page Requests** to select 5–3,600 seconds. Apply request interval updates the next request of an existing scan, and the setting survives resume. Login and request restrictions pause scanning and show an app-wide dialog with **Open AO3 scan tab**, which focuses the existing AO3 tab without retrying it. Resolve the issue before choosing Resume scan.

`work_status` (`unknown`, `available`, or `deleted`) is private to each library entry and separate from the source bookmark’s public/private/recommendation status. Bookmark IDs are saved in `source_bookmark` along with the available URL, date, and bookmark status. Explicit deleted messages are recognized using [AO3’s bookmark template](https://github.com/otwcode/otwarchive/blob/master/app/views/bookmarks/_bookmark_blurb.html.erb). Existing metadata and personal data survive deletion. New bookmark-only entries use nullable work IDs and display “Deleted Work — Bookmark #ID” without inventing title, author, or fandom source metadata. They do not create work-page jobs. CSV rows with `work_status=deleted`, a bookmark ID and bookmark URL are supported; CSV overwrite for deleted entries changes notes/tags only, preserving reading history and work metadata.

Full scans expose **Update Deleted Work Status** (enabled by default). Disabling it leaves existing deletion status unchanged. Quick Sync imports newly encountered deleted bookmarks but does not mark existing works deleted. Missing listings never change deletion status in either mode. An already saved work can be matched after deletion only when its bookmark ID was previously recorded, or AO3 still provides its work ID; older imports without that identity cannot be safely matched by title or notes. Run a full scan while works still exist to establish these links. Existing pasted-URL imports retain their behavior. Sample mode uses the same identity and status rules in browser storage.

Library Sync offers optional **Start page** and **End page** fields in the full app and local app. Both endpoints are included; blank Start means page 1 and blank End means the list’s end, subject to the existing 500-page safety boundary. For pages 2–10 enter 2 and 10; for all pages before page 7 leave Start blank and enter End 6; for all pages after page 7 enter Start 8 and leave End blank. Selected ranges can be imported but never establish or advance the Quick Sync baseline. Quick Sync disables range fields and always starts at page 1. Request pacing, checkpoints and pause/resume still apply.

Sample mode also supports **Library Sync** through the local extension. Build/load `extension/local/dist`, run `npm run dev:sample`, and open the importer. Connecting is automatic when opening the form or starting a scan; no Supabase login or worker is needed. Scanned works save to the browser’s sample library using existing sample-story validation, keeping saved edits and ignoring duplicates. Sample scan checkpoints and baseline IDs are separate from signed-in library scans, and the extension does not claim database work while connected in sample mode. The same **Import Work or Series Links** form is also available in sample mode: paste work/chapter and series URLs, use the existing series work picker, and import selected works through the local extension. Sample work imports keep existing works, verify chapter progress from captured navigation, and wait 15 seconds between new work captures. Keep the app page open; retry interrupted imports with the same links to continue safely. CSV imports and account import history still use the connected app. After resetting sample data, run a full scan to reimport works that a prior Quick Sync baseline already knows.

## Browser extension mode

Chrome/Edge can retrieve metadata for your hosted library through app-requested AO3 tabs. Choose the mode in Settings; the existing direct worker remains available. The extension processes explicit work imports, metadata refreshes, series previews, and library listing scans, keeps browser results private, and preserves manual corrections. Explicit chapter-link imports update reading location; metadata-only refreshes preserve it. Build with `npm run build:extension` and follow [extension setup and deployment](companions/chrome/README.md).

## Series import previews

Paste AO3 `/series/…` links into Add Story or the bulk importer. Add Story keeps its review and results on the same page. Choose individual works, use Select all/Clear selection, or skip a series. No works are imported before confirmation. Previews stay in memory; **Load** explicitly saves a private metadata snapshot, including unsaved works, without adding those works to the library. Already-saved works are marked, overlapping selections are deduplicated, and directly pasted chapter links retain their progress-verification behavior. Summaries/tags help distinguish stories from extras without automatically excluding art or short works.

Library has an automatic **Series** collection using the same two-column cards as works (one column on small screens). Fandoms display as plain text. Fic summaries start expanded, with individual toggles and one compact Expand All/Collapse All button. The book icon after each fic title opens its saved work, including while the summary is collapsed. Disclosure arrows and summaries align with the card’s details link. The shared filters search series details and all contained works, including unsaved works in explicitly saved snapshots. AO3 series completion is saved separately as Complete, Incomplete, or unknown; it is never inferred from the completion of individual fics. Opening a series builds a basic page from library works and their memberships, without fetching AO3. Basic word totals cover only saved works; official series totals and completion remain unknown until downloaded. Review its works temporarily, or choose **Load** to save full details with a last-fetched timestamp. **Remove** returns to the basic page while preserving library works and personal data. Existing snapshots remain saved until removed. Private notes use the same editor and conflict protection as work notes; notes, favorites, collections, and finish actions require only a minimal series identity. Metadata refreshes preserve personal notes, series favorites, reading status, and collections. Favorite a series or choose its custom collections independently from its fics. Work and series info pages list custom collections in the progress panel. Empty lists show Add to Collection; populated lists show a pencil that opens the shared Edit Collections dialog, including conflict review. Work controls align beside the rating stars. Both detail-page headers show the AO3 Date Updated as a calendar date without a time. Series reading status is derived from works saved in your library: any active reading makes it Currently Reading, all To Read makes it To Read, and all Finished makes it Finished. A mixture of Finished and To Read is Currently Reading; unsaved preview works do not affect reading status. A series explicitly marked Finished keeps that status when no works are saved; adding a work recalculates the status from saved works. These derived states drive the library reading-status shelves and search independently from AO3 completion. Series also appear in Favorites and their chosen custom collections. Marking a series Finished is an explicit bulk action: only works already in your library are marked Finished, missing works are never added, and existing notes, ratings, favorites, and collection memberships stay intact. Hidden/unavailable works cannot be discovered from the listing. The **In a series** filter is available in Library and Currently Reading, including manually entered series names. Named series without an AO3 identifier remain filterable but cannot link to a series page.

When a new work import batch finishes metadata retrieval, Add Story's saved-work page and Mass Import open a **Related Series** dialog. Shared series are deduplicated within the batch; old history does not automatically open the dialog. Selecting a series opens the shared picker, where users can review temporarily or save full series details independently of importing works; only explicitly selected unsaved works are imported, preserving existing reading locations. Future installments are not automatically imported.

For deployment, apply migrations through `20261020000400_optional_series_details.sql` (including `20261019000400_series_organization.sql`, `20261019000300_library_series.sql` and `20261019000201_safe_library_edits.sql`) and deploy the updated `series-preview` Edge Function and app. Rebuild/reload the browser extension for series snapshot support. Hosted previews share the worker's request pacing and global pauses; retry a busy preview shortly. Extension previews allow two minutes for AO3 sign-in/confirmation and leave the AO3 tab available for retry. Listings that require pagination are reported as unavailable rather than silently presenting a partial list. AO3 may hide restricted or unavailable works. AO3 bookmarks, notes and reading status are not copied.


Abandoned fics use a private publication status, independent of reading status. Choose **Abandoned** under **Edit → AO3 publication status**. They can be To Read, Reading, Waiting for Updates, Re-reading, Finished, or Did Not Finish. Reading all known published chapters moves them to Finished, even when the planned total is higher. Apply migration `20261018000300_abandoned_fics.sql` to hosted Supabase for this behavior. Library and Currently Reading publication filters support multiple selections, including Abandoned. Empty selections show all publication statuses; choose the other statuses to omit abandoned fics.

Under **Library → Edit Collections**, click an automatic collection to hide it after confirmation. Custom collection editors also offer a Hide icon. **View Hidden** reveals hidden collections faded in their saved shelf order; open one and choose **Unhide** to restore it. Hiding preserves every story and saves visibility in this browser alongside collection sorting preferences.

**One Shots** is a starter custom automatic collection with **One Shots → Only**, color `#8b491e`, and the scroll symbol. Apply `20261021000600_starter_one_shots_collection.sql` to add it once to existing accounts and create it when new accounts are added. It remains fully editable and deletable; library reads never restore it. Existing same-named collections are preserved. The local sample preview includes it too.

One-shots are detected from complete one-chapter works or exact AO3/personal tags “One-shot”, “One shot”, or “Oneshot” (case-insensitive). A diamond badge identifies them on cards and details. Use the One-shot checkbox when manually adding or editing AO3 metadata to correct the classification, including works with extra art or author-note chapters. Manual corrections survive metadata refresh; remove the `one_shot` override under Automatic metadata to return to automatic detection. Both Library and Reading filters offer One-shot → Allowed (default), Only, or Exclude. Apply `20261019000200_one_shot_override.sql` for validation and resetting one-shot overrides.

Sort menus include reverse choices for fic and collection ordering, including **Alphabetical (Z–A)**. **Random** shuffles fic and series results and retains its seed while paging or reloading. Select another sort and then Random again for a fresh shuffle. Choices persist in the existing browser preferences. Reverse collection sorting changes only the display order; saved manual positions stay intact.

## Large libraries

Library and Reading now query numbered server pages of 50 works by default. Choose 25, 50, 100 or 250 in Settings or the results toolbar. URLs preserve the selected collection, filters, grouping, sorting, page and effective size. Large pages reuse the cards with variable-height virtualization. Edits refresh affected works, and completed import batches stop polling.

Apply migrations through `20261020000200_import_history_and_fairness.sql` before deploying this frontend. See [performance checks and rollout notes](docs/PERFORMANCE.md) for repeatable 10,000-work fixtures, measured targets, database plans, queue capacity and hosted-validation requirements.

## Export and restore backups

Settings → Export CSV lets readers select `works.csv`, `series.csv`, `collections.csv`, and `collection_memberships.csv`, or Export all, for one ZIP download. The export includes every saved item across all pages, private notes, ratings, tags, metadata, and collection appearance and ordering. Automatic collections retain their rules and current membership; works and series include collection names. Lists and structured values use JSON inside CSV cells. Text that could be evaluated as a spreadsheet formula is prefixed with an apostrophe. This spreadsheet export reuses the existing library API and needs no additional migration or Edge Function.

Settings → Export Backup downloads all of the signed-in account's application data and this browser's preferences, or saves a private compressed copy in Supabase. Saved backups can be downloaded or deleted from the same settings section. Restore Backup previews local JSON/JSON.gz files or saved copies, requires explicit replacement confirmation, and automatically saves a safety copy before restoring the signed-in account. Restores preserve other accounts and shared AO3 metadata, and reject library changes made since preview. Supabase keeps the three most recent successful copies per account, with one save attempt per minute and a 50 MiB per-file limit; local downloads are unrestricted. Apply migrations through `20261021001000_account_backup_restore.sql` and serve/deploy the existing `save-backup` Edge Function first. An administrator can still restore empty tables or replace an account's data with `npm run backup:restore`; run `npm run perf:backup` for the 10,000-work administrator round-trip check. See [backup contents, restore commands, and backend storage notes](docs/BACKUPS.md).
## DNF cleanup

Settings → DNF Cleanup can automatically remove DNF fic details while preserving compact reading records. It defaults to off with a **7-day** retention period. Choose **24 hours / 7 / 30 / 60 days** or a custom duration in hours or days. Preview cleanup, protect personal details, and browse archived activity from Settings. Apply the new migration and install the hourly schedule described in [DNF cleanup setup](docs/DNF_CLEANUP.md) before expecting background cleanup.

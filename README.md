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

## Use the manual library

1. Sign in with your invited account. Choose **Library → Add Story**, or **Add → Save for Later / Starting a Fic**.
2. Enter an AO3 work URL and title. Enter optional authors, fandoms, tags, summary, rating, and chapter counts by hand. Leave unknown counts blank.
3. Choose reading status, fully read chapter count, favorites, private notes, personal tags, and any custom collections, then **Save story**.
4. Open **See Full Details** to edit metadata and organization. Use **Edit chapter progress** to save or cancel progress changes. **Mark as Caught Up** uses the saved published count and preserves reading status.
5. Create collections with **New Shelf**. Choose a collection to rename or delete it. Deleting a collection keeps its stories. Removing a story requires confirmation and deletes that account’s private entry and memberships.
6. DNF entries remain in the searchable Library and the **Did Not Finish** shelf. Change reading status to recover them. Re-reading preserves metadata and progress until you change progress explicitly.

No AO3 request is required to save. Chapter IDs do not identify chapter positions. An unverified chapter link preserves its full original URL and leaves inferred progress at zero. Enter progress manually. Only trusted, verified chapter mappings can produce a next-chapter destination; Phase 2 does not fetch or verify mappings. Unknown totals display as `?`.

For an existing local Phase 1 database, apply the additive migration without resetting data:

```sh
npx supabase migration up --local
npm run db:lint
npm run test:integration
```

Hosted projects require reviewing and applying the migrations through the normal `supabase db push --dry-run` / `supabase db push` workflow. Never run `db:reset` against an established database to upgrade it.

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

`library_entries` creation is restricted to `save_library_story`, a narrowly scoped SECURITY DEFINER function with an empty search path. It validates an AO3 work URL, derives ownership from `auth.uid()`, creates or reuses the work identity, and saves private overrides and memberships in one transaction. It accepts no caller-supplied owner or work UUID. Existing owners may update a limited set of personal columns or delete their own entry. Work identity and original submission remain immutable on edits. Shared AO3 metadata has no browser write grants.

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

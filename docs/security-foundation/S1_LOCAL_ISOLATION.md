# S1 — Local Isolation And Staging Preparation

**Status:** Local implementation prepared; full local service and hosted staging verification remain blocked. S1 isolation is not fully verified and S2 is not started. **Branch:** `infra/01-local-staging-isolation`. **Base:** refreshed reviewed `main` / `origin/main` at `4d225ab9f064495bf195be7b8408805e16fc4a2a`. **Date:** 13 November 2026.

The user conditionally approved S0 as an audit deliverable and explicitly authorized S1 preparation/local implementation. The approved S0 report and two doc edits were still uncommitted; they were preserved on this new branch without stashing, discarding, committing or merging. No push, hosted resource creation/configuration, production migration, deployment, credential rotation or production data copy occurred. No S2 role/RLS work was added.

## Implemented Scope And Reuse

The first change removed `deploy-database` and its production secret bindings from ordinary push/PR CI. CI still runs quality, synthetic browser/performance/reader/Calibre checks and its local Supabase validation. It contains no replacement production execution path. This is a **repository edit**, not evidence that the remote workflow, an existing run, GitHub protections or Vercel/Supabase integrations have changed. S0's hosted findings remain historical evidence until an explicitly approved infrastructure review/release.

Configuration extends the existing public-key parser, Vite validation, local-host helper and runtime clients. Connected builds require explicit environment/ref, backend/public key and both sibling app origins. Staging cannot select the known production ref or public production aliases; Vercel Preview requires staging and Production requires production. Local development servers reject production configuration. Production runtime clients require an explicitly configured app origin. The hardcoded reader backend/key and sibling-origin fallbacks were removed; there is no silently selected P backend. The existing organizer setup screen remains closed when configuration is invalid; reader builds fail before publication. Sample mode remains development-only and makes no account requests.

Chrome/Edge builds reuse the existing environment manager/bridge but include exactly one profile, with matching app/backend identity. A local artifact does not contain the hosted public key or backend host permission. Safari retains its hosted-HTTPS-only capability and now requires complete explicit staging/production configuration. Stored reader organizer connections must match the configured backend/public key before sending their paired credential. Production installations and sessions are not touched by local build changes.

Production worker/recovery deployment risk: the guarded operator entrypoints are intentionally local-only during S1. They must not replace a running production enrichment worker or an approved production recovery tool merely because this branch is later merged. Preserve the existing deployed artifacts; a reviewed, target-verified hosted runner and explicit release/recovery authorization are prerequisites to changing those operational processes. The underlying AO3 worker, backup engine and Edge handlers are preserved.

The shared local target guard reuses CLI status parsing. It verifies the fixed synthetic project configuration, pins CLI working directory, accepts only loopback API port 54321, and compares any supplied service credential to the actual running local stack before creating a client. CLI children receive no `SUPABASE_*` environment variables, including management tokens, DB URLs/passwords and binary overrides. Fixed command maps reject extra flags, `--linked`, `--db-url`, `--project-ref` and unsupported hosted commands. Local Edge env files are parsed with Node's existing `parseEnv` facility and allow only two validated loopback app origins; exported and duplicate production/backend/secret overrides fail closed. Hosted mutation tooling is intentionally unavailable during S1, with no production override flag.

Operator restore, pruning, invitation and fandom-enrichment scripts use this guard; implicit `.env.worker` loading is removed. Local invitations require synthetic `example.test` addresses. Full-service integration rejects external backup-file inputs and uses its generated snapshots. This does not remove the account's export/restore feature or restore engine: it constrains operator entrypoints to authorized nonproduction use while future hosted release tooling remains separately gated.

The local Supabase ID is now `beyond-the-archives-local-synthetic`. Existing old volumes and ignored production CLI link remain untouched; local commands never use the link. Every one of the **129 existing migrations is preserved unchanged**, including completed Universal Stories. No dependency, role, policy, grant, bucket schema or database migration was added. The existing service-role authority and proposed application Owner remain separate.

New local tooling provides public-only configuration of both apps, generated synthetic User A/User B accounts, AO3/universal library fixtures, reader access/associations and a scoped recovery drill. The drill reuses existing save/export/preview/safety-copy restore RPCs and ZIP utility; it creates its own EPUB/annotations, tests denied cross-account access and cleans up its own accounts. It accepts no external file or account identity. It is not a production backup import or a complete Auth/config disaster-recovery exercise.

## Configuration And Operational Handoff

[Local And Staging Isolation](LOCAL_AND_STAGING.md) is the authoritative setup/runbook: guarded commands, all three templates, companion builds, synthetic recovery scope, staged Auth/Storage/Edge/jobs/preview wiring, hosted approval checklist and remaining gaps. README and reader/companion guides now link to it instead of recommending a shared local/production companion or silent reader defaults. Operations documentation removes the obsolete fully automatic migration instructions. Signup examples remain synthetic as in approved S0.

The ignored existing local app profiles gained only explicit local identity/origin fields, preserving their public keys and other values. Their credential configuration has not been refreshed from a new running stack because Docker is unavailable; `db:configure` is the supported next step. No hosted profile or server credential file was modified or copied. The new configurator refuses to overwrite another backend's profile, parses duplicate/exported env assignments and writes only public values. No secret was printed or committed.

## S1 Checklist And Evidence Boundary

| Requirement | Result At This Review |
|---|---|
| S0 reviewed / current base / preserve work | Conditionally approved; refreshed base verified and approved uncommitted S0 docs carried forward. |
| Remove main-push production migrations | Done in working-tree CI only; remote effect awaits an explicitly approved push and hosted release-path review. |
| Fail-closed organizer/reader/companion configuration | Implemented and tested, including missing identity, wrong backend/ref/origin, privileged browser key, Vercel scope and legacy connection mismatch. |
| Guard privileged scripts and local migration/reset commands | Implemented; foreign target/credential and passthrough flag denials tested before client/spawn. Hosted mutations blocked outright. |
| Reproducible synthetic local stack/config/seed | Configuration and commands prepared. Docker unavailable; actual fresh start/upgrade/reset/seed not executed. |
| Synthetic recovery drill | Added; service preflight failed closed. Full Auth/PostgREST/Storage/blob/recovery run remains pending a running disposable stack. Existing SQL restore tests pass but do not replace it. |
| Separate staging templates/runbook | Prepared; no staging project/alias/credential or settings changes made. |
| Vercel variable and credential scopes | Both build validators enforce declared provider scope. Actual inherited/Preview/Production settings and access holders remain unverified; no management connector available. |
| Hosted credential/access separation / fault injection | Local URL/key/process-env denials tested. Provider ACL/secret inaccessibility and actual wrong-target staging jobs not tested; hosted approval and separate resources required. |
| All existing migrations/features | No migration/RLS changes; broad SQL/unit/build and browser regressions recorded below. No live production/native Safari acceptance claimed. |
| S2 administrative roles/RLS | Deferred entirely until isolation evidence is reviewed. No migration or permission shortcut introduced. |
| Legacy E0–E5 traceability | S0 area mapping retained; original standalone checklist files still unavailable, so item-by-item verification remains open. |

## Checks And Actual Outcomes

| Exact Command / Check | Actual Result |
|---|---|
| `git status --short`, `git fetch origin main`, `git rev-parse HEAD origin/main`, `git switch -c infra/01-local-staging-isolation` | Preserved approved uncommitted S0 docs; fetched base matched `4d225ab`; created S1 branch. Fetch needed an approved network retry. No push/merge. |
| `NODE_OPTIONS=--no-experimental-webstorage npm run check` | **Passed on final stable sources:** ESLint, organizer TypeScript/Vite build, **186 files / 2,107 Vitest tests**, **13 Node configuration/isolation tests**, security boundary and real-build secret canary checks. Node 25 requires the local storage flag; CI Node version is unchanged. |
| `npm run build --prefix reader` | Passed with explicit local configuration, including the final runtime-origin guard. Existing large-chunk advisory only. |
| `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/lib/environment.test.ts src/lib/reader-connection.test.ts src/features/offline/ConnectReader.test.tsx reader/tests/environment-isolation.test.ts` | 4 files / 16 tests passed; included again in the final full check. |
| `npm run test:integration:config` | 13 tests passed: wrong targets, foreign credentials, remote/passthrough CLI flags, CI production mutation absence, child secret removal, exported/duplicate Edge env overrides and local Auth/status config. Included in final full check. |
| `VITE_SAMPLE_DATA=true npx playwright test tests/e2e/universal-manual.spec.ts` | **12 desktop/mobile tests passed** using local sample fixtures and no extension/backend. |
| `npx playwright test --config playwright.connected-login.config.ts` | **12 desktop/mobile tests passed** on final runtime guards, synthetic sessions and mocked loopback backend. |
| From `reader/`: `npx playwright test tests/browser/cloud.spec.ts tests/browser/calibre.spec.ts` | **8 tests passed** on the final reader artifact: originals/state, synthetic account isolation, cloud inbox and local Calibre delivery. No native Calibre or installed companion acceptance claimed. |
| `node --check scripts/local-supabase.mjs`, `node --check scripts/local-fixtures.mjs`, `node --check scripts/local-restore-drill.mjs`, `node --check scripts/configure-local.mjs`, `node --check server/prune-backups.mjs` | Passed syntax checks. They do not establish full service behavior. |
| `docker info --format '{{.ServerVersion}}'` | Approved read-only check confirmed daemon unavailable. No Docker or old stack was started/reset. |
| `npm run test:restore:local` | **Blocked / failed closed** during local preflight; no synthetic accounts, storage uploads or restore occurred. Not a passing recovery drill. |
| `node_modules/.bin/supabase db reset --help`, `node_modules/.bin/supabase migration up --help` | Local CLI attempts failed on managed filesystem telemetry-file writes outside writable roots. No reset or migration command executed. Installed and lockfile CLI versions both verified as 2.121.0; no dependency changed. |
| `git diff --name-only supabase/migrations` | Empty: all existing migrations unchanged. No remote schema comparison was attempted. |
| `git diff --check`, relative documentation-link checks, ignored-profile checks | Passed. Local public config replacement pattern also checked; full `db:configure` requires the unavailable service stack. |

No staging tests were executed. No fresh/upgrade CLI migration, local reset/seed, DB lint, real Auth/PostgREST/Storage/Edge integration, complete recovery drill, hosted misconfiguration test, native Safari/Chrome installation or hosted deployment is claimed. Existing jsdom `scrollTo` notices, browser color warnings and bundle-size advisories were nonfatal.

Earlier diagnostic attempts are not acceptance evidence: the first connected-login run failed six cases because its transport mock still selected the old fixture host after changing the test backend to loopback. The mock was corrected and the suite passed. A new reader transport test initially imported IndexedDB storage without mocking it; its test boundary was corrected. One broad run overlapped module edits and retained old exports; the final fresh run on stable sources is the acceptance record. CLI help/preflight attempts were blocked by the managed filesystem's Supabase telemetry-file write and Docker unavailability; no privileged operation was substituted against a hosted target.

## Hosted Approval Gate And Remaining Risks

No hosted staging changes are authorized. Before executing any, present a concrete request identifying resource/project/cost/region, aliases, owners, actual verified ref/keys, origin/redirect/CSP settings, CI secret access scopes, synthetic fixtures and rollback/cleanup plan. The runbook lists the required Supabase Auth hook/callbacks, private buckets, Edge artifacts, queues/schedules, reader associations, companion identities and Vercel Preview scope. Those prepared instructions are not a claim of hosted configuration.

Remaining blockers:

1. Start Docker and complete the guarded local fresh/upgrade, lint, seed and real Auth/PostgREST/Storage/Edge integration/recovery checks. The current managed CLI also attempts a telemetry-file write outside writable roots; resolve local execution permissions without substituting hosted credentials. Do not reset old personal-data volumes.
2. Independently verify hosted GitHub protections/secret scopes, Vercel production/preview/shared variables and Git/deploy hooks, Supabase integrations and current migration/settings drift. There is no Vercel/Supabase management connector in this session. A working-tree CI edit cannot retroactively stop a remote in-flight job or an independent auto-deploy.
3. Prove production credentials are inaccessible to preview/staging jobs through provider access controls. URL/ref guards and a stripped CLI child environment do not attest hosted access controls, nor stop a trusted operator manually invoking another binary/SQL tool. Opaque publishable-key project ownership cannot be authenticated offline.
4. Obtain explicit hosted staging creation/configuration approval, then verify real target identity immediately before any scoped migration/seed/function action. Current S1 tooling does not support hosted mutations; it must not be bypassed with a raw remote command just because a template exists.
5. Complete a synthetic isolated recovery drill and the broader Auth/config/blob inventory; approve recovery ownership, off-project protection/retention and RTO/RPO. The added scoped drill does not prove full project recovery.
6. Review the S1 isolation evidence before S2. Keep Owner bootstrap/MFA, administrative field allowlists, suspension semantics, privileged audit and role/RLS migrations separate. Hosted staging evidence remains mandatory before any production authorization/schema release.

Production still requires its own release authorization separate from PR/merge, covering exact artifact/target/component actions, recovery evidence, approver and window. No credentials, production contents or real backup artifacts are attached to this report.

## Changed Paths

The list includes the approved, previously uncommitted S0 documentation carried forward on this branch. Ignored local profile metadata changes are described above; no credential file is tracked.

- `.env.example`
- `.env.production.example`
- `.env.staging.example`
- `.github/workflows/ci.yml`
- `.gitignore`
- `README.md`
- `companions/chrome/README.md`
- `companions/chrome/build.test.js`
- `companions/safari/README.md`
- `companions/safari/build.test.js`
- `docs/BACKUPS.md`
- `docs/IMPLEMENTATION.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/security-foundation/BASELINE_AUDIT.md`
- `docs/security-foundation/LOCAL_AND_STAGING.md`
- `docs/security-foundation/S1_LOCAL_ISOLATION.md`
- `package.json`
- `playwright.config.ts`
- `playwright.connected-login.config.ts`
- `reader/README.md`
- `reader/docs/IMPLEMENTATION.md`
- `reader/src/cloud.ts`
- `reader/src/sync.ts`
- `reader/tests/browser/account-fixture.ts`
- `reader/tests/environment-isolation.test.ts`
- `reader/vite.config.ts`
- `scripts/build-env.ts`
- `scripts/build-extension.mjs`
- `scripts/build-userscript.mjs`
- `scripts/check-security.mjs`
- `scripts/configure-local.mjs`
- `scripts/local-fixtures.mjs`
- `scripts/local-restore-drill.mjs`
- `scripts/local-supabase.mjs`
- `scripts/local-target.mjs`
- `scripts/seed-local.mjs`
- `scripts/test-supabase.mjs`
- `scripts/tests/environment-isolation.mjs`
- `server/invite-user.mjs`
- `server/prune-backups.mjs`
- `server/refresh-fandoms.mjs`
- `server/restore-backup.mjs`
- `server/restore-backup.test.ts`
- `src/features/offline/ConnectReader.test.tsx`
- `src/features/offline/useReaderDestination.ts`
- `src/lib/connected-login.ts`
- `src/lib/environment.test.ts`
- `src/lib/environment.ts`
- `src/lib/reader-connection.test.ts`
- `src/lib/reader-connection.ts`
- `src/lib/supabase.ts`
- `src/test/server-boundary.test.ts`
- `supabase/.env.example`
- `supabase/config.toml`
- `tests/connected-login/redirect.spec.ts`
- `vite.config.ts`


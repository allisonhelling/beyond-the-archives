# Local And Staging Isolation

## Scope And Review Gates

S0 is conditionally approved as an audit deliverable. S1 implements local tooling and prepares staging. S2 roles/RLS are separate. The existing hosted project is production with personal data; never copy its database, Auth users, backups or EPUBs into local/staging. Do not interpret these instructions as hosted approval.

The S1 working-tree CI definition has no production deployment job and no production credential references. Ordinary pushes/PRs run checks only. This does not change the existing hosted workflow until an explicitly approved push; GitHub environment protections, Vercel Git releases, Supabase integrations and existing in-flight jobs remain outside this local change. No replacement production runner is supplied in S1. A production release requires a separate reviewed request for exact artifact/target/actions and a hosted enforced approval gate.

## Reproducible Local Setup

Use Node 22.13+ on the supported 22.x line or Node 24+, installed repository dependencies, Docker Desktop and the existing Supabase CLI dependency. Run from repository root:

```sh
npm ci
npm ci --prefix reader
npm run db:start
npm run db:migrate
npm run db:configure
npm run db:seed
```

Run commands sequentially after success. The separate local project ID is `beyond-the-archives-local-synthetic`. Old `beyond-the-archives` / `ao3-library-tracker` volumes and the ignored production CLI link are preserved. No data is moved from them. If an old stack occupies local ports, stop it through its own known local project configuration after preserving its data; do not reset it or repoint a remote link to make the new stack start.

`db:configure` reads the running local CLI status in memory and writes only public environment identity/key/origins into root and reader `.env.local`. It preserves other fields and refuses to overwrite a different backend profile. It creates missing local Edge origin settings without writing service keys. Avoid printing CLI status JSON or copying server keys into browser files/logs. Existing hosted profiles are never imported into local builds. Restart dev servers after configuration changes.

`db:seed` accepts no file, target or passthrough flags. It creates two unique synthetic `example.test` accounts with random passwords held only in memory, native/universal story fixtures and reader access/associations. It does not create application Admin/Owner roles. For manual sign-in, approve an additional synthetic `example.test` address in the **local** signup allowlist and register/confirm it through the local inbox. Never enter a real production password or import a personal backup. Local Studio: port 54323; local email inbox: port 54324.

Run these in separate terminals:

```sh
npm run db:serve
npm run dev
npm run dev --prefix reader
```

Default organizer/reader origins are ports 5173/5174. The local Edge runtime injects local backend credentials; `supabase/.env.local` may contain the two loopback app origins, never server/backend overrides. Keep exact callback origins consistent and retain the private-beta before-user-created hook, email confirmation and disabled anonymous access.

## Guarded Local Commands

| Command | Target And Behavior |
|---|---|
| `npm run db:start` / `db:stop` | Fixed synthetic project configuration and repository working directory; management credentials removed from CLI child environment; CLI output with potential keys is withheld. |
| `npm run db:migrate` | Existing complete migration chain, explicit `migration up --local`; verifies a running loopback API first. No migrations were rewritten. |
| `npm run db:reset` | Explicit `db reset --local --yes`, synthetic project only. Destructive to this disposable stack. No extra flags, linked target or DB URL accepted. |
| `npm run db:lint` / `db:types` | Existing CLI local lint/types. Type output replaces the generated file only after successful CLI execution. |
| `npm run db:configure` / `db:seed` | Local status-derived configuration and purpose-built synthetic fixtures only. |
| `npm run test:integration` | Existing local Auth/PostgREST/Storage integration. External `INTEGRATION_BACKUP_FIXTURE` inputs are now refused; generated synthetic account snapshots remain the test input. |
| `npm run test:restore:local` | Synthetic account restore plus separate original EPUB/cloud annotation recovery and cross-owner denials. Cleans up its own synthetic accounts/objects. Requires full local services, not just SQL. |
| `npm run backup:restore -- synthetic.json --user LOCAL_UUID` | Operator restore is local-only in S1; intended for known synthetic files. Never supply personal exports. Hosted URL or foreign service key is rejected before a client is constructed. |
| `npm run backup:prune`, `metadata:fandoms`, `invite` | Local-only operator clients; derive local credentials or compare supplied credentials to actual local CLI status. Invitation also requires a synthetic `example.test` address and loopback destination. No automatic `.env.worker` loading. |

Do not deploy these local-only operator entrypoints as a replacement for an existing production worker/recovery artifact. Preserve deployed operations until a separate hosted runner and release procedure are reviewed and explicitly authorized. A future merge alone must not update those processes.

Target checks bind CLI operations to the repository's named synthetic stack, actual CLI status and loopback API, use fixed argument lists and remove ambient management credentials. Supplying a production service key beside a loopback URL fails before any request. Hosted mutations have no S1 override flag. These wrappers cannot stop an infrastructure administrator from manually running an arbitrary CLI/SQL command; provider credential restrictions and approvals remain necessary.

## Application And Companion Configuration

One shared environment validator extends the existing public-key parser. Connected organizer/reader builds require all six variables:

- `VITE_APP_ENV`: `local`, `staging` or `production`.
- `VITE_SUPABASE_PROJECT_REF`: `local` for loopback or the explicit hosted ref.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`: matching public backend settings, never a service credential.
- `VITE_ORGANIZER_URL` and `VITE_READER_URL`: explicit environment-specific origins.

Local uses the loopback API on port 54321. Staging requires HTTPS and cannot select the known production ref or production app aliases. Production requires the known production ref. Vercel's provided `VERCEL_ENV=preview` requires staging configuration; `production` requires production configuration. Both builds fail before writing a valid artifact if configuration is missing/mismatched or a privileged key is browser-prefixed. Local development servers reject production configuration, and production runtime clients require one of their explicitly configured app origins. No reader backend or sibling-app production fallback remains. Guest EPUB reading remains local, but the shipped reader artifact must have explicit build configuration.

Use `.env.example` for local, `.env.staging.example` for staging preparation, `.env.production.example` for a separately authorized production release. Placeholder keys intentionally do not pass validation. Opaque publishable-key ownership cannot be proved by offline string validation; authorized hosted project/key inventory and independent secret access scopes are still mandatory. Do not reuse production credentials in a staging process even if a URL guard would reject them.

Chrome/Edge artifacts now contain **one** selected environment/profile. `build:extension:local` uses only local config; hosted builds require explicit staging/production config and a matching `EXTENSION_APP_ORIGIN`. Local artifacts never include hosted backend permissions or keys. The existing runtime environment manager and session handling remain in use; no second bridge is introduced. Build staging and production artifacts into different directories and use separate installed extension identities/profiles. Existing installed combined artifacts are unchanged until an approved rebuild/reload.

Safari remains HTTPS hosted only; stage it only after a separately approved staging backend/app exist. Its `.env.local.hosted` input must now contain the full explicit environment configuration. No local Safari build is promised. Saved reader organizer connections are checked against the configured backend/public key before sending a paired secret; a legacy connection from another environment must be re-paired rather than silently used.

Changing `vercel.json` origins/CSP, hosted Auth allowlists or deployed function secrets is a hosted release step, not implicitly authorized by templates. The tracked production CSP/sibling exceptions remain unchanged in S1; staging header/origin preparation is part of the approval checklist below.

## Synthetic Recovery Drill And Limits

The local drill generates its own two accounts, AO3/universal library entries and EPUB bytes using the existing ZIP utility. It checks caller-owned preview/safety-copy restore, version-2 source preservation, unchanged second-account data, reader annotation/original hash recovery, retained organizer association and denied cross-account access. It never takes a production file or account ID as input. Its safety copy uses a trusted local Storage upload to exercise the database's restore boundary; full `save-backup` Edge retention is covered separately by existing integration tests.

The drill is scoped recovery, not whole-project disaster recovery. It keeps the same synthetic Auth identities and does not recreate SMTP, secrets, provider project configuration, every reader manifestation or cron jobs. Actual full-service execution is blocked while Docker is unavailable. Existing SQL backup/reader tests and a generated fixture are not evidence that real blob/Auth/config recovery has succeeded. RTO/RPO remain undecided; the drill does not establish production objectives or approve access to personal backups.

## Staging Preparation And Approval Gate

**No hosted staging is approved or provisioned by this work. Stop before each hosted step.** Prepare a review request identifying the proposed project/region/cost, owner, staging aliases, credential scopes and synthetic seed/restore procedure. After explicit approval, the operator must:

1. Inventory actual project identity through authenticated settings/management metadata and correlate ref, URL and project-bound keys. Do not treat an environment label or configured ref as proof. Record redacted evidence, never credentials or library content.
2. Create/identify a separate staging Supabase project with no production data branching/cloning. Use separate Auth users, Storage, queues, throttles, jobs, SMTP and API/service credentials. Keep production secrets inaccessible to staging/preview/PR processes through provider access controls.
3. Configure the existing 129-migration chain, two private Storage buckets, all existing grants/RLS and required extensions. A reviewed staging migration mechanism must verify the actual remote project immediately before any command. S1's current local runner intentionally does not support remote mutation; extending it requires the approved hosted step and tests, not raw command substitution.
4. Enable the private-beta before-user-created hook, exact synthetic approvals and confirmed email registration; disable anonymous access. Set exact staging organizer/reader callback URLs, login-bridge origins and matching confirmation/invitation/recovery templates. Do not change production callbacks to make staging work.
5. Deploy only approved staging Edge artifacts. Set staging `APP_ORIGIN` / `READER_ORIGIN`; platform backend keys must belong to staging. Preserve extension-only work retrieval and the retired import-worker tombstone. Stage tag/fandom enrichment separately with staging-only credentials and throttles.
6. Inventory/approve each schedule and webhook. DNF cleanup, fandom refresh, any obsolete worker/Vault reference and external hosts must not address production. Do not blindly replay production schedule definitions or copy Vault contents. Test staging queues with synthetic jobs only.
7. Configure separate organizer/reader Vercel targets/aliases and **Preview-only staging variables**. Review inherited team/shared variables and deploy hooks. Production variables belong only to an approved protected production release path. Validate `VERCEL_ENV`, ref/URL/key ownership, sibling origins, CSP bridge exceptions and Auth redirects in both artifacts.
8. Build isolated Chrome/Edge and Safari staging artifacts with staging origins/permissions and fresh scoped pairing/delivery credentials. Use synthetic accounts only; test reader account matching, Calibre delivery, old/new companion behavior and manual fallback without signing into P.
9. Prove wrong-production-target fault injection is denied by both credential/provider access restrictions and application guards: URL/ref/public key, service credential, CLI link, redirect, queue/webhook and artifact settings. Local guard tests alone do not prove hosted staging cannot obtain production credentials.
10. Execute fresh/upgrade migrations, SQL/RLS/Storage cross-account checks, full synthetic Auth/Edge/browser and recovery tests. Record exact artifact/target and results. Stage data resets must have their own explicit verified staging-only guard; none is enabled by the current local reset wrapper.

**Approval required:** hosted project creation/costs, GitHub protection/secret settings, Vercel variables/auto-deploy/CSP/aliases, Supabase migrations/functions/Auth/Storage/jobs, credential provisioning/rotation and any push/merge/release. A later approved staging setup is not production release approval. S2 remains separate until S1 isolation evidence is reviewed; production authorization/schema rollout additionally requires hosted staging verification.

## Remaining Verification Gaps

Hosted GitHub/Vercel/Supabase protections, secret scopes/access holders, migration drift, installed artifacts, Auth hook activation/SMTP/redirects, actual Storage policies/blobs, schedules/external worker hosts and independent recovery remain as recorded in the [S0 audit](BASELINE_AUDIT.md). S1 repository changes do not retroactively prove hosted protection. Missing legacy E0–E5 reference checklists still prevent item-by-item mapping; preserve the S0 area ownership table and import the original items when available.

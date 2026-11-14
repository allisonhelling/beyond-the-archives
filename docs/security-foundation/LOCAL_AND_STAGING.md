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
7. Reuse the existing organizer/reader Vercel projects with isolated `staging` branch Preview deployments/aliases and **Preview-only staging variables**. Review inherited team/shared variables and deploy hooks. Production variables belong only to an approved protected production release path. Validate `VERCEL_ENV`, ref/URL/key ownership, sibling origins, CSP bridge exceptions and Auth redirects in both artifacts. Follow the Vercel Preview proposal below before any push or hosted change.
8. Build isolated Chrome/Edge and Safari staging artifacts with staging origins/permissions and fresh scoped pairing/delivery credentials. Use synthetic accounts only; test reader account matching, Calibre delivery, old/new companion behavior and manual fallback without signing into P.
9. Prove wrong-production-target fault injection is denied by both credential/provider access restrictions and application guards: URL/ref/public key, service credential, CLI link, redirect, queue/webhook and artifact settings. Local guard tests alone do not prove hosted staging cannot obtain production credentials.
10. Execute fresh/upgrade migrations, SQL/RLS/Storage cross-account checks, full synthetic Auth/Edge/browser and recovery tests. Record exact artifact/target and results. Stage data resets must have their own explicit verified staging-only guard; none is enabled by the current local reset wrapper.

**Approval required:** hosted project creation/costs, GitHub protection/secret settings, Vercel variables/auto-deploy/CSP/aliases, Supabase migrations/functions/Auth/Storage/jobs, credential provisioning/rotation and any push/merge/release. A later approved staging setup is not production release approval. S2 remains separate until S1 isolation evidence is reviewed; production authorization/schema rollout additionally requires hosted staging verification.

## Vercel Staging Preview Proposal

**Status: local preparation authorized and implemented; no push, deployment or hosted settings change authorized.** Reuse the two existing Vercel projects and the single GitHub repository. No new Vercel project, custom domain purchase, custom environment or production setting change is proposed. Supabase changes remain separately gated.

### Inspected State And Missing Hosted Evidence

Local `staging` already points to reviewed S1 commit `2d75d28101e2ff9637da665e7b4df9013df84e8d`; `main` remains `4d225ab9f064495bf195be7b8408805e16fc4a2a`. Preserve both uncommitted security-document edits; do not reset, stash away, overwrite or merge them. Prepare subsequent reviewed commits on `staging` only.

Repository organizer settings are `npm run build`, output `dist`, root SPA rewrites and existing security headers. Reader settings specify Vite, `npm ci --include=dev --prefix .. && npm ci --include=dev`, `npm run build`, output `dist`, reader SPA rewrites and security headers. Both currently name production sibling origins in CSP. The reader imports shared parent code, so hosted root-directory/outside-root access and install overrides must be checked rather than inferred from the JSON files. S1 CI has checks only and no production deployment job.

After the user connected Vercel, discovery confirmed `installed: true`. However, this session exposes **no Vercel management tools**, and no local Vercel project links, CLI authentication files or `VERCEL_TOKEN` are available. No authenticated project-settings request could be issued. Consequently live project IDs/names/team, Git integrations, Production Branch settings, effective build overrides, environment scopes/inheritance, integrations, hooks, domain assignments, protection settings, roles and promotion automation have **not** been inspected or verified. This is a tool-access gap, not a claim that the user failed to connect Vercel. Public production hostnames do not prove project names or branch configuration. Available authenticated read-only project tools or redacted operator settings evidence are required to complete this inventory; no credentials should be pasted into chat.

Before approval to push, record for each project: its exact ID/team; repository and root; actual Production Branch (expected `main`, never assume); effective install/build/output/Node and ignored-build settings; system-variable exposure; production domain mapping; all project/team/integration variable names, scopes, branch restrictions and access sources; deploy-hook branches without secret URLs; external CI/API promotion capabilities; and Preview protection behavior. If a correction requires production or shared-scope changes, stop for a separately scoped request.

### Stable URLs And Bootstrap Sequence

Use Vercel's Git **branch URL**, which remains stable across commits, rather than its unique per-deployment URL. The documented general shape is `<project-name>-git-staging-<scope-slug>.vercel.app`. This is a naming pattern, not either application's actual URL; truncation and provider naming rules mean it must not be guessed. Read the actual branch aliases from authenticated deployment metadata after approved bootstrap deployments. No domain purchase is needed for the generated `vercel.app` addresses; existing plan usage/build limits still apply. [Vercel generated URLs](https://vercel.com/docs/deployments/generated-urls).

Resolve the sibling-origin dependency with two minimal, backend-disconnected **Preview bootstrap deployments** after the settings/credential inventory and explicit approval:

1. Prepare a small temporary commit on `staging` that serves only a static staging-setup page for both roots. Keep all S1 application sources and migration files intact. Use one shared bootstrap script/asset where practical, no dependency installation or application/Auth/Storage initialization, a dedicated static output directory, deny framing and outbound connections, and a Preview/staging-branch assertion. Override only the branch's repository build configuration, never Dashboard production build settings. Inspect effective project overrides first; do not publish repository source as a static output directory.
2. Obtain approval for that exact commit push **and its two automatic Git Preview deployments** together. Confirm both projects still classify `staging` as Preview immediately before pushing. Do not push an application commit expecting to fix inherited environment variables afterward.
3. Read and verify both successful bootstrap deployments' project IDs, Git ref/SHA, Preview target and generated branch aliases. Call their HTTPS origins `O` (organizer) and `R` (reader). Check that neither equals a production origin and that both belong to the intended projects. No guessed alias or production sibling is used at any point.
4. Present the now-concrete `O`/`R` environment-variable, header and Auth plan for approval. Configure branch-specific Preview variables only after that approval. Restore the normal application build configuration in a subsequent reviewed staging commit, retaining the new guards and exact staging headers. Bootstrap output must not remain the application output.
5. Test both real builds locally with the actual origins, then request approval for the exact application commit push and two Preview deployments. Until staging backend readiness has been separately approved and verified, successful frontend publication does not imply functional Auth/library/reader acceptance.

This adds temporary bootstrap history on `staging`, preserves reviewed S1 ancestry and avoids a production fallback, synthetic-domain application release or a project-wide build-setting change. If hosted settings cannot support this branch-only bootstrap safely, stop before pushing and present the specific limitation rather than changing production.

### Proposed Variables And Headers

Apply this same public configuration to **both** projects with target **Preview** and Git branch **`staging`**:

| Variable | Proposed Value |
|---|---|
| `VITE_APP_ENV` | `staging` |
| `VITE_SUPABASE_PROJECT_REF` | `vzqrpjzfwcuuiqxanyoy` |
| `VITE_SUPABASE_URL` | `https://vzqrpjzfwcuuiqxanyoy.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Previously supplied publishable key, independently matched to staging inventory; value intentionally omitted from documentation. |
| `VITE_ORGANIZER_URL` | `O`, the verified organizer branch origin. |
| `VITE_READER_URL` | `R`, the verified reader branch origin. |

Do not manually set/override `VERCEL_ENV`, use `VERCEL_PROJECT_PRODUCTION_URL` as a sibling fallback, or add service-role/database/management credentials to either frontend project. Keep sample mode disabled. `VERCEL_BRANCH_URL`, when exposed, can corroborate the current project's own branch alias; it cannot identify the sibling project's origin. Branch-specific project variables override same-name Preview defaults, but **other Preview/shared variables still remain accessible**. Overrides are not credential isolation. [Environment scopes](https://vercel.com/docs/environment-variables), [shared variables](https://vercel.com/docs/environment-variables/shared-environment-variables), [system variables](https://vercel.com/docs/environment-variables/system-environment-variables).

After aliases are verified, generate review candidates with `npm run prepare:staging -- --organizer ACTUAL_ORGANIZER_ORIGIN --reader ACTUAL_READER_ORIGIN`. The helper derives both configurations from the existing `vercel.json` files, writes ignored `artifacts/staging/organizer.vercel.json` and `reader.vercel.json`, refuses missing/invalid/same origins and never overwrites an existing artifact. The `vercel.app` suffix check is syntax validation, not proof of alias ownership; authenticated verification remains mandatory. The command does not install active configs or contact Vercel. Review the generated diff before making the approved staging-branch edits. Organizer `frame-src` allows only self and `R`; reader `frame-src` allows only self and `O`. On `/auth/bridge`, each `frame-ancestors` allows exactly its staging sibling. Keep ordinary pages unframeable and keep the bridge outside the blanket `X-Frame-Options: DENY` rule. Preserve bridge `no-store`/`no-referrer`, organizer `/auth/connected`, reader `/auth/authorize`, SPA rewrites, cache behavior and existing non-origin security directives. Existing wildcard backend connect directives become the staging HTTPS/WSS backend where present; no blanket reader CSP is added that could break local EPUB/blob or loopback Calibre behavior. Test effective headers on root, direct callback/bridge routes and rewritten routes. Production configuration on `main` and deployed production artifacts remain untouched.

### Preview Isolation And Promotion Controls

The shared build validator, used by both Vite entrypoints, now checks provider Git/environment metadata: branch `staging` requires provider scope `preview`, declared app environment `staging` and the verified staging backend ref. Missing provider environment/branch metadata, conflicting target metadata and production scope fail closed even if inherited Production variables are internally consistent. The shared runtime origin guard now covers staging as well as production, preventing connected clients on production or arbitrary deployment origins. Immutable deployment URLs are rejected unless explicitly configured; use the verified branch origins for connected testing. Local/sample behavior is preserved. These are local source changes, not deployed protection.

`npm run prepare:staging -- --bootstrap` has generated ignored organizer/reader bootstrap config candidates for review. They use one dependency-free `scripts/staging-bootstrap.mjs`, disable dependency installation, publish only `.staging-bootstrap/index.html` and deny outbound connections/framing. The script refuses wrong/missing provider scope/branch, recognized privileged credentials and unknown working directories before producing output. Synthetic local checks exercised both roots and removed only their generated test output. Neither candidate has been installed as an active `vercel.json`. Effective hosted overrides and credentials must be audited before approving either bootstrap build.

Ignored root and reader `.env.staging.local` files now contain the explicit verified staging ref/URL/public key with empty sibling origins and extension origin. They are intentionally incomplete and fail closed; no guessed origins or production profile was substituted. Existing `.env.local` and `.env.local.hosted` were preserved. Do not use `vercel env pull` to overwrite these or the local profiles.

The audited projects must retain a non-staging Production Branch and have no hook, domain mapping or external automation promoting staging. Preview-to-Production is a separate deployment operation; build guards are not proof that a privileged operator cannot reassign domains or bypass Git. Inventory effective promotion permissions and require a separate protected production release path. Do not claim that manual promotion is impossible merely because environment variables are Preview-scoped. If stronger enforcement needs a production permission/settings change, report it for separate authorization. [Vercel promotion behavior](https://vercel.com/docs/deployments/promoting-a-deployment).

To prove credential inaccessibility, inspect all effective Preview/project/team/integration/CI scopes, including non-`VITE_` variables, Supabase management tokens, service-role/secret keys, database URLs/passwords and external secret-fetch permissions. Frontend builds require none of these. Production service credentials must be excluded by provider scopes/access policy before **any** bootstrap or app build. Do not merely blank/override them or hide them from the bundle. If production credentials are currently available to Preview and removing them affects a shared/production scope, record the blocker and obtain separate approval; reuse of the projects does not waive this gate. Current local artifact scans do not establish hosted inaccessibility.

Review existing Preview protection without disabling it globally. Test access to both protected origins, callbacks and embedded bridges with the intended tester identity; provider protection must not intercept one sibling's bridge and silently break connected login. Any required Preview protection adjustment needs a specific approval. Never put a Vercel automation bypass secret in browser variables, iframe URLs or companion artifacts.

### Auth Values, Validation And Approval Requests

Once actual origins are known, report the literal values replacing these symbols:

- Staging Supabase Site URL: `O`.
- Staging redirect allowlist: `O/auth/callback` and `R/auth/callback` only, for the inspected signup/recovery/email-change/invitation flow. No production origin, wildcard or invented callback.
- Staging Edge origin settings, under separate Supabase approval: `APP_ORIGIN=O`, `READER_ORIGIN=R`.

No exact Auth URLs can be honestly supplied before the aliases are observed. Do not change Supabase during Vercel preparation. Companion staging builds later reuse the same origins and `EXTENSION_APP_ORIGIN=O`; use separate artifacts/profiles/pairing and preserve extension-only AO3 retrieval, Calibre destinations, reader isolation and Universal Stories. All 129 migrations remain unchanged.

Required checks before the application push: real organizer/reader builds with actual staging variables; output scans for known production credentials, privileged JWTs/keys and injected server-secret canaries; wrong branch/scope/backend/missing-variable build rejection; staging-runtime origin denial; regression checks of production header source values; bridge framing/login tests; reader cloud/Calibre and relevant companion configuration tests. Reuse existing tests/validators and extend only the missing behavior. After separately approved deployments, inspect actual target/ref/aliases, effective headers and the final hosted artifact. Tests requiring hosted Auth/Storage/Edge readiness remain pending until the separately approved backend exists.

Approval requests must be staged and concrete:

1. **Repository preparation:** authorized locally. Branch/runtime guards, bootstrap script/candidates and configuration preparation helper are implemented for review; no push implied. Actual aliases, project identity and provider settings remain unavailable.
2. **Bootstrap release:** after read-only inventory clears production-access/target risks, approve the exact staging bootstrap SHA push and two Preview builds on the named existing project IDs. This approval includes expected automatic Git deployments and build usage only.
3. **Preview variables:** after actual aliases are returned, approve the exact six public variables for each named project, scoped to Preview/`staging`, plus any specifically identified Preview-only credential/protection remediation. No Production/shared scope edit is bundled into this request.
4. **Application release:** approve the exact final staging SHA push and two application Preview deployments after local checks. No promotion, `main` merge, production alias assignment, paid upgrade, new project/domain or production redeployment is included.
5. **Separate future Supabase request:** literal Auth/origin settings, migration/function/allowlist actions and synthetic acceptance tests remain outside Vercel approval.

Rollback is limited to the approved Preview resources: retain pre-change redacted settings and Preview deployment IDs; restore a known safe branch Preview deployment or static bootstrap, and reverse only the added staging-scoped variables/configuration after approval. Never use a production rollback/promotion control for staging cleanup. Keep production domains, variables and branch settings unchanged.

## Remaining Verification Gaps

### Hosted Staging Intake — 13 November 2026

This is a preparation plan, not hosted mutation approval. Authenticated read-only `supabase projects list --output json` independently verified the following identity. Read-only project API-key inventory matched the supplied publishable key in memory; no key values were logged or written to repository files.

| Environment | Verified Identity And Targets |
|---|---|
| Staging | `beyond-the-archives-staging`, ref `vzqrpjzfwcuuiqxanyoy`, region `us-east-1`, `ACTIVE_HEALTHY`, created 13 November 2026. API origin: `https://vzqrpjzfwcuuiqxanyoy.supabase.co`. Organizer/reader deployment URLs are not yet supplied or verified. |
| Production | `Beyond the Archives`, ref `pnrdztfydurupcqwumvr`, region `us-east-1`, `ACTIVE_HEALTHY`. API origin: `https://pnrdztfydurupcqwumvr.supabase.co`. Organizer: `https://beyondthearchives.vercel.app`; reader: `https://archivesunfolded.vercel.app`. |
| CLI Link | Still production, confirmed by both authenticated inventory and ignored `supabase/.temp/project-ref`. Not changed. Never use an unqualified linked deployment. |
| Local Apps | Root and reader `.env.local` remain loopback/local. Existing `.env.local.hosted` still selects production; it is unsuitable for staging and was not modified. |

Project/key identity is verified. Database emptiness, migration history, remote Auth/Storage/function settings, billing tier, Vercel targets and provider secret access scopes remain unverified. A newly created project is not evidence that it contains no production data. No remote data, schema or settings were mutated during intake.

#### Missing Inputs And Dashboard Configuration Plan

Supply the actual HTTPS staging organizer and reader origins, the intended Vercel projects/Preview aliases, and a controlled SMTP/test-mail destination with synthetic recipients. Do not paste SMTP passwords, database passwords or service-role keys into documentation or chat. Confirm the staging project owner/billing arrangement; incremental project compute, email, Storage and Vercel costs have not been established. No plan or billing change is proposed by this intake.

After migration and explicit Auth approval, configure these settings in the **staging** Supabase Dashboard:

- **URL Configuration:** Site URL is the actual staging organizer origin. Redirect allowlist contains exactly the organizer and reader `/auth/callback` URLs. The application uses these existing routes for signup confirmation, password recovery and email changes; existing invitation handling also uses `/auth/callback`. No OAuth provider is used by the inspected Auth flow, and no new OAuth callback is proposed. Do not insert template/example domains or production origins.
- **Email Authentication:** Enable email/password signup, require email confirmation, retain secure password change and email-change notification behavior from `supabase/config.toml`. Anonymous sign-in remains disabled. Keep public registration closed until the private-beta hook and controlled email delivery are verified.
- **Before User Created Hook:** Enable `pg-functions://postgres/public/before_user_created` after its existing migration. Preserve `supabase_auth_admin` execution and allowlist SELECT permissions. An empty `public.beta_signup_allowlist` denies all new accounts; separately approve only synthetic test recipients. Never import production approvals/users.
- **Email Delivery:** Configure a staging-only controlled SMTP sink/test provider and templates using the existing callbacks. Recipient and provider selection remain pending. Reserved `example.test` addresses require a controlled sink; they cannot receive ordinary public email. Never weaken confirmation to bypass delivery.
- **Storage:** Verify the migration-created private `library-backups` and `reader-epubs` buckets (50 MiB limits). Backups allow owner-prefix read/delete with trusted server uploads; the later retention migration removes direct client INSERT. Reader objects require owner-prefix access plus reader entitlement, with hash-based EPUB paths and deletion checks. Verify final policies after the full migration chain rather than manually duplicating an early policy.

#### Exact Deployment Proposal And Repository Preparation

The candidate schema artifact is all **129 unchanged** SQL files in `supabase/migrations`, sorted by filename, from `20261014000100_foundation.sql` through `20261112000400_universal_backup_compatibility.sql`, including completed Universal Stories. The SHA-256 over each sorted filename plus newline followed by its file bytes is `f9480e6e7772eb935b90caff5897a0347daef2f46bc991bb686301d13b7e9fbe`. This identifies the candidate chain; it does not approve replaying it against an uninspected database. First verify the target again, inspect staging migration history and absence of library/Auth/Storage data without copying content, compare the exact pending files, and review migration effects against the baseline grants/RLS inventory. Present that concrete pending set for approval before applying it. Never run a hosted reset.

The candidate Edge artifacts are the existing `account-status`, `app-login`, `extension-metadata`, `series-preview`, `save-backup`, `tag-resolution`, `wayback-lookup` and `reader-inbox` functions, plus the `import-worker` HTTP 410 tombstone for stale callers. Preserve current per-handler authentication and `verify_jwt` settings. No hosted AO3 work-retrieval worker, recurring enrichment process, cleanup schedule or cron activation is proposed. Review tag/fandom enrichment separately with staging-only throttles and credentials.

Functions use platform `SUPABASE_URL`, `SUPABASE_ANON_KEY` and/or `SUPABASE_SERVICE_ROLE_KEY` belonging only to staging. Explicit application settings are `APP_ORIGIN` (organizer) and `READER_ORIGIN` (reader); `app-login` validates both. Inventory actual deployed secrets without printing values; do not copy production secret files or run local-only operator entrypoints remotely.

Proposed follow-up repository changes, once missing inputs are supplied:

1. Extend existing target-validation conventions with a tested staging-only deployment guard that verifies authenticated project identity immediately before mutation, refuses production, ignores the existing production CLI link and rejects ambiguous targets/foreign credentials. No remote bypass flag or raw CLI workaround is authorized. The guard is not implemented by this intake.
2. Prepare ignored, separate staging profiles for both apps using `VITE_APP_ENV=staging`, `VITE_SUPABASE_PROJECT_REF=vzqrpjzfwcuuiqxanyoy`, `VITE_SUPABASE_URL=https://vzqrpjzfwcuuiqxanyoy.supabase.co`, the verified supplied publishable key and the actual `VITE_ORGANIZER_URL` / `VITE_READER_URL`. Reuse the current environment/build validators; do not overwrite local or hosted production profiles. Incomplete profiles are not runnable staging configuration.
3. Prepare staging-specific Vercel header artifacts through existing configuration conventions. Replace production sibling origins in staging `frame-src` and `/auth/bridge` `frame-ancestors`; preserve `/auth/connected` and `/auth/authorize` login handoffs. Keep production deployment settings untouched. Current tracked headers still contain production siblings and are not ready for staging publication.
4. Reuse existing Chrome/Edge build scripts with one staging profile and matching `EXTENSION_APP_ORIGIN`, separate output/install identity and staging-only permissions. Safari requires its own complete HTTPS staging input, never the current production `.env.local.hosted`. Pair Calibre from a synthetic staging reader library in an isolated Calibre configuration; existing queue entries retain their old destinations, so do not reuse a production queue or delivery credential.

Provider preparation requires Preview-only staging variables in both Vercel targets, inspection of inherited/shared secrets and deploy hooks, and separate protected GitHub staging credential scopes. Production credentials must be inaccessible to staging/Preview jobs. Existing validators reject a Vercel Production scope with staging variables; do not work around this by mislabelling a release. Production Vercel settings and remote CI have not been changed or verified.

#### Validation, Approval And Rollback

Intake checks: `npm run test:integration:config` passed **13/13 tests**. Auth callbacks, Edge entrypoints, Storage migrations and current Vercel headers were inspected. All 129 migrations remain unchanged. No hosted Auth, cross-user library/Storage, reader cloud/login, companion, restore or wrong-credential acceptance test has run. Local configuration, unit/SQL and build/browser tests can run before hosted approval using existing synthetic fixtures; real service/recovery checks still require a working disposable local stack. Hosted tests must later cover approved/rejected signup, confirmation, two-user isolation, Storage/EPUBs, connected login, companions, Universal Stories and synthetic restore.

Approval is still required for each concrete hosted migration, Edge deployment, Auth/Storage setting, synthetic data/allowlist mutation, secret provisioning, GitHub environment change and Vercel project/domain/configuration action. Jobs and destructive cleanup require separate approval. Missing origins/email choices and unverified database state prevent a complete executable deployment approval request now; stop at this preparation plan.

Rollback preparation: record redacted staging-only pre-change settings and exact migration/function artifact versions before applying changes. If staging validation fails, stop staging deployments/jobs, revoke staging-only pairing credentials and remove only identified synthetic fixtures through an approved guarded cleanup. Reverse application/settings changes using recorded staging values. Applied migrations require a reviewed forward repair or separately approved recreation of a verified disposable staging project, never an automatic hosted reset or production rollback. Disable staging deploy hooks before any separately approved resource deletion; retain production untouched. No cleanup or deletion is authorized by this plan.

Hosted GitHub/Vercel/Supabase protections, secret scopes/access holders, migration drift, installed artifacts, Auth hook activation/SMTP/redirects, actual Storage policies/blobs, schedules/external worker hosts and independent recovery remain as recorded in the [S0 audit](BASELINE_AUDIT.md). S1 repository changes do not retroactively prove hosted protection. Missing legacy E0–E5 reference checklists still prevent item-by-item mapping; preserve the S0 area ownership table and import the original items when available.

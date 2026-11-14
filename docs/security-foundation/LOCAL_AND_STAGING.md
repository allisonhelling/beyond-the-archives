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

Reviewed S1 commit `2d75d28101e2ff9637da665e7b4df9013df84e8d` is the preparation base. At the authenticated audit below, local `staging` and its existing `origin/staging` tracking state are at `7a79f58b1c49e62d0ef411545c9a4011096c7f6c`; `main` remains `4d225ab9f064495bf195be7b8408805e16fc4a2a`. The working tree was clean before this documentation audit. The audit did not create that commit or push it. Preserve all existing S1 work and prepare subsequent reviewed changes on `staging` only.

Repository organizer settings are `npm run build`, output `dist`, root SPA rewrites and existing security headers. Reader settings specify Vite, `npm ci --include=dev --prefix .. && npm ci --include=dev`, `npm run build`, output `dist`, reader SPA rewrites and security headers. Both currently name production sibling origins in CSP. The reader imports shared parent code, so hosted root-directory/outside-root access and install overrides must be checked rather than inferred from the JSON files. S1 CI has checks only and no production deployment job.

The earlier tool-access gap is resolved: authenticated Vercel MCP reads now succeed. The following audit replaces that connection blocker with verified findings and specific response/tool limitations. Full provider isolation and release readiness remain unverified; do not equate a working connection with complete settings access.

Before approval to push, record for each project: its exact ID/team; repository and root; actual Production Branch (expected `main`, never assume); effective install/build/output/Node and ignored-build settings; system-variable exposure; production domain mapping; all project/team/integration variable names, scopes, branch restrictions and access sources; deploy-hook branches without secret URLs; external CI/API promotion capabilities; and Preview protection behavior. If a correction requires production or shared-scope changes, stop for a separately scoped request.

### Authenticated Read-Only Vercel Audit — 13 November 2026

**Scope:** management metadata only. No project creation, settings mutation, source upload, push, deployment, promotion, share-link/bypass creation, runtime log query, application sign-in or production database/Storage access occurred. Environment inventory requests explicitly used `decrypt=false`; values were excluded from output and documentation. Single-variable decrypted-value tools were not used. This audit changes only this runbook locally.

Authenticated account: `allisonhelling`. The complete returned team page contains one team, **allisonhelling's projects**, slug `allisonhellings-projects`, ID `team_mB5Tjb4FpnSFh8QCEAgvtRJV`. The account's default team matches. Git deployment context reports the **Hobby** plan. No paid upgrade is proposed.

| Setting | Organizer | EPUB Reader |
|---|---|---|
| Project Name | `beyond-the-archives` | `archives-unfolded` |
| Project ID | `prj_Rb584lKdVjCt7wikZSF1bTCWAujo` | `prj_EoxUyrPPjVqvdZvsir6OeITXbYWM` |
| Owner | The verified team above | The verified team above |
| Git Integration | GitHub: `allisonhelling/beyond-the-archives` | GitHub: `allisonhelling/beyond-the-archives` |
| Verified Production Domain | `beyondthearchives.vercel.app` | `archivesunfolded.vercel.app` |
| Framework / Node Setting | Vite / `24.x` | Vite / `26.x` |
| Vercel Authentication | `enabled=true`, `deploymentType=all_except_custom_domains` | Same |
| Password Protection | `enabled=false`, deployment type null | Same |
| Trusted IP Protection | `enabled=false`, no addresses | Same |
| Custom Environments | Empty returned list | Empty returned list |
| Configured Production Branch | **Not exposed by available project/context responses** | **Not exposed by available project/context responses** |

Git linkage is independently verified by `get_git_deployment_context`; the compact `get_project` response omits `link`, so its absence there is not evidence of a disconnected repository. `list_project_domains` independently confirms both production domains are verified, without a branch or custom-environment assignment.

Production history provides useful but narrower evidence: the latest three production deployment records for **each** app are READY and have Git ref `main`. The latest returned production SHA for both is `4d225ab9f064495bf195be7b8408805e16fc4a2a`. This corroborates observed production behavior; it does **not** substitute for reading the current configured Production Branch. The latest existing deployments are staging SHA `7a79f58b1c49e62d0ef411545c9a4011096c7f6c`, ref `staging`, target null (Preview in these Vercel records), state ERROR, `errorCode=failed_config_load`, `errorStep=buildStep`. The initial metadata audit did not read build logs; the subsequent authorized investigation below now identifies the immediate failures.

Both stable aliases were read from deployment metadata **and** independently checked with project-scoped `get_alias`:

| App | Verified Branch Origin | Current Referenced Deployment |
|---|---|---|
| Organizer (`O`) | `https://beyond-the-archives-git-staging-allisonhellings-projects.vercel.app` | `dpl_4mio1pBFomZvpQFCfBuA94K5YZyp` (ERROR) |
| Reader (`R`) | `https://archives-unfolded-git-staging-allisonhellings-projects.vercel.app` | `dpl_4nasitQigwXvTM2RpdCWB6ubvZBL` (ERROR) |

These are actual provider-returned aliases associated with the correct project IDs, not inferred names. Their existence does not establish a working application, successful HTTP response, correct headers or connected-login acceptance.

#### Environment Names, Scopes And Inheritance

Organizer inventory contains **22** entries and `hiddenProductionEnvCount=0`:

| Source / Scope | Variable Names | Finding |
|---|---|---|
| Project-managed Preview, type `encrypted` | `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_REF`, `VITE_APP_ENV` | No Git branch restriction returned; `configurationId=null`. Values were not inspected, so their actual selected backend/key is not attested. |
| Project-managed Production, type `encrypted` | `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL` | Production-only targets; values uninspected. |
| Supabase integration, Production-only, type `sensitive` | `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PASSWORD`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY` | All seven returned credential entries target only Production. No values decrypted or printed. |
| Supabase integration, Production-only, type `encrypted` | `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_DATABASE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Nine remaining integration entries; no Preview target returned. |

Reader inventory returns **zero entries**, also with `hiddenProductionEnvCount=0`. Neither app lists `VITE_ORGANIZER_URL` or `VITE_READER_URL`. Separate `gitBranch=staging`, `decrypt=false` inventory requests return zero entries for both projects: no staging-specific overrides are returned. This does not mean organizer's unscoped Preview defaults cease to apply to staging; it does mean an exact staging-only six-variable profile has not been established by this inventory.

Team integration inventory contains one external Supabase configuration, `icfg_cFzDptCmQVs0ckhtt2gH6Vtx`, matching the organizer variable source. Its `projectSelection` is `all`; declared scopes include read/write project environment variables and deployments, integration configuration/resource/check access, and read team/project/user access. Broad integration eligibility does not demonstrate that credentials are currently injected into the reader or Preview. It does require review of future integration inheritance before asserting enduring separation.

The returned project inventories expose no shared-variable linkage metadata. The available MCP tool set has **no shared-variable list/inheritance audit tool**. `get_shared_env_var` requires a known shared-variable ID and retrieves a decrypted value; it was deliberately not called for this names/scopes audit. `get_team` returns only identity/SAML metadata, without shared variables or secret-enforcement policy. Therefore complete team/shared inheritance, external secret-fetch permissions and production-credential inaccessibility are **not verified**. The narrower verified fact is that the listed project/integration server credentials are scoped Production-only, not Preview.

#### Hooks, Build Overrides And Protection Limits

- `get_webhooks` returned an empty team webhook array. These are outbound Vercel event webhooks, **not Git deploy hooks**. No deploy-hook listing tool is exposed, and `get_project` omits deploy-hook configuration. Git deploy hooks, their target branches and external promotion automation remain unverified; no hook URL/secret was requested or printed.
- `get_project` returns framework and Node versions but omits root directory, install/build/output overrides, ignored-build command, outside-root source access, auto-exposed system-variable settings and Production Branch. `get_deployment` also omits these settings and `gitSource` despite `withGitRepoInfo=true`. Its Git ref/SHA metadata remains available. No permission-denied error occurred; these are unavailable response fields/tool capabilities, not evidence of missing settings.
- Repository settings remain organizer `npm run build` / `dist` and reader Vite with `npm ci --include=dev --prefix .. && npm ci --include=dev`, `npm run build` / `dist`. These are source configuration, not verified effective Dashboard overrides. Reader root/outside-root access must still be confirmed.
- Authentication/password/IP protection settings are verified as reported above. No protected website was fetched, bypass token generated or protection setting changed. Effective callback/iframe access for a tester remains untested. Keep protection unchanged unless a concrete Preview-only adjustment is separately reviewed.
- No role/promotion-permission or external CI credential audit was performed. Existing S1 build guards do not prove an infrastructure operator cannot manually promote or reassign domains.

No additional hosted read approval is needed within this audit scope, but completing the missing items requires an authenticated interface that actually returns those settings, or a redacted Dashboard export of Production Branch, Git deploy hooks, build overrides and team/shared variable scopes. Do not request secret values. Release approval remains blocked on this evidence.

#### Local Preparation And Failure Investigation Follow-Up

The user authorized continued read-only inspection, local preparation and local tests, without hosted mutation or push. The supplied follow-up evidence confirms both branch hostnames; it does not include Production Branch, deploy hooks, build overrides or shared-variable scopes. Those specific Dashboard evidence gaps remain open. Fresh project/environment reads still show 22 organizer entries, zero reader entries, zero staging-specific overrides, no listed non-`VITE_` Preview credentials, unchanged protection, and the same two failed Preview deployments. No production-credential exposure was demonstrated in the listed entries; complete shared/integration/CI isolation and promotion permissions remain unproven.

`list_deployment_events(builds=1)` returned 37 organizer and 51 reader events for the two known failed **staging** deployments. Only redacted diagnostic summaries are retained:

| Deployment | Verified Immediate Failure | Additional Build Evidence |
|---|---|---|
| Organizer `dpl_4mio1pBFomZvpQFCfBuA94K5YZyp` | `Explicit application origins are required.` Stack passes through `environmentOrigin`, `requireEnvironmentConfig` and `validateBrowserEnv` during Vite config loading. | Git ref `staging`, commit `7a79f58`; build invoked `tsc -b && vite build` from `/vercel/path0`. Logs say package engine selection used Node `26.x`, overriding the Dashboard `24.x` setting. |
| Reader `dpl_4nasitQigwXvTM2RpdCWB6ubvZBL` | `Set explicit environment, project reference, backend and public key configuration.` Stack passes through the shared environment validator during Vite config loading. | Git ref `staging`, commit `7a79f58`; reader build invoked `tsc --noEmit && vite build` from `/vercel/path0/reader`. Logs show install command `npm ci --include=dev --prefix .. && npm ci --include=dev`. |

These failures are the intended fail-closed behavior, not justification to remove validation. The organizer inventory lacks sibling-origin variables; the reader inventory lacks the full profile. Preparing the six explicit bindings for each project addresses the observed missing configuration, but no hosted rebuild has verified the fix or ruled out later failures. Build logs corroborate these particular commands/paths at that commit, not every current Dashboard override. The broad package engine range allows automatic Node-major upgrades; local checks used Node `v25.6.1`, so matching the remote Node 26 runtime remains unverified. No engine or production setting was changed.

Prepared **local-only** artifacts:

- Root and reader `.env.staging.local` now contain matching verified staging public settings, both actual branch origins and `EXTENSION_APP_ORIGIN=O`. Only the existing staging profiles were completed. Content hashes confirm `.env.local`, `.env.local.hosted`, reader `.env.local` and both active `vercel.json` files are unchanged.
- `artifacts/staging/preview-bindings.json` contains exactly two proposed `create_project_env` payloads, one per verified project ID, with six bindings each. Every entry has `target=[preview]`, `gitBranch=staging`, `type=encrypted`; both payloads use `upsert=false`. This ignored file includes the public staging key but no server credentials. It has **not** been submitted. Reinventory exact branch bindings immediately before any approved submission; reject an unexpected conflict instead of overwriting a default or Production variable.
- `artifacts/staging/organizer.vercel.json` and `reader.vercel.json` contain the exact staging header candidates. They preserve build commands, output directories, rewrites, normal-page framing denial, bridge cache/referrer policy and existing routes; only sibling framing origins and existing wildcard backend origins change. Active working-tree configs remain unchanged.
- Header preparation now replaces the existing frame directives using the selected sibling, so it remains reusable after a staging candidate becomes the source. Tests cover repeat preparation and changing the sibling without retaining the prior one. It does not introduce a parallel header policy.
- Organizer/reader local staging build outputs are under `artifacts/staging/builds/{organizer,reader}/dist`; `local-validation.json` records redacted checks. They use actual staging origins and simulated provider Preview/staging metadata. No application sign-in or backend request was made.

Local validation results:

| Check | Result And Boundary |
|---|---|
| Targeted environment, config, reader connection, ConnectReader, Chrome/Safari build and Calibre import suite | 8 files / **42 tests passed**. The environment file's **9 tests** passed again after the header reuse assertions were added. |
| `npm run test:integration:config` | **13 tests passed**, synthetic/local target checks only. |
| Both full `npm run build -- --mode staging --outDir ...` commands | Passed with the actual completed staging profile. TypeScript and Vite succeeded; no hosted deployment occurred. |
| Output credential scans | All organizer/reader output files passed known production credential, privileged JWT/`sb_secret_`, production API hostname and injected server-secret canary checks. A standalone production-ref denylist constant is expected code, not a credential. |
| Four negative Vite builds per app | Missing sibling, production sibling, internally consistent Production promotion and privileged browser key each failed closed. |
| Exact-origin candidate/header checks | Both preserve routes/build settings, use only the configured sibling on `/auth/bridge`, retain no-store/no-referrer and omit bridge `X-Frame-Options: DENY`; ordinary pages remain denied framing. |
| Browser CSP fixtures | **4 checks passed**: each app permits its configured sibling bridge and blocks an unapproved ancestor. All HTTPS fixture requests were intercepted locally. This does not verify Vercel protection middleware or live headers. |
| Connected-login browser regression | **12 desktop/mobile tests passed** with synthetic loopback sessions. No hosted Auth/Edge acceptance claimed. |
| Lint / source preservation | `npm run lint` passed. Protected profile/config hashes match; all 129 migrations and production branches/configuration remain untouched. |

Proposed local review commit: `fix: configure isolated staging Preview origins`, parent `7a79f58b1c49e62d0ef411545c9a4011096c7f6c`. Its six-file tree consists of this runbook, the S1 report, shared build/header preparation code and its existing tests, plus the two generated candidates installed **only in the proposed commit tree** as `vercel.json` and `reader/vercel.json`. An isolated Git index prepares the review commit without changing the user's index, current branch or active working-tree headers. Its exact SHA and tree are recorded in ignored `artifacts/staging/proposed-commit.json` and presented for review. Ignored profiles, bindings, build outputs and public-key values are excluded from the commit.

No hosted action is currently approved. Remaining requests, after missing Dashboard/shared-scope evidence is reviewed: (1) submit the two exact six-binding Preview/`staging` payloads on the verified organizer/reader IDs; (2) approve the exact review commit for a `staging`-only push and its two Git Preview deployments, with no promotion or `main` change. Any separate redeployment must name its project/SHA/Preview target. Preview protection remains unchanged. Supabase migrations, Auth, Storage, Edge origins/functions and hosted synthetic fixtures remain a separate stage. No bootstrap release is proposed.

### Stable URLs And Revised Deployment Sequence

Use the independently verified Git **branch origins** in the audit above, rather than unique per-deployment URLs. Branch URLs remain stable across commits. No domain purchase is needed for these generated `vercel.app` addresses; existing plan usage/build limits still apply. [Vercel generated URLs](https://vercel.com/docs/deployments/generated-urls).

**The earlier bootstrap-release proposal is superseded.** Existing failed staging deployment records and project-scoped alias reads already provide both real origins, so no bootstrap deployment is necessary merely to discover them. Preserve the prepared bootstrap source/candidates as an unused fallback; do not deploy them under this audit.

1. Complete the remaining Production Branch, build override, Git deploy-hook and team/shared credential-scope evidence before authorizing a release.
2. Obtain approval for the twelve branch-specific public variable bindings below (six per verified project). Preserve existing unscoped Preview defaults and Production variables.
3. Prepare and review staging header/configuration changes using both verified origins; do not substitute production or synthetic origins. No active configuration change is made by this audit.
4. Test both real application builds locally with actual staging settings. Request approval for the exact reviewed staging commit push and its two automatic Git Preview deployments, or explicitly identified Preview redeployments. Confirm provider target/ref and project identity again immediately beforehand.
5. Verify both successful deployments and effective protected bridge/callback behavior. Until staging backend readiness has been separately approved and verified, frontend publication does not imply functional Auth/library/reader acceptance.

The current plan needs no temporary bootstrap commit, project-wide build-setting change or production fallback. If missing settings require production/shared-scope remediation, stop and present that specific change for separate authorization.

### Proposed Variables And Headers

Proposed approval: create **six branch-specific public bindings per project**, target **Preview**, Git branch **`staging`**, on organizer `prj_Rb584lKdVjCt7wikZSF1bTCWAujo` and reader `prj_EoxUyrPPjVqvdZvsir6OeITXbYWM`, under team `team_mB5Tjb4FpnSFh8QCEAgvtRJV`. Recheck inventory immediately before writing; if exact branch bindings then exist, review their diff rather than blindly replacing them. Do not alter current unscoped Preview entries or any Production/shared setting.

| Variable | Proposed Value |
|---|---|
| `VITE_APP_ENV` | `staging` |
| `VITE_SUPABASE_PROJECT_REF` | `vzqrpjzfwcuuiqxanyoy` |
| `VITE_SUPABASE_URL` | `https://vzqrpjzfwcuuiqxanyoy.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Previously supplied publishable key, independently matched to staging inventory; value intentionally omitted from documentation. |
| `VITE_ORGANIZER_URL` | `https://beyond-the-archives-git-staging-allisonhellings-projects.vercel.app` |
| `VITE_READER_URL` | `https://archives-unfolded-git-staging-allisonhellings-projects.vercel.app` |

Do not manually set/override `VERCEL_ENV`, use `VERCEL_PROJECT_PRODUCTION_URL` as a sibling fallback, or add service-role/database/management credentials to either frontend project. Keep sample mode disabled. `VERCEL_BRANCH_URL`, when exposed, can corroborate the current project's own branch alias; it cannot identify the sibling project's origin. Branch-specific project variables override same-name Preview defaults, but **other Preview/shared variables still remain accessible**. Overrides are not credential isolation. [Environment scopes](https://vercel.com/docs/environment-variables), [shared variables](https://vercel.com/docs/environment-variables/shared-environment-variables), [system variables](https://vercel.com/docs/environment-variables/system-environment-variables).

After aliases are verified, generate review candidates with `npm run prepare:staging -- --organizer ACTUAL_ORGANIZER_ORIGIN --reader ACTUAL_READER_ORIGIN`. The helper derives both configurations from the existing `vercel.json` files, writes ignored `artifacts/staging/organizer.vercel.json` and `reader.vercel.json`, refuses missing/invalid/same origins and never overwrites an existing artifact. The `vercel.app` suffix check is syntax validation, not proof of alias ownership; authenticated verification remains mandatory. The command does not install active configs or contact Vercel. Review the generated diff before making the approved staging-branch edits. Organizer `frame-src` allows only self and `R`; reader `frame-src` allows only self and `O`. On `/auth/bridge`, each `frame-ancestors` allows exactly its staging sibling. Keep ordinary pages unframeable and keep the bridge outside the blanket `X-Frame-Options: DENY` rule. Preserve bridge `no-store`/`no-referrer`, organizer `/auth/connected`, reader `/auth/authorize`, SPA rewrites, cache behavior and existing non-origin security directives. Existing wildcard backend connect directives become the staging HTTPS/WSS backend where present; no blanket reader CSP is added that could break local EPUB/blob or loopback Calibre behavior. Test effective headers on root, direct callback/bridge routes and rewritten routes. Production configuration on `main` and deployed production artifacts remain untouched.

### Preview Isolation And Promotion Controls

The shared build validator, used by both Vite entrypoints, now checks provider Git/environment metadata: branch `staging` requires provider scope `preview`, declared app environment `staging` and the verified staging backend ref. Missing provider environment/branch metadata, conflicting target metadata and production scope fail closed even if inherited Production variables are internally consistent. The shared runtime origin guard now covers staging as well as production, preventing connected clients on production or arbitrary deployment origins. Immutable deployment URLs are rejected unless explicitly configured; use the verified branch origins for connected testing. Local/sample behavior is preserved. These are local source changes, not deployed protection.

Earlier `npm run prepare:staging -- --bootstrap` work generated ignored organizer/reader bootstrap candidates using the dependency-free `scripts/staging-bootstrap.mjs`. They remain an unused fallback; the verified existing aliases remove the current need for a bootstrap release. Neither candidate is installed as an active `vercel.json`.

Ignored root and reader `.env.staging.local` files are now complete with the explicit verified staging ref/URL/public key and actual sibling/extension origins, as recorded in the follow-up above. No guessed origins or production profile was substituted. Existing `.env.local` and `.env.local.hosted` were preserved. Do not use `vercel env pull` to overwrite these or the local profiles.

The audited projects must retain a non-staging Production Branch and have no hook, domain mapping or external automation promoting staging. Preview-to-Production is a separate deployment operation; build guards are not proof that a privileged operator cannot reassign domains or bypass Git. Inventory effective promotion permissions and require a separate protected production release path. Do not claim that manual promotion is impossible merely because environment variables are Preview-scoped. If stronger enforcement needs a production permission/settings change, report it for separate authorization. [Vercel promotion behavior](https://vercel.com/docs/deployments/promoting-a-deployment).

To prove credential inaccessibility, inspect all effective Preview/project/team/integration/CI scopes, including non-`VITE_` variables, Supabase management tokens, service-role/secret keys, database URLs/passwords and external secret-fetch permissions. Frontend builds require none of these. Production service credentials must be excluded by provider scopes/access policy before **any** bootstrap or app build. Do not merely blank/override them or hide them from the bundle. If production credentials are currently available to Preview and removing them affects a shared/production scope, record the blocker and obtain separate approval; reuse of the projects does not waive this gate. Current local artifact scans do not establish hosted inaccessibility.

Review existing Preview protection without disabling it globally. Test access to both protected origins, callbacks and embedded bridges with the intended tester identity; provider protection must not intercept one sibling's bridge and silently break connected login. Any required Preview protection adjustment needs a specific approval. Never put a Vercel automation bypass secret in browser variables, iframe URLs or companion artifacts.

### Auth Values, Validation And Approval Requests

Actual origin-dependent values are now known. These remain proposals requiring separate Supabase approval:

- Staging Supabase Site URL: `https://beyond-the-archives-git-staging-allisonhellings-projects.vercel.app`.
- Staging redirect allowlist: `https://beyond-the-archives-git-staging-allisonhellings-projects.vercel.app/auth/callback` and `https://archives-unfolded-git-staging-allisonhellings-projects.vercel.app/auth/callback` only, for the inspected signup/recovery/email-change/invitation flow. No production origin, wildcard or invented callback.
- Staging Edge origins: `APP_ORIGIN=https://beyond-the-archives-git-staging-allisonhellings-projects.vercel.app`, `READER_ORIGIN=https://archives-unfolded-git-staging-allisonhellings-projects.vercel.app`.

No Supabase settings were changed during this audit. Companion staging builds later reuse these origins and `EXTENSION_APP_ORIGIN=O`; use separate artifacts/profiles/pairing and preserve extension-only AO3 retrieval, Calibre destinations, reader isolation and Universal Stories. All 129 migrations remain unchanged.

Required checks before the application push: real organizer/reader builds with actual staging variables; output scans for known production credentials, privileged JWTs/keys and injected server-secret canaries; wrong branch/scope/backend/missing-variable build rejection; staging-runtime origin denial; regression checks of production header source values; bridge framing/login tests; reader cloud/Calibre and relevant companion configuration tests. Reuse existing tests/validators and extend only the missing behavior. After separately approved deployments, inspect actual target/ref/aliases, effective headers and the final hosted artifact. Tests requiring hosted Auth/Storage/Edge readiness remain pending until the separately approved backend exists.

Approval requests must be staged and concrete:

1. **Remaining settings evidence:** complete configured Production Branch, Git deploy hooks, effective build overrides and team/shared scope verification through read-only access/redacted export. No new permission request is needed for ordinary read-only inspection, but these fields are not currently obtainable through the exposed MCP tools/responses.
2. **No bootstrap release requested:** both real aliases and project IDs are independently verified already.
3. **Preview variables:** approve the twelve exact public bindings in the table above for the two verified project IDs, Preview/`staging` only. No Production/shared scope edit, protection bypass or deployment is bundled into this request. Any necessary scope/protection remediation needs its own exact diff and approval.
4. **Application release:** approve the exact final staging SHA push and two application Preview deployments after local checks. No promotion, `main` merge, production alias assignment, paid upgrade, new project/domain or production redeployment is included.
5. **Separate future Supabase request:** literal Auth/origin settings, migration/function/allowlist actions and synthetic acceptance tests remain outside Vercel approval.

Rollback is limited to the approved Preview resources: retain pre-change redacted settings and Preview deployment IDs; restore a known safe branch Preview deployment or static bootstrap, and reverse only the added staging-scoped variables/configuration after approval. Never use a production rollback/promotion control for staging cleanup. Keep production domains, variables and branch settings unchanged.

## Remaining Verification Gaps

### Hosted Staging Intake — 13 November 2026

This is a preparation plan, not hosted mutation approval. Authenticated read-only `supabase projects list --output json` independently verified the following identity. Read-only project API-key inventory matched the supplied publishable key in memory; no key values were logged or written to repository files.

| Environment | Verified Identity And Targets |
|---|---|
| Staging | `beyond-the-archives-staging`, ref `vzqrpjzfwcuuiqxanyoy`, region `us-east-1`, `ACTIVE_HEALTHY`, created 13 November 2026. API origin: `https://vzqrpjzfwcuuiqxanyoy.supabase.co`. Organizer/reader branch aliases are now independently verified in the Vercel audit above; current referenced staging deployments are failed. |
| Production | `Beyond the Archives`, ref `pnrdztfydurupcqwumvr`, region `us-east-1`, `ACTIVE_HEALTHY`. API origin: `https://pnrdztfydurupcqwumvr.supabase.co`. Organizer: `https://beyondthearchives.vercel.app`; reader: `https://archivesunfolded.vercel.app`. |
| CLI Link | Still production, confirmed by both authenticated inventory and ignored `supabase/.temp/project-ref`. Not changed. Never use an unqualified linked deployment. |
| Local Apps | Root and reader `.env.local` remain loopback/local. Existing `.env.local.hosted` still selects production; it is unsuitable for staging and was not modified. |

Project/key identity and both Vercel project/branch-alias identities are verified. Database emptiness, migration history, remote Auth/Storage/function settings, Supabase billing tier, effective Vercel build overrides and complete provider secret access scopes remain unverified. A newly created project is not evidence that it contains no production data. No remote data, schema or settings were mutated during intake or the Vercel audit.

#### Missing Inputs And Dashboard Configuration Plan

The Vercel audit now identifies both actual HTTPS branch origins and project IDs; no user-supplied or guessed application origin is needed. Remaining inputs are a controlled SMTP/test-mail destination with synthetic recipients and the missing provider settings evidence listed above. Do not paste SMTP passwords, database passwords or service-role keys into documentation or chat. Confirm the staging Supabase project owner/billing arrangement; incremental compute, email, Storage and Vercel usage costs have not been established. No plan or billing change is proposed by this intake.

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

Approval is still required for each concrete hosted migration, Edge deployment, Auth/Storage setting, synthetic data/allowlist mutation, secret provisioning, GitHub environment change and Vercel project/domain/configuration action. Jobs and destructive cleanup require separate approval. Actual app origins are known, but missing email choices, unverified database state and remaining provider settings/scope gaps still prevent complete release approval; stop at this preparation plan.

Rollback preparation: record redacted staging-only pre-change settings and exact migration/function artifact versions before applying changes. If staging validation fails, stop staging deployments/jobs, revoke staging-only pairing credentials and remove only identified synthetic fixtures through an approved guarded cleanup. Reverse application/settings changes using recorded staging values. Applied migrations require a reviewed forward repair or separately approved recreation of a verified disposable staging project, never an automatic hosted reset or production rollback. Disable staging deploy hooks before any separately approved resource deletion; retain production untouched. No cleanup or deletion is authorized by this plan.

Hosted GitHub/Vercel/Supabase protections, secret scopes/access holders, migration drift, installed artifacts, Auth hook activation/SMTP/redirects, actual Storage policies/blobs, schedules/external worker hosts and independent recovery remain as recorded in the [S0 audit](BASELINE_AUDIT.md). S1 repository changes do not retroactively prove hosted protection. Missing legacy E0–E5 reference checklists still prevent item-by-item mapping; preserve the S0 area ownership table and import the original items when available.

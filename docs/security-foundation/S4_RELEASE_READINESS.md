# S4 Release Readiness

**Decision: BLOCKED FOR PRODUCTION.** S4 on `security/04-release-validation`, based on `e94db86` (S3), is reviewable preparation. The user subsequently approved read-only Supabase/Vercel/GitHub release-metadata discovery; results below supersede the initial unknowns. No hosted mutation, deployment, credential rotation, hosted owner transition, push or merge was performed by the agent. Local role transitions used synthetic test accounts only. Current local refs: `main=4d225ab`, `staging=e94db86`; the user merged S3 into staging during the pause. Provider-side protection/secret changes were observed afterward; the agent did not perform them.

The [Production Rollout Runbook](PRODUCTION_ROLLOUT_RUNBOOK.md) is authoritative for target verification, approval classes, preflight, deployment order, backup coverage, privacy smoke, abort triggers and recovery. [S2](S2_APPLICATION_RBAC.md) and [S3](S3_OWNER_ONLY_PRIVACY.md) remain the detailed role/privacy contracts.

## Scope And Changes

- Reviewed the complete ordered migration chain, beta/username/Auth/reader triggers, roles/MFA/bootstrap/audit, Storage, error handling, backup/restore exclusions, protected local/staging command boundaries, CI and organizer/reader/companion/worker dependencies.
- Added five embedded PostgreSQL release tests for a clean 130-file replay, populated 129→130 and observed production-prefix 127→130 upgrades, preservation of every existing SQL function/policy, and continued use of the sole account before/after controlled owner bootstrap.
- Extended the existing header derivation once for both hosted environments. `productionVercelConfig` creates exact production-origin/backend candidates; existing staging callers retain their API and share the transformation. A regression verifies no active-file mutation, route/bridge preservation, idempotence, and rejection of foreign/wildcard backends.
- Closed an aggregate CI gate gap: `checks` now waits for and requires the Supabase live security/recovery job and the entire Calibre OS matrix. The existing environment-isolation test enforces inclusion/success of every validation job. This CI change is source-only; current hosted branch/approval findings are recorded below.
- Added offline `npm run prepare:release`: source/migration hashes and production-header candidates under ignored, non-overwriting `artifacts/release/candidate-*/`. It makes no provider/Git changes, loads no environment files and always records `releaseAuthorized=false`.
- Updated backup instructions to reflect existing local-only operator guards and explicit exclusions of Auth/MFA, role/audit records, reader cloud/originals and provider configuration. Removed obsolete implied hosted deployment/pruning instructions in favor of the runbook's separate approval gates.

No SQL migration, RLS policy, application permission, account identity, library behavior or active Vercel config is changed by S4. README was reviewed; operator release procedures belong in the operations docs, so user run instructions did not need changes.

## Migration And Compatibility Evidence

| Check | Status | Evidence And Limit |
|---|---|---|
| Source ordering/uniqueness | PASS | 130 unique filename versions; existing ordered chain reused. Local `main` differs in SQL only by added `20261116000100_application_rbac.sql` |
| Clean local replay | PASS, scoped | All 130 files replay on fresh embedded PostgreSQL using the repository's minimal Auth/Storage contract; resulting 52 public tables/three views and empty role/audit assignments verified |
| Existing-shape synthetic upgrade | PASS, scoped | Build/populate the preceding 129-file shape and apply S2: snapshots, prior functions/policies and default User preserved. Separately populate the observed 127-file production shape, apply its exact three-file suffix, and verify unchanged private/source/queue/reader/Storage/beta table data, no automatic Owner and intended generic-export version 1→2 compatibility |
| Sole-account bootstrap compatibility | PASS | No MFA: bootstrap fails but ordinary library remains usable. With controlled eligible factor: one Owner, normal own-library reads/writes retained. Later forged role metadata still creates a User |
| Real local stack baseline | PASS for observed baseline | Verified fixed synthetic target on loopback; 130 applied migrations, two existing synthetic Auth users, zero Owners before S4 service tests. Completed GoTrue/PostgREST/Storage/Edge checks are separate from embedded replay |
| Fresh managed-service reset | NOT CLAIMED | Existing synthetic volumes/accounts are preserved. Embedded replay does not model all managed Auth grants, provider encryption or full GoTrue/Storage initialization. Approved hosted clean/upgrade testing remains mandatory |
| S2/S3 schema compatibility | PASS locally | Additive role/audit schema preserves personal ownership rules and old library APIs; S3's only runtime fix withholds reader-inbox log details. No schema downgrade required for old clients |
| Backup compatibility | PASS locally for scoped drill | v1/v2 account exports/restore, synthetic reader annotation/original hash and association; full Auth/config/whole-project recovery remains unproven |
| Production CSP candidate | PASS as offline preparation | Active configs contain staging bindings. Derived candidates target exact intended production sibling/backend, preserve route/build/header protections and reject foreign/wildcard backend residue; not installed/deployed |
| Hosted migration prefix / catalog / settings | PASS for metadata inventory; rollout BLOCKED | Identity-verified production has an ordered 127-file prefix with three pending migrations; 184 public routine definition hashes and 40 policies match that source prefix. Staging has no application schema. This is not authenticated runtime acceptance or full applied-file checksum attestation |

Repository migration-chain SHA-256: **`c98caaae3b8b7f81f86ff135e546c3342a4aa466e59f6040c86d6f841cc97575`**. S2 file SHA-256: **`7068fc87b1318f17d55684f375aefc7deaa3a7b506e2a663cbbcc452ac2cee8e`**. Regenerate after SQL changes. The manifest includes each file hash; no assumption is made that every file is pending remotely.

The reviewed lockfiles resolve organizer/reader React and React DOM `19.3.1`, Vite `7.3.7`, TypeScript `5.9.3` and Vitest `4.1.12`; the organizer Supabase client and tracked Deno v5 lock both resolve `2.117.3`. Reader reuses the existing organizer transport/environment boundary rather than installing a competing backend client. Companions reuse the root build/protocol code; Calibre uses its existing Python implementation. Local builds and protocol/RPC tests establish source compatibility, not installed-client or hosted-provider acceptance. The retired Node worker throws on startup, the Edge tombstone returns 410, and the retirement SQL remains a separately approved job action outside the migration chain. No dependency or lockfile is changed by S4.

The embedded contract is actual PostgreSQL SQL/RLS/constraint execution but a minimal Supabase service model. Its synthetic Storage rows do not contain object bytes, and its factor records do not perform real TOTP. Actual local S2/S3/service drills provide those separate runtime checks. Hosted installation privileges, history reconciliation and provider behavior still need independent acceptance.

## Test Results

Local tools: Node `v25.6.1`, npm `11.9.0`; repository CI targets Node 22. Browser tests use installed Chromium and synthetic loopback profiles. Local runtime tests use no real user library or production session. Separately approved discovery uses existing provider authentication in memory and stores only allowlisted metadata. Runtime reports must be read with their test-model limits. The earlier full-suite results below remain evidence for the exact implementation: all 14 S4 source/document files were reconciled byte-for-byte against the original candidate manifest after stash restoration. After reconciliation, documentation and the shared migration fixture were extended to cover the observed 127-file prefix; application runtime/build/CI source remains identical to the earlier passing candidate. The resumed focused/config/lint/build results are recorded separately.

| Suite / Command | Status | Result |
|---|---|---|
| `npx vitest run supabase/tests/release-migrations.test.ts src/lib/environment.test.ts` | PASS | 15 tests on resume, including five migration tests and one production-header regression |
| `npm run lint` | PASS | Final source check completed without errors/warnings |
| `npm run prepare:release` | PASS | Ignored candidate configs/manifest created; no active configuration/provider mutation; final manifest regenerated after documentation/testing |
| `npm run test:e2e` | PASS with explicit skips | 380 passed, 42 skipped; desktop/mobile, including performance fixtures. Sample suites run separately below; remaining skips are viewport/desktop-extension conditions |
| Connected-login browser suite | PASS | 12 tests with `playwright.connected-login.config.ts`; synthetic independent-session and handoff checks |
| Organizer sample browser suite | PASS on serial rerun | 38 tests, desktop/mobile, one worker; full sample and manual-story suites after the unit suite |
| Reader browser suites | PASS | 110 reader browser tests (including cloud/Calibre/association), plus four reader sample tests; run from `reader/` with its own Playwright dependency |
| Organizer offline browser suite | PASS | Two tests using `playwright.offline.config.ts` |
| Independent reader unit configuration | PASS | 107 tests in 12 files from `reader/`; in addition to reader files covered by root Vitest |
| Large-library database benchmark | PASS for existing assertions | 10,000 works per account, three accounts, 31 query variants; shelf/count and cursor/offset identities verified. PGlite single-process timings are not hosted acceptance |
| Large-library backup benchmark | PASS for data integrity; release latency BLOCKED | 10,000 works; 47,624,840 bytes JSON / 4,236,734 gzip, export 4,160 ms; empty restore 57,260 ms, replacement 62,786 ms. Every table row and search-document count verified. Embedded timing does not attest actual API budgets; see S4-H06 |
| Companion builds | PASS | Chrome local profile and Safari synthetic HTTPS build, using existing shared browser test profiles; no hosted request |
| Standalone Edge `deno check` | BLOCKED locally | Deno CLI is absent. Existing CI runs Deno 2 with the tracked lockfile; actual local Edge compilation/handler checks passed, but are not a substitute for this type check |
| Initial concurrent unit/sample execution | FAIL, followed by passing separate runs | Six unit failures and two desktop sample failures; exact scope and remaining stability risk recorded below |
| Full unit/database/reader/companion regressions | PASS on resumed full run | 2,143 tests in 189 files; five migration checks included by existing `npm test` / CI `npm run check`. Earlier pre-pause full run passed 2,142 before the observed-prefix regression was added |
| Real local S2/S3/Auth/Storage/Edge/recovery | PASS, scoped | Local migration/lint, 30 integration checks, live RBAC/MFA/concurrency checks, 380 authenticated privacy checks, Edge account/login/retired-worker checks and account/reader byte-hash restore drill. Fixtures cleaned up; no lasting Owner |
| Configuration/isolation | PASS | 37 tests; target guards, aggregate CI dependencies/results, beta confirmation and anonymous-signup boundaries |
| Organizer build / security check | PASS | TypeScript/Vite and privileged-key rejection/secret canary. Existing >500 kB bundle-size warning remains |
| Calibre tests/build | PASS | 10 Python tests and ZIP build on this Mac; native app/Windows/Linux acceptance is separate |
| Dependency audit | PASS | Organizer and independent reader `npm audit --audit-level=moderate`: zero reported vulnerabilities at test time |
| Hosted CI / native OS matrix | BLOCKED for execution attestation | Release-control metadata inspected below; Node 22 hosted jobs and installed native-device acceptance were not executed by this task |
| Hosted staging | PASS for read-only inventory; runtime BLOCKED | Approved metadata queries completed; zero migrations/users/application tables/buckets/objects/Edge functions. Artifact-specific migrations and runtime tests remain unapproved |
| Production | PASS for scoped metadata discovery; release BLOCKED | Identity/history/catalog/Auth/backup metadata inspected; no account/library rows, operational smoke or mutation performed |
| Resumed focused/configuration/lint/build validation | PASS | 15 migration/environment tests, full 2,143-test regression, 37 isolation/CI-policy tests, lint and organizer TypeScript/Vite build passed after stash reconciliation. Earlier browser/live-service/benchmark evidence remains scoped to unchanged application runtime |

Metadata-only privacy evidence: `artifacts/privacy/local-2026-11-17T04-46-44-829Z.json`, SHA-256 `cc8a4c9a0c433218947519d7da9732385608e03afaf9353c8a451d2c22006667`. The final local aggregate check returned two original synthetic Auth users, zero Admins/Owners and 130 migrations. The temporary Edge runtime was stopped after the checks; the existing stack and volumes were preserved.

The first concurrent unit/browser run failed six unit checks (mostly timeouts) and two desktop sample checks (navigation/loading). Both affected desktop sample tests passed an isolated single-worker rerun without changing assertions or application code. The complete unit and sample suites subsequently passed separate runs (2,142 and 38 tests). Concurrent load is a suspected contributor, not a proven root cause; these checks retain a test-stability risk until repeated CI evidence confirms reliability. Initial failures remain part of the evidence.

Skipped/blocked checks are not passes. Local mocked browser tests do not establish Vercel protection, cross-site hosted session behavior, domain ownership, actual provider variable inheritance, installed native companions, real external email delivery or external AO3/scheduler routing. The runbook identifies their exact staged acceptance scope.

## Authorized Hosted Discovery — 16 November 2026

Read-only discovery was explicitly approved after the initial S4 handoff and resumed after the user's pause. Times below use America/Chicago (CST); artifact filenames use UTC. This permission does not authorize configuration changes, staging migrations/accounts, emails, deployments, restores, rotation, push or merge. Credentials and incidental sensitive settings were filtered in memory; no personal/library/Auth rows, object paths, signed URLs or credential values were exported. GitHub/Vercel secret discovery requested names/scopes, never decrypted values.

### Supabase Identity, History And Privacy Metadata

Both refs independently matched their expected names, `us-east-1`, organization `vosrfpinkplcjgnjmnob` and `ACTIVE_HEALTHY` before any catalog query. SQL used the provider's [dedicated read-only endpoint](https://supabase.com/docs/reference/api/v1-read-only-query), not application RPCs or service-role library queries.

| Target | Observed State At 23:12–23:15 CST | Limit / Required Follow-Up |
|---|---|---|
| Staging `vzqrpjzfwcuuiqxanyoy` | Zero applied migrations; zero public application relations, Auth users, buckets/objects and Edge functions; all 130 source migrations pending; configured staging public key matched in memory | Backend not installed; READY frontend builds do not establish functionality or privacy |
| Production `pnrdztfydurupcqwumvr` | 127 applied source versions, no unknown versions or gaps; 50 public relations, 184 public routines, nine ACTIVE Edge slugs | History is a source-version prefix, not proof of every original applied SQL checksum; no hosted runtime test was performed |
| Prefix comparison | All 184 public routine definition MD5 hashes, 40 policy definitions/roles/commands and 50 public relation names match a fresh local replay of the 127-file prefix | Routine hashes are drift evidence, not artifact authentication or complete schema/grant attestation. Initial policy differences were API serialization of PostgreSQL `name[]` as strings; normalized arrays match |
| RLS/views/grants | All public user-owned base tables have RLS; all three views use `security_invoker=true`; anon/authenticated cannot CREATE in public/auth/storage | Anonymous SELECT grants alone do not prove access through RLS. Actual anonymous/User/Admin/Owner request tests remain a separate staging acceptance requirement |
| Definers / infrastructure roles | 99 public SECURITY DEFINER routines owned by `postgres`; anon/authenticated have no bypass privilege; `service_role` retains infrastructure bypass | Two known service-only throttle routines retain `search_path=public`; API EXECUTE is denied, trusted-schema CREATE is denied. Do not invent broader app-role exceptions |
| Storage | Both production buckets are private with 50 MiB limits; metadata/policies read only | Object-byte recovery and actual signed URL/HTTP denial tests were not performed |
| S2 / Owner state | `public.user_roles` does not exist in production or staging | S2 not applied; no Owner account was queried, bootstrapped or inferred from metadata |
| Jobs | Neither backend has `cron.job` / installed `pg_cron` | This does not rule out external/Vercel schedules. An ACTIVE retired-worker slug does not prove its deployed body returns 410 |
| Backups | Both responses list zero backups, PITR disabled, `walg_enabled=true`, and no physical recovery window | No provider backup/restore readiness is demonstrated; plan, independent copies, key custody and RTO/RPO remain unverified. Do not enable/purchase/restore anything implicitly |

The exact observed production suffix, **not approved for execution**, is:

1. `20261112000300_chapter_total_review.sql`
2. `20261112000400_universal_backup_compatibility.sql`
3. `20261116000100_application_rbac.sql`

The first two are existing Universal Stories dependencies, not new S3/S4 work. Production frontends at `4d225ab` already contain those client behaviors, so this backend compatibility gap predates the proposed S2 release. Reconcile and test the complete observed suffix on staging before requesting a production migration/RLS approval. Do not blindly apply only S2 or assume `main`'s 129-file source equals live history.

Both Auth configurations keep signup closed, anonymous access disabled, email confirmation required and TOTP enrollment/verification enabled. The private-beta creation hook is disabled on both. Production's redirect list includes loopback/legacy/wildcard preview entries; its Site URL is a legacy organizer alias, and custom SMTP is absent. Staging has exact sibling callbacks and Mailtrap configured. Before any approved signup/email test, install/reconcile the hook dependency and prepare exact callback/provider changes; retain closed signup until acceptance. No SMTP value/template, personal email or factor record is in this evidence.

All nine production Edge slugs report `verify_jwt=false`, matching the checked-in per-function configuration. Metadata does not prove deployed handler authentication, body hashes, configured origin values, reader-inbox log redaction or the retired-worker response. Only system Supabase secret names were listed: custom `APP_ORIGIN` / `READER_ORIGIN` are absent. A future function/config release must explicitly review those origin bindings. No operational endpoint or function log was fetched.

### GitHub Controls And Single-Operator Approval

| Read | Current Evidence | Interpretation |
|---|---|---|
| Remote `main` | `4d225ab9f064495bf195be7b8408805e16fc4a2a`; workflow blob `5da735588a1ff16f7f731789b99ba7da8ab141fc` still contains `deploy-database`, linked push and a Production environment reference | Current hosted source can run the secret-selected migration job after its conditions/gate pass. Secret values/project binding were not inspected. The S3/S4 source removes that job; retain removal in the final merge |
| Secret placement at 23:34–23:35 CST | Production environment lists `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`; repository secret count is now zero; Preview environment secret count zero | Earlier 23:15 repository-secret evidence is superseded. Names/placement verified; values, project binding, token resource scope and org/integration alternatives remain unverified |
| Production approval at 23:35 CST | One required reviewer; `prevent_self_review=false`; custom deployment-branch policy; `can_admins_bypass=true` | Matches the user's single-operator requirement for deliberate self-approval. Administrator bypass remains available; disabling it needs explicit settings approval. This is not independent two-person review |
| Production branch policy at 23:38 CST | Exactly one allowed branch: `main` | Verified environment restriction; not branch protection |
| Main/rules at 23:34–23:35 CST | `main.protected=false`; zero repository rulesets and zero effective branch rules | PR/check/review requirements are not enforced by branch protection. A separately approved plan must fit the sole operator; do not require an unavailable second approver |
| Other controls | Workflow-token default permission read; workflow PR approvals disabled; Actions allows all actions; zero listed repository hooks | These do not restrict Vercel auto-deploy, all infrastructure credentials or administrators' ability to reconfigure settings |

The agent made none of the observed settings/secret changes. Moving a credential into Production does not narrow its Supabase resource scope. Never delete/recreate/rotate a secret automatically to “verify” it. No stored GitHub secret value is recoverable through this metadata audit.

### Vercel Identity, Builds And Configuration Limits

Verified both documented project IDs under team `team_mB5Tjb4FpnSFh8QCEAgvtRJV`; team metadata lists one OWNER. Latest refreshed staging deployments are READY at S3 commit `e94db86d27e50db6bc93c3f0496dac32965a7a97`: organizer `dpl_GDDRHEpHQJ8NcDGhyv775aThD8NE`, reader `dpl_5tWGEYmb5VUAHJTabm6UDkshmGYC`, each carrying its documented staging alias. Latest production records remain READY at `4d225ab`, with exact intended production aliases: organizer `dpl_9WRFbW4DiQoev86ANkNJZ1mTExGa`, reader `dpl_4bArWtzXsufQJc9aLRk2qvLgipA9`. No deployment was fetched as a website or promoted.

Organizer uses Node `24.x`; reader uses `26.x`; local validation used Node 25 and CI targets 22. The package engine ranges accept these versions, but neither Node 26 production execution nor an agreed common runtime has been validated by this task. Any provider runtime change is separately approved.

Each app has six encrypted, Preview-only, `gitBranch=staging` public configuration names. Organizer additionally has four unscoped Preview public names and only two Production `VITE_` names (backend URL/public key): four required Production bindings are absent. Reader has no Production variables among its six listed entries: all six required bindings are absent. Values were not decrypted, so fallback/shared bindings and key ownership cannot be inferred. Listed organizer server/DB credentials are Production-only; none were listed in Preview. The Supabase integration remains `projectSelection=all`, with environment-variable/deployment write scopes, so this narrow inventory does not establish enduring credential separation.

Both projects report Vercel Authentication protection `all_except_custom_domains`, no password protection and no trusted-IP protection. Those settings were not changed. Project/expanded deployment responses omit effective Production Branch, root/build/install/output overrides, ignored-build settings, system-variable exposure, Git deploy hooks and promotion permissions. Shared-variable inheritance is not exposed by the connector; access-group inventory is unavailable. Zero **event webhooks** does not prove zero **Git deploy hooks**. GitHub's Production approval does not establish a Vercel release gate. These are recorded capability/evidence gaps, not proof of absent settings.

### Evidence And Supersession

Ignored, metadata-only evidence lives under `artifacts/release/discovery-2026-11-17T05-15-36-528Z/`: `supabase-github.json`, `prefix-comparison.json`, `metadata-queries.json`, `github-follow-up.json`, `github-current.json`, `github-branch-policy.json`, and Vercel initial/current snapshots. Initial snapshots remain historical; `github-current.json` / `github-branch-policy.json` and `vercel-current.json` supersede overlapping fields. The ignored `evidence-manifest.json` records SHA-256 for the eight evidence files. Vercel project/environment/protection fields reflect initial discovery; only staging deployment metadata was refreshed after the pause. Source hashes in a newly generated offline candidate are independent of these provider snapshots and still record no live attestation or release authorization. Recheck identities/settings immediately before any future approved action.

## High-Severity Release Blockers

| ID | Status | Risk / Required Closure |
|---|---|---|
| S4-H01 | PARTIALLY MITIGATED; BLOCKED | Production now has one required reviewer, self-review allowed, only `main` permitted, and no repository secret copies. Main is still unprotected, admin bypass remains enabled, remote main retains the linked migration job, and Vercel/integration auto-release/credential boundaries remain unverified. Retain source job removal; obtain separately approved, sole-operator-compatible protection and provider gate plans |
| S4-H02 | INVENTORY COMPLETE FOR SCOPE; EXECUTION BLOCKED | Production identity/127-prefix/routine-policy catalog verified; three pending migrations and frontend/schema mismatch now known. Original applied-file checksum/complete schema-grant reconciliation, secret target binding, Edge bundle identity, exact reviewed staging/production plans and protected production executor remain absent |
| S4-H03 | BLOCKED | Provider inventory lists no available backups/recovery window and PITR disabled. Independent Auth/MFA/UUID/key, actual Storage byte/metadata, role/audit and config/job recovery, encrypted retention/custody and approved RTO/RPO remain unproven. Account JSON is not disaster recovery |
| S4-H04 | BLOCKED | Staging is still empty despite READY S3 frontends. Full 130-file clean and populated hosted upgrade, managed trigger privileges, four-role/MFA/Storage/Edge matrix, private-beta/email and protected sibling/native-device acceptance are not approved/executed |
| S4-H05 | OFFLINE MITIGATION READY; BLOCKED | Active CSP remains staging-specific; exact production candidates are prepared but not installed. Required listed Production public bindings are missing (organizer four, reader six); current origin secret names absent, production callbacks include legacy/wildcard/loopback entries, beta hook disabled, and Node versions differ. Exact config/build/deploy approvals and verification remain necessary |
| S4-H06 | BLOCKED | 10,000-work replacement restore measured 62,786 ms in PGlite against the functions' configured 60-second budget; empty restore 57,260 ms. This is a measured local risk, not proof of hosted timeout behavior. The live integration guard rejects external large fixtures. Require approved generated synthetic staging HTTP/Storage/restore tests within explicit budgets and a narrow forward fix if reproduced. No timeout was raised |

Additional risks: 10,000-work local full-text query 5,011 ms / filtered count 5,380 ms; no hosted latency/concurrency threshold accepted. S3's generic reader-inbox logging is source-only until separately deployed/verified. Signed URLs remain capabilities until expiry. Audit retention/off-project preservation, rate limiting, managed installation privileges and independently recoverable credentials remain prerequisites. No app role is an infrastructure bypass and no RLS exception is proposed.

## Review Stop And Remaining Approvals

The approved read-only discovery is complete for accessible interfaces; missing provider fields are explicit gaps. The next review should settle exact release-control/configuration evidence and an artifact-specific staging plan. No further permission to inspect the same approved metadata is needed, but mutations, staging accounts/runtime tests, emails, migrations and deployments are outside that class.

A single-operator GitHub hardening proposal must preserve self-approval, require the intended branch/check policy, explicitly address administrator bypass and verify Production-scoped credentials without reading values. Vercel Git/integration/alias controls require separate evidence and approval; they are not covered by GitHub's gate. Do not enable a generic production workflow as part of ordinary CI.

Each hosted configuration change, staging migration/RLS grant, function slug, account/email/runtime fixture, production migration/RLS change, Edge deployment, Vercel Production artifact/alias, owner transition, worker action, recovery action or credential rotation requires its exact explicit approval, fresh target identity and scoped post-action verification. No production release approval is requested while these high-severity blockers remain. Stop for review; no automatic push or merge.

# Production Rollout Runbook

**Status: BLOCKED — preparation only.** This runbook does not authorize a release. S4 source preparation on `security/04-release-validation` is local. The user separately approved read-only Supabase/Vercel/GitHub release-metadata discovery; the readiness report records its findings and supersession. The agent performed no hosted mutation, migration, configuration change, deployment, credential rotation, push or merge. The [readiness report](S4_RELEASE_READINESS.md) owns current results and blockers. Historical approvals for S1 staging setup do not authorize S2/S3 staging validation or any production action.

## Authority And Target Contract

Application User/Admin/Owner authority never grants Supabase dashboard, PostgreSQL migration, `service_role`, provider administration or deployment privilege. Release execution requires a separately authorized infrastructure operator and provider-enforced credential/approval boundary. The user is the sole operator: deliberate self-approval is permitted, but is not independent two-person review. Personal libraries remain account-owned for every application role.

| Target | Expected Identifier / Origins | Required Fresh Verification |
|---|---|---|
| Local synthetic | Project ID `beyond-the-archives-local-synthetic`; API `http://127.0.0.1:54321` | Existing local guard/CLI status; synthetic data only |
| Staging Supabase | Ref `vzqrpjzfwcuuiqxanyoy`, historical name `beyond-the-archives-staging`, region `us-east-1` | Authorized Management API identity/name/region/healthy status, project-bound public key and current history |
| Production Supabase | Ref `pnrdztfydurupcqwumvr`, verified name `Beyond the Archives`, region `us-east-1`; API `https://pnrdztfydurupcqwumvr.supabase.co` | Authorized identity/name/region/account/organization/healthy status and key ownership. Observed organization `vosrfpinkplcjgnjmnob`; recheck it, identity and health before every approved action. A historical ref/profile/CLI link is insufficient |
| Vercel organizer | Historical project `prj_Rb584lKdVjCt7wikZSF1bTCWAujo`; intended Production origin `https://beyondthearchives.vercel.app` | Authenticated team/project ownership, root/build settings, environment, exact commit/artifact and alias assignment |
| Vercel reader | Historical project `prj_EoxUyrPPjVqvdZvsir6OeITXbYWM`; root `reader`; intended Production origin `https://archivesunfolded.vercel.app` | Same checks, including outside-root shared source access and independent reader build |
| Provider team / repository | Historical Vercel team `team_mB5Tjb4FpnSFh8QCEAgvtRJV`; repository `allisonhelling/beyond-the-archives` | Current ownership, workflow permissions, protected release environment, deployment/promotion rights and integration/deploy-hook settings |

An explicit target variable, matching URL string, branch name, local CLI link or prior screenshot is not authenticated target verification. Recheck immediately before **each** approved action with the same credential that will execute it. Conflicting identity, key/project mismatch, unhealthy state, unknown migration history, changed artifact or expired approval stops execution. Reject redirects and log only allowlisted identifiers/statuses. Never display tokens, connection strings, Auth rows, SMTP values, private file paths, library records or raw provider errors.

## Approval Classes

No class below is preapproved by this document. Approval of one row does not cover another. A PR, commit, merge, passing CI, `prepare:release` output, existing staging approval or application Owner session is not production release authorization.

| Class | Explicit Scope Required |
|---|---|
| Read-only hosted discovery | Exact projects/providers; identity/history/settings/privilege metadata; permitted counts/flags; secret-value and personal-row exclusion |
| Release-gate / infrastructure settings | Exact GitHub/Vercel/Supabase integration, auto-deploy/promotion, environment protection, credential-holder/scope or hook changes |
| Production migration | Exact ordered missing versions, SQL bytes/SHA-256, expected before/after history, lock/window impact and recovery evidence |
| Production RLS / grants | Exact policies/functions/EXECUTE/table grants and positive/negative acceptance; include any such changes embedded in a migration explicitly |
| Edge deployment | Exact function slug(s), bundle/source hashes, JWT verification configuration, origins and environment-secret **names**, rollback artifact |
| Vercel Production deployment | Each application separately: project/team, source/built artifact, public configuration/CSP, staged versus alias assignment/promotion, target and rollback ID |
| Hosted Auth / Storage configuration | Exact settings, callbacks, MFA/signup hook, email delivery/templates, bucket flags/policies and object lifecycle. Test emails or synthetic Auth users need explicit side-effect scope |
| Owner bootstrap / recovery / role changes | Verified existing account UUID kept in restricted evidence, eligibility/MFA ceremony, operator approval reference, request UUID, permitted transition and audit verification |
| Worker / scheduler / maintenance | Named process/job/cron, exact credential/project/origin scope, queue limits, start/stop/retirement or prune action; no implicit broad maintenance |
| Credential rotation | Exact credential class/provider, dependent clients/functions/jobs, staged handover, revocation timing and independently recoverable secret handling |
| Backup / recovery execution | Data classes, source/destination, encryption/key handling, retention and destructive restore authority. Production data never enters ordinary staging |
| Post-release production smoke | Approved fixture accounts/objects, Owner participation, writes/deletes, requests/retention and observation limits; no general personal-library read |

Before execution, the release approver records a separate release request. Every mutable class needs its own explicit approval, or an unambiguous separately listed approval line in one request. Changed bytes, target, component scope, recovery plan or window require renewed approval.

```text
Release ID / Approver / Approval Timestamp / Window:
Exact Reviewed Commit / Source Manifest SHA-256:
Target Organization / Project / Ref / Region / Origins:
Fresh Identity Evidence / Timestamp / Operator Credential Scope:
Approved Classes And Exact Operations: NONE UNTIL FILLED AND APPROVED
Migration Prefix / Ordered Missing Files / Per-File And Chain Hashes:
Function Slugs / Bundle Hashes / JWT Settings / Secret Names:
Vercel App / Project / Artifact / Public Config And Header Hashes / Alias Action:
Auth / Storage / Role / Worker / Credential Changes (Each Explicitly Listed):
Staging Evidence / Open Findings / Accepted Residual Risks:
Backup Coverage / Restore Evidence / Retention / Key Custodian / RTO / RPO:
Smoke Scope / Abort Thresholds / Monitoring Window:
Execution Owner / Incident Owner / Recovery Owner / Rollback Artifact:
Approval Expiry / Conditions Requiring Renewed Approval:
```

## Single-Operator Release Controls

The user is the only release operator. Configure a deliberate approval checkpoint that remains usable by that operator; do not silently introduce a second-reviewer requirement or claim separation of duties that does not exist.

| Control | Observed State / Required Release Contract |
|---|---|
| Production reviewer | One required reviewer; self-review allowed (`prevent_self_review=false`). Preserve that deliberate choice for the sole operator |
| Deployment branch | Provider readback verifies exactly `main`; this is an environment restriction, not branch protection |
| Credentials | Production lists the three `SUPABASE_*` deployment secret names; repository copies are now absent. Values, target binding and token scope remain opaque. Do not read, copy, rotate or recreate them to test placement |
| Administrator bypass | Currently enabled. A proposal to disable it, where supported, requires separate explicit settings approval; self-review should remain allowed so the operator can approve |
| Main protection | No branch protection/rulesets currently observed. Prepare separately approved PR and passing-check requirements that work for one operator; a mandatory second approval would block that operator |
| Ordinary CI | Reviewed S3/S4 source has no production deployment job. Preserve this in the final merge. Source-only CI aggregation requires all validation jobs including Supabase and the Calibre matrix |
| Production executor | No approved executor is supplied here. A future manual, protected release path must bind exact reviewed artifacts, target, SQL suffix and operation classes; a manual trigger alone is not authorization |
| Vercel and integrations | GitHub approval does not govern independent Vercel Git deployments, promotion/alias rights, hooks or integrations. Verify and approve those exact controls separately |

Provider settings and secret metadata changed during the pause; the agent only read them. The current remote `main` still contains the older linked migration job, but a push executes the workflow associated with the pushed revision. Retaining the job's removal in the reviewed merge matters; do not claim that merging the corrected workflow inevitably executes its old version. Avoid any release-triggering push until all independent provider controls and the final merged source are reviewed.

Exact hosted configuration changes need a concrete request: project/repository/environment, field, observed before state, intended after state, affected paths, recovery access and post-change readback. Approval of read-only discovery, discussion of secret placement, or “continue implementation” does not authorize these mutations. Never enable a replacement automatic production job or relax RLS to make validation pass.

## Offline Artifacts And Freeze

Run `npm run prepare:release` locally after finishing reviewable changes. It reads repository source and local Git metadata, reuses the migration inventory and header builder, and writes a new ignored `artifacts/release/candidate-*/` directory. It never loads environment files, fetches provider state, executes migrations, edits active configs, deploys or changes Git history. Files use non-overwriting writes; the manifest records source-file hashes, a source digest, all ordered migration hashes, local base/branch/dirty state and two production-header candidates. `releaseAuthorized` is always `false`.

The active `vercel.json` files are staging-specific. Candidate `organizer.production.vercel.json` and `reader.production.vercel.json` derive from the same policy source and replace only approved sibling/backend CSP bindings. They preserve routes, install/build/output settings, nonbridge framing denial, bridge `no-store`/`no-referrer` and its explicit sibling exception. Do not promote an artifact containing staging CSP/backend bindings. The candidates are not installed automatically, and known production origins still require fresh provider ownership verification.

The current source chain contains 130 migrations; the local `main` baseline has the preceding 129 and lacks only `20261116000100_application_rbac.sql`. This describes repository history. Approved discovery found production at 127 migrations, missing two Universal Stories dependencies plus S2, while staging remains empty. The readiness report records the exact observed suffix; reverify current history and checksums before execution. The chain SHA-256 is recorded in the readiness report/manifest; rederive it after any SQL change. No S3 or S4 SQL migration is introduced. The S3 release change is the reader-inbox error-log redaction.

Freeze an exact reviewed commit and production artifact hashes before seeking execution approval. A dirty preparation manifest is review material only. Regenerate after changes/commit, and build production artifacts with explicit verified public settings and the reviewed production config candidate in an isolated checkout. No credentials belong in source/browser variables or artifacts. Local mocked/synthetic builds are not production release bundles.

## Preflight And Required Evidence

1. Read-only discovery is approved for the documented targets and metadata scope; collect/recheck it only within that scope. Use an allowlisted audit path: project identity/health, migration version/name/history, schema/RLS/grant/function-owner metadata, bucket settings, Auth configuration flags, function versions, secret names, job names/status and provider release permissions. Filter any response that includes secret values in memory before logging. Do not use operational endpoints as “read-only” probes: `GET save-backup` can prune, restore preview locks tables, and library queries update caches.
2. Require hosted history to be a known ordered source prefix, with original versions and source checksums reconciled. Unknown versions, gaps, edited applied SQL, or mismatched function definitions block release. Do not rerun all migrations against an unknown production schema, silently repair/mark history, reset hosted data or retry ambiguous writes.
3. Verify actual definer owners have the intended privileges and fixed search paths; API roles cannot call internal role/restore/worker helpers or CREATE in trusted schemas. Confirm private RLS/views/Storage policies match the reviewed catalog. Local tests do not attest hosted grants.
4. Prove staging/preview/PR jobs cannot obtain production secrets through project, team/shared, repository, organization or integration scopes. Reviewed source CI has no production mutation job, and its aggregate gate requires every validation job. Remote main still has the older linked deployment job; Production now has a self-approvable reviewer/main-only gate and environment-scoped secret names, but admin bypass and unprotected main remain. Recheck the exact final workflow, single-operator controls and independent Vercel/Supabase auto-deploy/promotion/integration gates. An ordinary merge must not execute database migrations or independently promote production artifacts through another provider path. No verified production execution gate/runner currently ships here; do not substitute raw CLI commands for it.
5. Complete approved hosted staging clean-schema and populated synthetic-prefix upgrades, the S2/S3 real identity/Storage/Edge/owner matrix, and protected sibling-origin/browser/device checks. Existing S1 setup approval and successful frontend builds do not attest those tests. Require full-size generated synthetic backup/restore and HTTP/Storage acceptance within explicitly approved size/latency and actual statement/API budgets. S4 measured a 62.8-second embedded replacement restore against a configured 60-second function budget; do not increase timeouts or import an external backup to bypass a guard. The Docker-only destructive fixture cleanup must never run on staging/production.
6. Verify private beta signup, email confirmation, no anonymous signup, exact approved redirect allowlists/templates, and MFA enrollment/verification prerequisites. Keep signup closed where approved until the whole flow passes. Preserve existing production settings unless their exact changes are approved. Mailtrap sandbox success is staging SMTP evidence, not production mailbox delivery evidence.
7. Obtain approved full backup/recovery coverage, encryption/access/retention, recovery ownership, RTO/RPO and independently retained key/configuration recovery. Verify actual provider backup/PITR entitlement and restore paths without assuming a plan. The scoped local drill is not whole-project disaster recovery.
8. Verify required Production browser bindings, exact origin secret names, callback allowlists, private-beta hook configuration and compatible Node runtimes; none may be inferred from READY staging frontends. Record deployment IDs/current aliases and supported old-client/schema contracts. Ensure an exact known-good rollback artifact remains available. Set the reviewed maintenance/observation window, operators and objective abort thresholds; missing values block release rather than receiving invented defaults.

## Backup Coverage And Restore Boundaries

[Library Backups](../BACKUPS.md) remains authoritative for account-export format, size limits, retention and account/operator restore behavior. [S2](S2_APPLICATION_RBAC.md) owns protected ownership recovery; [S3](S3_OWNER_ONLY_PRIVACY.md) owns the privacy matrix. Do not confuse a three-copy account backup with independent disaster recovery.

| Asset | Current Coverage / Local Evidence | Required Release Evidence |
|---|---|---|
| Organizer private records, source identity, notes/progress/tags/collections/series/import history/preferences | Versioned JSON v1/v2 exports and checked account restore; real local replacement/foreign-denial tests pass | Approved encrypted independent preflight copy and recovery owner; never expose contents in release logs |
| Shared source facts / caches / projections | Source migrations rebuild schema/projections; account restore preserves existing shared facts; operator restore can overwrite shared facts affecting other users | Distinguish account repair from infrastructure restore; explicit shared-data scope and correct identities/history |
| Reader cloud fields/history/preferences | Separate owned SQL records; local drill reconstructs one synthetic annotation and association | Verified independent DB coverage and reconciliation; organizer JSON does not include the reader cloud library |
| Original EPUBs and saved backup bytes | Private buckets; real local upload/delete/recreate/hash verification | Independent object-byte copy/version manifest plus DB object metadata, encryption and approved retention. Database restore alone does not restore Storage bytes |
| Auth users/UUIDs, confirmation/password/MFA state | Existing Auth identities preserved by scoped local drill; embedded upgrade uses a minimal Auth contract | Verify managed Auth backup scope and encryption dependencies. Full Auth restore/session/factor recovery not exercised here |
| Application assignments and append-only audit | Source roles/permissions schema plus DB records; operator bootstrap/recovery tested | Include assignments/audit in approved DB preservation; no account-export role injection. Preserve audit independently; never delete it to reopen bootstrap |
| Paired/delivery credentials and signed URLs | Hashed server-side device/destination records; browser/native clients retain secrets separately | Approved retention/reconnect/revocation plan; no secret export in account JSON. Signed URLs remain capabilities until expiry |
| JWT/service/DB/provider/SMTP credentials and encryption keys | Not in account export, source manifest or reports | Independently protected secret-manager access/recovery and custodian; never print values. Rotation is a separately approved class |
| Auth callbacks/hooks/templates, origins, bucket configuration, Edge bundles, cron/Vault/external jobs | Versioned source covers part of configuration only | Allowlisted settings inventory, exact reviewed rebuild/restore plan and scheduler enablement; actual configuration recovery remains unproven |
| Browser display preferences, guest/local-only reader files, unsynced queues | Five allowlisted browser preferences in app exports; guest/device data stays local | Owner-controlled device export/recovery and explicitly documented exclusions; server backups cannot recover data never uploaded |

Current saved account backups retain the latest three successes, rate-limit attempts to one per minute, and have no automatic creation schedule. Application audit retention is initially indefinite; immutable off-project preservation is not implemented. Production off-project retention/encryption, key custody and RTO/RPO remain **undecided/unverified**, not implicitly approved defaults. Record and satisfy them before production.

## Compatibility And Rollout Order

| Component | Dependency / Mixed-Version Rule |
|---|---|
| Database | Apply only the approved missing ordered suffix. S2 is additive and defaults existing/future accounts to User; it does not change existing library functions or RLS. Existing clients keep their own-library access before/after bootstrap |
| Beta/Auth | Preserve username uniqueness, exact signup hook/approval and confirmation, reader grants and verified Auth identity. App role never bypasses registration. Recent TOTP remains mandatory for sensitive S2 application actions; the GitHub release approval is a distinct infrastructure checkpoint |
| Edge Functions | Review each slug separately. S3 changes only `reader-inbox` log redaction relative to S2; broader missing/drifted functions require separately listed bundles/config. Gateway verification settings rely on explicit handler authentication/capability checks |
| Organizer / reader | Both require explicit environment/ref/key/origins. Install exact production header candidates, then build under provider Production scope. Confirm callbacks and sibling bridge framing as a pair; independent sessions retain account ownership |
| Chrome/Edge companion | Extension-only metadata protocol, selected environment/profile, approved app origin and owner-bound lease. Build for the exact intended public backend; users must verify installed version/profile. Old clients may need a reload/update, not broader server grants |
| Safari / reader pairing / Calibre | Preserve scoped secret/UUID association and current RPCs; Safari requires hosted HTTPS and has no local install profile. Pairing does not grant another account or app administration |
| Backups / restore | Current readers accept v1/v2; generic-story v2 prevents older incompatible readers from losing source identity. Role/audit tables are excluded. Infrastructure restore is a separate, potentially shared-data-changing privilege |
| Workers / jobs | Hosted work fetching stays retired (`import-worker` 410; service claim returns null). Fandom/tag enrichment is distinct. Keep approved environment/job limits; do not start schedulers or prune data as an implicit deployment step |

After all preflight blockers are closed and exact classes approved:

1. Freeze artifacts and obtain the distinct production release approval. Verify environment/credential isolation and exact target identity immediately before the first operation. Record metadata-only receipts and timestamps in restricted release evidence.
2. Perform only the explicitly approved backup/maintenance actions. Preserve recovery assets and baseline aliases/function versions; quiesce writes/jobs only if that specific action is approved. A backup error stops release.
3. Execute the exact approved migration suffix through a separately reviewed protected production mechanism; verify version/history/catalog after each step. The existing local runners refuse hosted targets and the staging client pins staging: neither is a production bypass. There is no authorized production runner in this preparation. Any migration/RLS/grant action requires its separate approval before execution.
4. Apply only approved Auth/Storage changes after their required objects exist. Verify effective configuration without logging values. Role/bootstrap changes are not inferred from this step. Do not open registration or replace production SMTP with staging settings to make a smoke test pass.
5. Deploy only approved Edge slugs with matched bundle hashes, JWT settings, secret names and origins; verify effective version/config and scoped auth/denial behavior. The reader-inbox fixed-label error handling must be included when that function is released.
6. Build/deploy each approved Vercel app as a **Production** artifact using its approved public environment and production header candidate. If staging without alias assignment is approved, verify that artifact before a separately approved promotion/alias action. A Preview build's variables/CSP are not a tested Production artifact.
7. Bootstrap the initial Owner only if explicitly approved, the verified pre-bootstrap state has zero Owners and no prior bootstrap audit, and after out-of-band verification of the existing confirmed, active, MFA-enrolled account. Use the restricted S2 operator procedure with an approval reference/request UUID; no public identity constant or email matching. Verify one active Owner, append-only audit and continued own-library access. Bootstrap never runs automatically during migration/deployment.
8. Distribute only approved companion artifacts and activate only approved jobs. Verify matching organizer/reader/backend/profile/queue identities, preserving the retired work-fetch path. Credential rotation or job restart needs its own scope.
9. Run only approved production smoke actions below, observe for the approved window, record verification/monitoring outcomes, and hand over to the named operations/recovery owners. Do not automatically push/merge before or after rollout.

## Post-Deployment Privacy Smoke

Prepare a staging-specific four-role matrix first. **Never run `test:privacy:local` or `test:rbac:local` against production**: they deliberately bootstrap disposable ownership and bypass triggers for local teardown. Production has a controlled real Owner and retained audit history.

Production smoke must use separately approved synthetic User A/B and optional temporary Admin, with Owner participation by the actual authorized person; never transfer the real Owner to a synthetic fixture or impersonate/copy their session. Agent/operator checks are restricted to known synthetic sentinel IDs and allowlisted metadata. The Owner can confirm their own normal library workflow without exposing personal content in logs/screenshots/chat.

| Check | Required Result / Evidence |
|---|---|
| Target and headers | Exact backend/public configuration/aliases; no staging bindings or secrets; normal framing denied, approved sibling bridge allowed, auth responses uncached |
| Anonymous and signup | Private reads/administration denied; unapproved beta signup rejected; an approved synthetic signup/confirmation/recovery/invitation flow only within its separately authorized email/account scope |
| Own library by role | Each participant can create/read/update/delete approved **own synthetic** sentinels; ordinary existing account remains usable and default User does not lose library access |
| Foreign library | Signed User A/B/Admin/Owner queries on the other synthetic sentinel IDs return no rows/changes; no ownership reassignment or foreign collection/tag/series linkage |
| Storage | Own synthetic EPUB/backup operations pass as permitted; cross-prefix read/write/sign/delete denied; tampered signed-object path denied; no private paths or URLs recorded |
| Reader and login | Confirmed reader identity, independent matching handoff session, wrong-origin/verifier/replay denial, scoped cloud/organizer association and delivery capability |
| Extension and queues | Actor cannot commit a victim's valid synthetic lease; owner can finish their own snapshot; late/replayed results fenced; retired work-fetch endpoint remains 410 |
| Roles and audit | Direct role writes and self-promotion denied; only current Owner can make approved grants after recent MFA; stale permissions fail; audit fields remain redacted/append-only; exactly one active Owner |
| Export / restore | Export/preview restricted to approved synthetic records; role/table injection cannot grant authority. Destructive replacement or retention/pruning is never an unapproved smoke action |
| Error privacy | Generic client errors and fixed reader-inbox operational label; no private filenames, tokens, library metadata or raw provider errors in the approved log sample |

Record timestamps, request/correlation IDs, component versions, expected/actual pass/fail and safe aggregate status. Do not record actual private notes, titles, filenames, user lists, credentials or signed capabilities. Remove only explicitly approved temporary synthetic data through normal scoped paths and retain administrative audit. Stop immediately on any failed privacy assertion.

## Incident Triggers, Monitoring And Recovery

Immediate stop/escalation triggers: any cross-account content/write or role bypass; ambiguous/incorrect project identity; production credentials visible to nonproduction; an unexpected Owner count or ineligible Owner (zero is allowed only in the verified initial pre-bootstrap phase; exactly one is required afterward); unknown migration/history or partial write; incorrect backend/CSP/aliases; exposed secret/error payload; failed backup/recovery prerequisites; or retired hosted retrieval becoming active. Stop on deployment/constraint/Auth/Storage errors crossing the release request's **approved** thresholds, unexplained queue growth, or loss of normal own-library access. Missing thresholds/observation owners block release.

Do not automatically retry a timed-out migration/role/restore operation, rotate credentials, disable RLS, reopen signup, start/stop jobs, reassign domains or delete audit. Freeze further actions, preserve redacted evidence, identify the actual committed state, notify the named incident owner through the approved process, and obtain the specific emergency action approval. No messages are sent by this preparation.

| Situation | Preferred Reviewed Response |
|---|---|
| Additive S2 deployment problem | Forward-fix exact grants/functions or, if specifically approved, revoke administration RPC EXECUTE while preserving ordinary library behavior, assignments, audit and owner protections. Do not drop role/audit tables or remove the last-owner invariant |
| Frontend/headers regression | Restore the approved known-good **Production** artifact/header pair and alias assignment only after identity checks and rollback approval. Confirm schema/protocol compatibility, cache/bridge behavior and safe smoke results |
| Reader-inbox regression | Prefer a narrow forward fix retaining generic logs. Rolling back to the previous raw-error-logging version reintroduces S3-F01 and requires explicit risk acceptance |
| Owner access/factor loss | Independently authorized S2 `recover_owner` procedure after verified successor/approval, preserving audit and one-owner invariant; sessions/factors/keys are separately handled. Never infer ownership from an email or imported backup |
| Data corruption or irreversible schema effect | Use the approved recovery plan, backups, target and outage window. Restore Auth UUID/identity continuity, DB roles/audit/data, actual Storage bytes/metadata and configuration/keys/jobs in dependency order; account JSON alone is insufficient |
| Suspected credential compromise | Separate approved rotation/revocation and dependent-component handover. Preserve out-of-band recovery access; do not log old/new values or assume app-role demotion revokes infrastructure credentials |

Forward-fix is generally safer for additive schema/audit changes; application rollback cannot undo committed data changes. Restoration into a new Auth UUID requires an explicitly reviewed remapping of owned rows, reader state and object prefixes—matching the same email is not identity recovery. Recheck privacy after every recovery step and monitor denial/error/queue/role/audit signals for the approved window. Record final verification and monitoring results only after the corresponding action actually occurs.

**STOP:** while blockers remain, request only the specific next evidence/preparation class. Before any production migration, RLS/grant change, Edge deployment, Vercel Production deployment, hosted Auth/Storage change, owner transition, job action or credential rotation, obtain its exact explicit approval and repeat target verification. Nothing in this runbook grants it automatically.

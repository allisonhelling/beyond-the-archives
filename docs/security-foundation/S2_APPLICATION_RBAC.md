# S2 Application Roles And Administration

**Status — 16 November 2026:** implemented and migrated on the synthetic local stack on branch `security/02-account-rbac`. Staging execution requires explicit approval of the concrete rollout; no S2 staging writes, production changes, push or merge have occurred. No lasting owner has been selected or bootstrapped. This record supersedes earlier statements that S2 has not started; S1's unresolved hosted acceptance and infrastructure credential-isolation requirements remain open.

## Inspection And Scope

The security/environment specification and implementation plan under `to_implement/security-foundation/`, [S0 Audit](BASELINE_AUDIT.md), [S1 Runbook](LOCAL_AND_STAGING.md), existing migrations, Auth/username/beta-signup triggers, reader access, private-library policies, service/operator invitation/restore scripts and SQL/service test harnesses were inspected first. There was no trusted application role/permission system. Existing operator “admin” APIs are infrastructure operations and cannot be reused as application Admin privileges.

Migration `20261116000100_application_rbac.sql` adds the five proposed tables once: `app_roles`, `app_permissions`, `role_permissions`, `user_roles`, and `admin_audit_logs`. Existing and future accounts receive `user`, including accounts with role-like Auth metadata. Unconfirmed accounts have a default assignment but cannot use administration. All five tables have forced RLS, no API policies and no table or sequence grants to PUBLIC, `anon`, `authenticated` or `service_role`. The existing account/login/reader/library ownership and signup rules are preserved.

Application `user`/`admin`/`owner` are text identifiers, never PostgreSQL roles or Supabase infrastructure grants. No personal-data RLS rule, library function, Storage policy, invitation script or privileged restore path gains an application-role exception. Admin and Owner keep exactly the same own-library boundary as User.

Suspension/restoration, account directories, diagnostics, operational settings, support access, impersonation, deletion of other accounts, private-library browsing and arbitrary permission definitions are **deferred entirely**, with no APIs or UI. A bare Auth ban is not presented as uniform application suspension. The only initial Admin permission is the limited audit reader. No administration/MFA enrollment UI is added in S2; the backend contract is available through the normal authenticated RPC transport, with every authorization check enforced by the server.

## Server-Enforced Action Matrix

`app_access()` returns only the caller's current role and explicit permission IDs. It derives the identity from `auth.uid()`, verifies current confirmed/nonanonymous/nondeleted/nonbanned account state, and reads assignments from the database. It takes no account-ID argument. It is informational and does not authorize subsequent writes.

`admin_access(p_request_id uuid, p_action text, p_target uuid default null, p_permission text default null, p_enabled boolean default null)` is a fixed action allowlist, not a generic account updater. Only `authenticated` has EXECUTE. It accepts no actor ID or role label.

| Action | Permission / Actor | Target And Transition | Audit And Additional Guards |
|---|---|---|---|
| `assign_admin` | `roles.assign_admin`; Owner only | Confirmed, active, nonanonymous User → Admin; no self-target | Fresh TOTP; atomic role change and success event |
| `revoke_admin` | `roles.revoke_admin`; Owner only | Active Admin → User; cannot remove Owner | Same guards |
| `transfer_owner` | `roles.transfer_owner`; current Owner only | Different active User/Admin with verified TOTP → Owner; previous Owner → User | Serialized, atomic transfer; exactly one owner at commit |
| `set_admin_permission` | `permissions.manage`; Owner only | Only Admin's `audit.read_limited` can be enabled/disabled | No target UUID or other permission allowed; atomic audit |
| `read_audit` | `audit.read_limited`; Admin or Owner | Admin: own action rows only. Owner: all action rows | Fresh TOTP; successful read is itself audited; newest 50 rows only |
| Operator `bootstrap_owner` | Migration/database operator only | Eligible MFA-enrolled User/Admin → first Owner | One successful bootstrap ever; audited, unique request and operator reference |
| Operator `recover_owner` | Separately authorized infrastructure operator only | Eligible MFA-enrolled successor → Owner; previous Owner, if present, → User | Same serialization/invariant; requires prior successful bootstrap; never exposed to API roles |

Owner permissions are seeded explicitly; they are not wildcards. Admin cannot delegate, modify mappings or target Owner/Admin through an account-management shortcut. Invalid/unknown actions and unused/ambiguous arguments fail closed. Targets are checked inside the transaction; UUIDs supplied by the client do not establish actor identity or target eligibility.

## Live Authorization And MFA

Every privileged action rechecks the current role, permission mapping and account state under the same transaction as the change. User metadata, app metadata and custom JWT role/permission claims are ignored. Revoked assignments/mappings and former ownership stop working with an unchanged access token.

Privileged calls additionally require all of:

- A signed PostgREST JWT with `aal=aal2` and its session ID, belonging to the verified caller.
- A still-existing `auth.sessions` row for that caller, with `aal=aal2`, a nonexpired `not_after` where set, and its current factor ID.
- That factor belongs to the same account, is `totp`, and is currently verified.
- The session's trusted `auth.mfa_amr_claims` TOTP `updated_at` is within the last **five minutes**, without a future timestamp.

Refreshing a JWT, editing metadata, forging `amr`/`iat`, using somebody else's session ID, or retaining a token after session/factor revocation does not satisfy these checks. Account/session/factor/AMR rows used to authorize the operation are locked for the transaction. Losing a factor blocks privileged actions, without silently changing the owner assignment. The existing ordinary-library token/session behavior is unchanged.

Local `[auth.mfa.totp]` enables enrollment and verification. Existing stacks need `npm run db:stop` then `npm run db:start` to apply this Auth configuration, preserving volumes. For a privileged call, use Supabase's `mfa.enroll`, `mfa.challenge`, and `mfa.verify`; after enrollment, challenge/verify the existing factor again when the five-minute window expires. Do not log the enrollment secret, QR payload, code or tokens. These checks follow [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa) and the trusted [AMR session model](https://github.com/supabase/auth/blob/master/internal/models/amr.go).

**Remaining prerequisites:** there is no product MFA/admin UI or independent trusted-device/password reauthentication ceremony beyond the fresh TOTP verification. Browser interaction, recovery-owner identity verification, hosted session revocation/configuration and mixed-version acceptance still need staging checks. Each independent reader/organizer or connected-login session needs its own fresh MFA. The implementation deliberately fails closed without MFA rather than offering a bypass. Consider phishing-resistant MFA and additional password reauthentication before a later production rollout. Do not enable unsupported Auth factor types as an authorization shortcut.

## Transaction, Replay And Owner Safety

All administrative calls, bootstrap and recovery lock the existing `app_roles` Owner row before reading or modifying authorization. This serializes permission changes and transfers. A partial unique index allows at most one Owner. After the first successful bootstrap, a deferred constraint trigger requires exactly one active Owner at transaction completion. Here **active** means an existing, email-confirmed, nonanonymous account without deletion or a current Auth ban. MFA loss affects privileged-call eligibility and requires recovery; it does not convert the assignment to User or allow a second bootstrap.

An Auth trigger rejects owner deletion, deconfirmation, anonymization, identity replacement, soft deletion and banning. Transfer/recovery must happen first. Ordinary account deletion still cascades normally. Direct role-row removal/demotion fails the deferred invariant; adding another Owner fails the unique index. Trigger-disabled corruption requires the independently controlled recovery procedure; ordinary API credentials cannot disable these protections.

Caller-generated request UUIDs are unique per authenticated actor, shared across actions. Reusing one returns `request_already_used` and performs no action, even if parameters differ; it never returns a cached privileged result. A new, deliberate attempt needs a new UUID and fresh authorization. Operator request UUIDs have their own unique namespace. Concurrent transfers by the same Owner yield one success and a denial for the stale former Owner. Concurrent bootstrap/recovery is serialized by the same lock/index. Unexpected SQL failures abort the entire transaction; do not blindly retry an ambiguous response. Inspect trusted role/audit state first.

## Audit Integrity And Data Minimization

Only the restricted security-definer functions append records through the application API. Valid recognized actions by confirmed active callers record success or denial with the verified actor, UUID target, trusted role, fixed action/outcome/code, role transition, approved permission toggle, request UUID and server timestamp. Infrastructure bootstrap/recovery records `actor_role=infrastructure`, null actor ID and a validated nonsecret operator reference. These rows intentionally have no Auth-user foreign key: deletion of a former actor/target cannot erase the history.

The only audit-reader fields are **`id`, `request_id`, `action`, `outcome`, `occurred_at`**. Admin sees their own rows; Owner sees these same redacted fields across actors. There are no emails, usernames, actor/target IDs in that response, free-form errors, arbitrary JSON, story counts, URLs, titles, tags, filenames, reading activity or joins to library records. Reading the log never grants private-library access.

Recognized-action denials return `{ok:false, code, request_id}` so the denial record commits; consumers must check `ok`, not HTTP 200 alone. Anonymous/invalid-account transport errors, unknown action names, missing request UUIDs, duplicates and operator-maintenance exceptions do not append new denial rows. Request/transport failures require separate restricted provider/security logs; centralized ingestion, rate limiting and off-project immutable preservation are not implemented. Never put tokens or raw request bodies into those logs. This limitation remains a production readiness gate.

Success mutation and audit append commit atomically. An audit insertion failure rolls back the mutation. UPDATE, DELETE and TRUNCATE have no API grants and also raise through an append-only trigger. Retention is indefinite in this initial release; there is no purge API, scheduled deletion or cascading audit removal. Infrastructure operators can still bypass triggers or change schemas: append-only application grants are not secrecy or tamper-proof preservation against database administrators. Establish approved encrypted/off-project retention, access controls and recovery objectives before production.

## Local Migration And Verification

Use the existing guarded local commands, with the known synthetic stack running:

```sh
npm run db:migrate
npm run db:lint
npm run test:db
npm run test:integration:config
npm run test:rbac:local
npm run test:integration
```

`test:rbac:local` accepts no target overrides and obtains the backend through the existing verified local fixture guard. It uses five temporary synthetic accounts, real GoTrue TOTP and PostgREST tokens, plus the named local Docker database for operator-only bootstrap/assertions. It refuses to run if an owner or successful bootstrap already exists. Run it **before** selecting a lasting owner. The CI local Supabase job runs it after existing integration checks; CI has no hosted deployment path or production credentials.

Test teardown uses infrastructure-only trigger bypass on the verified synthetic stack, scoped to the generated fixture UUIDs and known request UUIDs, to remove only those test assignments/audit rows before normal synthetic Auth cleanup. This deliberately destructive fixture teardown is never a hosted recovery/retention procedure. It leaves no lasting owner or bootstrap event and preserves preexisting users. Do not repurpose the local test runner for staging.

The embedded test harness adds only the Auth session/MFA/account-state columns needed by the migration; it does not claim to implement GoTrue. Tests replay the full migration chain on a fresh embedded database and separately exercise backfill from the pre-S2 schema. The real stack was upgraded from its existing 129-migration state without reset; its existing synthetic accounts were retained. All new security-definer functions use an empty `search_path`, fully qualified relations and explicit EXECUTE revocation. No dynamic SQL is used.

Verification on 16 November 2026:

- Embedded S2 authorization tests: **19 passed**, including API/table/sequence grants, metadata forgery, allowed and forbidden transitions, fresh/stale/revoked MFA, stale role claims, replay, audit scope/tampering, atomic audit failure, last-owner protection and factor-loss/deleted-owner recovery. The focused S2/foundation run passed **73 tests**.
- Real local S2 checks: passed TOTP, anonymous and forged-token denial, direct role-write/operator-procedure denial including `service_role`, stale grants/permissions, User A/User B/Admin/Owner private-library isolation, redacted audit, replay, concurrent transfers, last-owner safety and scoped fixture cleanup.
- Local migration and database lint passed; existing live Auth/PostgREST/RLS integration suite passed **30 checks**. Configuration/isolation tests passed **37**; organizer and reader TypeScript/build, ESLint and `check:security` passed. The full `npm test` regression suite passed **2,132 tests across 187 files**. Existing Node local-storage and jsdom scroll warnings did not fail the suite; the build retained its existing large-chunk warning.
- No protected hosted-browser, staging or production acceptance is claimed. The subsequent [S3 local privacy matrix](S3_OWNER_ONLY_PRIVACY.md) now covers Storage/reader/Edge and worker-denial boundaries; hosted/native acceptance and independent security review remain separate.

## Controlled Owner Bootstrap

1. Independently verify the selected environment/project and operator authority. Use only synthetic identities for local/staging. Never use email matching, signup metadata, a browser constant, a deployment environment variable or a default seeded owner.
2. Obtain the intended account UUID from a verified authenticated identity; independently confirm the candidate controls it and the intended TOTP factor. Inspect only that Auth row's ID, confirmation/anonymous/deletion/ban status and verified factor status. Do not export the account directory or personal-library data.
3. Ensure the account is confirmed, active and has verified TOTP. Verify that no successful bootstrap and no Owner assignment already exist. Use `app_access()` to confirm the ordinary role. Record an operator approval/reference outside the database, including environment and candidate verification.
4. As the separately authorized migration/database operator, run the following once in a transaction. The psql variables are public identifiers/references supplied by the operator, not browser input or secrets:

```sql
begin;
select public.app_owner_maintenance(
 :'request_id'::uuid, 'bootstrap_owner', :'owner_uuid'::uuid, :'operator_reference'
);
commit;
```

5. Verify exactly one Owner assignment, a matching successful `bootstrap_owner` audit event, and no other role changes. Sign in as that account, perform a fresh TOTP challenge/verification, and check `app_access()` / a redacted `read_audit` call. Confirm an ordinary account cannot perform the same privileged action. Keep the factor/recovery material in the independently approved secret-management process.

The operator reference must be 8–80 ASCII letters/numbers/underscores/hyphens (for example, a nonsecret approval-ticket identifier). A different UUID does not reopen bootstrap. `app_owner_maintenance` has **no** PUBLIC, `anon`, `authenticated` or `service_role` EXECUTE grant; use the authorized database identity, not an application service key. Neither bootstrap nor recovery returns tokens, impersonates the successor or creates an Auth session.

## Transfer And Break-Glass Recovery

For planned transfer, the current Owner signs in, completes fresh TOTP and calls `admin_access` with a new request UUID, `p_action='transfer_owner'`, and the independently verified eligible successor UUID. The successor must already have confirmed email and verified TOTP. Both account assignments and the audit event change in one transaction. Confirm the old token is denied new administrative actions and the successor can complete fresh MFA and read their own authorization. Do not delete/deactivate the old Owner first.

If the sole Owner loses access/MFA, or infrastructure corruption removed/disabled its identity, do not add a browser bypass, grant service-role EXECUTE, edit an email allowlist to infer ownership, or delete audit history. Obtain separate infrastructure approval, reverify environment/project, preserve the relevant role/audit state in restricted recovery evidence, verify an eligible successor out of band, and run the same operator-only function with **`'recover_owner'`**, a new request UUID and the approval reference. It requires a prior bootstrap, tolerates a missing former assignment, demotes any former Owner and installs one eligible successor atomically. Record the former identity and approval in the restricted operator recovery evidence; the function logs the successor transition and reference. Check the exactly-one-owner invariant and stale-token denial afterward. Session/factor compromise also needs independently approved Auth session/factor revocation; S2 recovery changes application authority, not every credential or infrastructure privilege.

If audit insertion, successor eligibility or the invariant fails, the recovery transaction rolls back. Preserve evidence and correct the prerequisite; never bypass the invariant merely to make the call pass. Full Auth/DB/Storage/config disaster recovery, recovery ownership and RTO/RPO remain the existing [S1 Recovery](LOCAL_AND_STAGING.md#local-service-verification) and S4 approval work.

## Staging Rollout For Explicit Approval

The read-only inventory on 16 November 2026 verified `beyond-the-archives-staging`, ref **`vzqrpjzfwcuuiqxanyoy`**, `us-east-1`, `ACTIVE_HEALTHY`, matching configured public key, **zero applied migrations, users, buckets/objects and deployed functions**. SMTP and TOTP enrollment/verification are configured, and signup remains closed. There are now **130 pending repository migrations**, including S2. The report is ignored under `artifacts/staging/backend-inventory-2026-11-17T00-02-48-561Z.json`; its timestamp is UTC (16 November in America/Chicago). This is not a staging rollout.

The exact S2 artifact is `supabase/migrations/20261116000100_application_rbac.sql`, SHA-256 **`7068fc87b1318f17d55684f375aefc7deaa3a7b506e2a663cbbcc452ac2cee8e`**. Recompute immediately before approval/execution if the artifact changes.

1. Obtain explicit approval for this S2 artifact and staged verification. Finish the separately approved S1 backend rollout coordinator first: reconcile original migration versions and source checksums, apply the preceding 129 migrations in order, configure beta hook/exact callbacks/private buckets/functions, and verify the existing isolation prerequisites. S2 cannot be applied to the currently empty backend as a standalone migration. Never use the production-linked CLI or a raw remote bypass.
2. Re-inventory immediately before writes. Require the known staging identity, healthy status, exact expected migration prefix, no unknown/out-of-order versions, only synthetic users, and approved operator credentials without production access. Run migrations as the trusted migration role with the privileges needed to install Auth triggers and security-definer owners that can use the forced-RLS tables; verify actual owners/BYPASSRLS and grants afterward.
3. Use the existing fixed-target `stagingDeploymentClient` / reviewed `applyMigration` operation as part of the version-reconciled coordinator, and the approved exact migration bytes. Preserve the original S2 migration version. Do not reset hosted staging or silently mark versions applied.
4. Through the same guarded `configureAuth` path, verify **`mfa_totp_enroll_enabled=true`** and **`mfa_totp_verify_enabled=true`**, enabling them only if needed. The shared guard/inventory now supports these explicit [Supabase Auth configuration fields](https://supabase.com/docs/reference/api/v1-update-auth-service-config) and rejects plans disabling them. Retain closed signup, email confirmation, private beta hook, Mailtrap SMTP and exact staging callbacks. Confirm the effective settings, not only the request receipt.
5. Verify the SQL grants, forced RLS, empty definer search paths, routine owners and Auth triggers on staging. Use dedicated synthetic identities and real signed anon/User/Admin/Owner sessions to repeat the documented role/MFA/replay/audit/concurrency/privacy matrix. Prepare a staging-specific guarded fixture lifecycle: the local Docker test/trigger-bypass cleanup is forbidden there. A temporary staging Owner bootstrap/recovery and its synthetic account lifecycle must be explicitly included in the approved fixture plan. Preserve audit history and use controlled transfer/recovery rather than deleting a hosted Owner.
6. Record actual results, artifact/history, owner selection/approval, and remaining S1/S3/S4 gates. Staging approval never authorizes production, push/merge, frontend/Edge deployment, jobs, personal-data copies, key rotation or new paid resources.

No hosted execution or permanent bootstrap is included in this local delivery. If rollback is needed after S2, disable the public administration RPC's EXECUTE grant through a reviewed follow-up migration and keep the additive role/audit records and owner protections. Older organizer/reader clients do not call these RPCs and retain existing personal-library behavior. Do not drop audit/role tables, remove owner constraints or reset a hosted database as a rollback shortcut. Production requires its own exact-artifact release approval after hosted validation.

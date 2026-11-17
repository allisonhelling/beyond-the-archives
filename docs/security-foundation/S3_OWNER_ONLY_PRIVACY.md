# S3 Owner-Only Privacy Verification

**Status — 16 November 2026:** local implementation and privacy matrix on `security/03-owner-only-rls`, based on S2 commit `7c86c95`. Stopped for review. No push, merge, deployment, hosted query/write, production access, personal-data import or lasting owner bootstrap is included. S1/S2 hosted readiness and S4 production approval remain separate.

## Scope And Result

Inspected the security specification and S3 plan, [S0 Audit](BASELINE_AUDIT.md), [S2 Contract](S2_APPLICATION_RBAC.md), the effective 130-migration catalog, account/signup and role structures, nested ownership constraints, reader/organizer associations, Storage policies, nine Edge entrypoints, extension and enrichment workers, and browser/operator export/restore paths before implementing tests.

The real local database has **52 public tables, three invoker-security views, 40 public/Storage policies (five Storage policies), and 108 security-definer routines**. All public tables enable and force RLS. No personal-data or Storage policy contains an application-role exception. Anonymous and authenticated database roles cannot CREATE in `public`, `auth` or `storage`. The only anonymous-callable non-trigger definer is the existing secret-bound `userscript_library`; five reader trigger routines retain EXECUTE grants but PostgreSQL prevents calling a trigger-returning routine as an ordinary function. Two existing service-only throttle routines use the fixed `public` search path; other definers use an empty search path.

**380 grouped live matrix checks passed**, including actual signed User A/User B/Admin/Owner sessions, anonymous requests and separately identified service authority. This is a count of recorded check groups, each containing multiple assertions, not a count of individual SQL statements. Direct table tests cover all **38 relations with `user_id`**, comprising 35 tables and three views. Readable private relations require populated own-account fixtures; their positive tests cannot pass on empty data. Internal tables are tested for denial rather than inventing browser access.

One proven logging defect was fixed in the reader inbox; **no RLS policy, grant, database function or migration change was warranted by the authorization tests**. Admin and Owner have the same private-library boundary as User. No support browsing, impersonation or moderation exception was introduced.

## Identity Matrix

| Identity | Actual Authority Used | Expected Private Data Scope |
|---|---|---|
| User A / User B | Distinct confirmed synthetic Auth users and signed access tokens; default DB assignments | Own records only; mutual denial |
| Admin | Separate synthetic user, real TOTP, promoted by the synthetic Owner through S2's guarded RPC | Own records only; redacted own administrative audit events |
| Owner | Separate confirmed/TOTP-enrolled synthetic user, controlled operator-only bootstrap | Own records only; approved redacted administrative audit fields |
| Anonymous | Publishable-key PostgREST/Storage/Edge requests without a user session | No private records or authenticated administrative operations |
| Service Role | Explicit local service client, separate from the Admin/Owner user clients | Existing infrastructure bypass, used only for fixture setup/assertions and trusted handler adapters |
| Database Operator | Fixed synthetic Docker database, `postgres`, through the local SQL fixture helper | Role bootstrap/catalog/assertions and narrowly scoped local teardown; never browser authority |
| Auth Hook | Actual local GoTrue plus `supabase_auth_admin`; existing beta hook tests | Exact signup approval lookup; no app-role or library bypass |
| Paired Reader/Safari Capability | Anonymous transport with a valid hashed device secret | The credential's account; supplied account/role fields cannot retarget it |
| Calibre Delivery Capability | Separate destination-bound secret | Delivery/receipt for its destination account; no general cloud-library read |
| Signed URL Holder | Explicitly issued short-lived Storage bearer URL | The signed object until expiry; independent of a current login session |

Application roles remain unrelated to PostgreSQL `anon`/`authenticated`/`service_role`, Auth infrastructure privilege, SQL ownership or provider access.

## Complete Database Inventory

The ignored machine-readable catalog records every relation's RLS flags, table/column grants, generated columns, FK definitions, policy expressions, definer owners/search paths/EXECUTE grants, infrastructure role flags, schema CREATE privileges, and private bucket configuration. It contains no application rows, account UUIDs/emails, object paths, tokens, device secrets or signed URLs.

| Domain | Tables / Views | Ownership And Access Boundary |
|---|---|---|
| Personal library and organization | `library_entries`, `collections`, `collection_works`, `personal_tags`, `library_entry_tags`, `library_series`, `collection_series`, `automatic_collection_works` | Root `user_id`; collection/entry/tag/series edges retain existing owner-aware composite relationships; automatic membership is server-maintained |
| Personal preferences, history and reports | `metadata_preferences`, `reading_records`, `library_sync_reports` | Account-scoped settings, reading/history and reports; archive writes stay restricted |
| Private documents and caches | `library_search_documents`, `library_query_state`, `library_query_cache`; views `library_story_documents`, `library_collection_documents`, `reading_activity` | Owned projections; internal cache writes; all views preserve invoker RLS |
| Imports and owner queues | `import_batches`, `import_items`, `metadata_jobs`, `processing_logs`, `metadata_queue_turns` | Owner-scoped rows, parent/child constraints, caller-bound submit/claim/cancel/retry, service-only fenced completion |
| Per-account enrichment | `ao3_tag_resolutions`, `fandom_classifications`, `fandom_resolution_requests` | Owner-specific lookup evidence, classifications and requests; trusted service writers |
| Reader cloud and delivery | `reader_app_access`, `reader_cloud_values`, `reader_cloud_receipts`, `reader_transfer_destinations`, `reader_import_inbox` | Verified account/access gate; checked cloud writes; receipt identities and delivery destination remain protected |
| Pairing, availability and handoff | `userscript_devices`, `reader_availability`, `reader_organizer_links`, `reader_organizer_devices`, `app_login_handoffs` | Device/account association, hashed revocable capabilities, origin/verifier-bound one-time handoff; internal credentials not readable by app sessions |
| Backup coordination | `backup_save_state` | Account-specific lease/rate-limit state, service-only mutation |
| Auth and application administration | `account_usernames`, `user_roles`, `app_roles`, `app_permissions`, `role_permissions`, `admin_audit_logs`, `beta_signup_allowlist` | Restricted tables; self username/authorization RPCs, explicit S2 actions and field-allowlisted audit only; infrastructure and Auth-hook grants stay distinct |
| Shared source facts | `works`, `authors`, `fandoms`, `tags`, `work_authors`, `work_fandoms`, `work_tags` | Readable through a caller's saved-work relationships; ordinary users cannot write shared facts; unique fixtures test visibility for every application role |
| Global source evidence and throttle | `ao3_fandom_profiles`, `canonical_fandoms`, `external_fandom_mappings`, `fandom_evidence_state`, `metadata_worker_state` | Trusted source dictionaries/evidence/request coordination; no new directory or private-library query surface |

`external_fandom_mappings` is trusted **source-to-canonical fandom evidence**, distinct from a user's learned site extraction mappings. User site mappings/rules and linked crossposts remain unimplemented roadmap items: no table/API/UI is invented and no runtime acceptance is claimed. Implemented generic story `source_url`, private observations, manual metadata, BookFusion associations and reader/cloud references remain in existing owned records and are covered by the current save/restore and regression suites.

## Privacy Test Matrix And Evidence

| Surface / Operation | Actual Principal Coverage | Evidence / Expected And Actual Result |
|---|---|---|
| Private SELECT | User A, User B, Admin, Owner, Anonymous | Live PostgREST across every owner-column relation. Each readable relation has own rows; no foreign rows returned. Protected internal relations reject access or expose no rows. All passed |
| INSERT / UPDATE / DELETE / ownership reassignment | All four signed users plus Anonymous | Valid populated-row INSERT probes exclude generated columns; foreign INSERT requires SQLSTATE `42501`. Ownership reassignment and foreign UPDATE/DELETE reject or return no affected rows. Trusted before/after fingerprints verify foreign rows remain unchanged. Own collection updates and disposable tag create/delete pass |
| Nested relationship forgery | All four signed users | Own edges created successfully. Own collection/foreign entry, foreign collection/own entry, foreign tag/entry and foreign series linkage fail with `23503`; existing owner-aware FKs retained |
| Shared facts and joins | All four signed users | Unique work/author/fandom/tag fixtures are visible only through each account's saved work; foreign metadata and join rows hidden; direct shared INSERT/UPDATE/DELETE denied |
| Reader state and association | All four signed users plus paired capability | Owned cloud writes/snapshots succeed; another account's device secret is rejected for association; forged user/role in reader reports remains bound to the paired account; paired lookup cannot read another account's unique saved work |
| Private EPUB and backups | All four signed users plus Anonymous | Real Storage own upload/read/sign/delete where supported; cross-prefix read/sign/delete/upload/signed-upload denial; immutable EPUB update/move denial; foreign originals checked unchanged; browser backup upload denied |
| Signed URLs | All four signed users and URL holder | Legitimate short-lived URL fetch succeeds as designed. Substituting an existing victim object's complete path with the original token fails. Ordinary anonymous path reads/signing fail. Already issued URLs remain bearer capabilities until expiry |
| Import and worker authority | All four signed users | Own submitted batch/claimed extension lease succeeds. Foreign cancel/retry fails. Correctly shaped `claim_metadata_job`, `finish_metadata_job`, backup lease/list, tag-store, fandom-claim, archive-source, scheduled cleanup, operator restore and reader-reconcile calls require service authority (`42501`) |
| Export and restore role injection | All four signed users | Exports contain only caller-owned personal rows and omit role/audit tables. Foreign backup preview denied. Injected top-level roles and role-table arrays are ignored by the existing fixed restore allowlist; real own restore succeeds, app role unchanged and other account's export unchanged |
| Extension metadata | All four signed users | Before any positive completion, every victim has a valid live lease. A different signed user supplies that victim's **correct token**, work URL and snapshot; HTTP 409 and lease remains processing. Each actual owner then completes their own lease through the real Edge handler |
| Forged Edge account IDs | All four signed users | `account-status` returns verified caller; tag cache returns only caller's cached rows; backup paths remain under caller; Calibre's injected metadata cannot change destination ownership or app role |
| Connected reader sign-in | All four signed users | Real handoff issue/redeem despite forged user ID yields the issuing account's independent session. Wrong origin, wrong verifier and replay are denied; restored reader session sees only that account's library |
| Administrative metadata | User A/B, Admin, Owner | Ordinary users denied; privileged audit returns exactly `id`, `request_id`, `action`, `outcome`, `occurred_at`, with no victim UUID or private-library metadata. S2's own-row Admin scope remains intact |
| Anonymous endpoints and retirement | Anonymous | Auth-required `account-status`, `extension-metadata`, `save-backup`, `tag-resolution`, `series-preview`, `wayback-lookup` return 401; unknown delivery credential denied; retired `import-worker` remains HTTP 410 |
| Definers / views / Storage policy contract | Fresh embedded PostgreSQL and live local catalog | Four new catalog regression tests pass: forced RLS, invoker views, no app-role exceptions, restricted helpers/EXECUTE, safe search paths and no untrusted schema CREATE |
| Private beta / queue compatibility / recovery | Existing real local integration and recovery scripts | Unapproved direct signup rejected; approved email signup reserves username and requires confirmation; concurrent extension claims/fencing/cancellation, backup retention and synthetic account/EPUB/cloud/association recovery passed |
| Infrastructure bypass | Explicit Service Role / Database Operator | Positive service read demonstrates the existing privileged bypass separately; no browser/app-role grant inferred from it |

Authoritative live report: `artifacts/privacy/local-2026-11-17T01-14-08-256Z.json`, **380 groups passed**, with only metadata and named check results. Filename timestamps are UTC; this run occurred on 16 November in America/Chicago. Intermediate reports are not the final acceptance record. The final report includes explicit successful library-entry, tag and Storage deletions for each role. The logging finding’s failing-before/passing-after regression is recorded below. The full command results and limits belong here rather than in the user README.

## Proven Finding And Narrow Fix

**S3-F01 — Reader Inbox Error Details In Operational Logs.** `server/reader-inbox.ts` copied `Error.message` from a failed Storage operation into `console.error`. A new test uses the actual Supabase Storage client's error handling with an injected synthetic private filename/credential marker. Before the fix it failed because the complete marker appeared in the captured log. The HTTP failure response was already generic.

The catch block now logs only the existing fixed failure label and returns the same HTTP 500/error body. No credentials, object paths, metadata or exception details are copied. The three reader-inbox tests pass after the fix. This source change is **not deployed**; hosted installations need an explicitly approved `reader-inbox` function release after review. No policy or schema changes are required.

Earlier local harness failures exposed missing normalized series fixture URLs, an identifier regex that excluded `ao3` table names, generated-column INSERT payloads, and the distinction between permission errors and empty-row RLS denials. Those test assumptions were corrected before acceptance. They were not application authorization bypasses. No privacy-critical authorization assertion remains failed in the accepted local matrix.

## Commands, CI And Cleanup

Start the verified synthetic stack, apply the existing migrations, and configure its local public origins. Run the guarded Edge runtime in one terminal:

```sh
npm run db:serve
```

Then run, sequentially against that same stack:

```sh
npm run test:privacy:local
npm run test:rbac:local
npm run test:services:local
npm run test:restore:local
npm run test:integration
npm run db:lint
```

The privacy/RBAC scripts require an unbootstrapped synthetic stack and refuse an existing owner. They do not accept hosted targets, external backups or test account IDs. `local-role-fixtures.mjs` reuses S2's real MFA/bootstrap and local teardown in both suites. `syntheticEpub()` is shared with the existing recovery drill. `privacy-catalog.mjs` serves both the live metadata report and embedded tests. No new dependency, application permission or alternate authorization architecture is introduced.

Local operator-only teardown removes only generated fixture assignments/audit events with tracked account/request IDs, then normal Auth/object cleanup. S3 also removes newly created orphan source fixtures while preserving preexisting shared works and other accounts' references. The temporary trigger bypass is solely for disposable local fixture teardown; never use this script or cleanup procedure on staging/production. Neither the privacy matrix nor S2 tests leave a lasting owner. Run them sequentially, not concurrently against the same local project.

The existing CI Supabase job now runs `db:configure`, starts the guarded local Edge runtime, executes privacy/services/recovery checks, and stops the stack through its existing `always()` cleanup. CI logs do not publish tokens or raw response bodies; local reports are ignored. The workflow change is prepared in source, not evidence of a hosted GitHub run. Existing CI has no production mutation job or privileged hosted secret bindings; local negative environment-isolation tests remain in the normal check.

Local verification completed: privacy **380 groups**; S2 real MFA/authorization/concurrency checks; local Edge/connected-login/retirement checks; synthetic recovery; existing live integration **30 checks**; database lint; configuration/isolation **37 tests**; four new catalog tests; organizer and reader type/build checks; ESLint and security checks. The full `npm test` suite passed **2,137 tests across 188 files** after the logging fix; the focused reader-inbox/catalog run passed **seven tests**. Existing Node/jsdom and large-build-chunk warnings are separate from authorization failures.

## Staging Requirements And Open Risks

- **No hosted verification in this workstream.** Complete the separately approved S1 backend prerequisites and obtain explicit S2/S3 staging rollout/test approval, rechecking the independent staging project identity, exact artifacts/migration history, Auth/MFA/beta hook, callback/origin bindings, private buckets, routine owners/grants and current handler versions. Never use the production-linked CLI or reset a hosted backend. Provider credential separation is not proven by local URL guards or source CI checks.
- **The local Docker matrix cannot be pointed at staging.** Prepare a separate guarded synthetic staging fixture lifecycle with approved temporary-owner transfer/recovery and audit retention; do not copy local trigger-bypass teardown. Repeat real signed User A/B/Admin/Owner, anonymous, Storage/signing, valid foreign lease, backup/restore, handoff and delivery tests there. Preserve application-role separation from infrastructure credentials.
- **CORS/protection/browser acceptance:** the local gateway overrides CORS with `*`; handlers' explicit account/login origin denials pass. This does not attest hosted effective CORS, Vercel protection, sibling iframe/callback behavior or browser third-party session restrictions. Browser/native installation tests were not run in this workstream. The HTTP tests verify GoTrue/PostgREST/Storage/Edge identity boundaries; existing reader/extension unit suites and both builds cover compatibility. Installed Chrome/Edge/Safari, Calibre paired devices and protected hosted reader sign-in need staging acceptance.
- **External enrichment/schedulers:** source and unit tests cover worker account/lease authority, and actual authenticated service-only RPC denial is tested. No live AO3/Wayback lookup, external scheduled process, production cron/Vault inventory or remote job routing was invoked. The fixture extension uses repository HTML, and tag tests use fresh per-account cached evidence. Verify deployed enrichment identities, scheduler configuration and retired work-fetch paths separately.
- **Signed capabilities:** a legitimately issued URL or paired/delivery secret grants its documented scope independently of a browser role. Signed URLs can outlive session/reader-access changes until expiry. Capability theft and provider/infrastructure compromise are outside an owner-only RLS claim. Continue short expiry and secret revocation/rotation procedures with separate approval.
- **Source-only log fix:** old hosted `reader-inbox` code may still retain raw error details until its separately approved release. Off-project audit/log retention, infrastructure access controls, full Auth/Storage/config disaster recovery and RTO/RPO remain S4 gates.
- **Deferred functionality:** account suspension/restoration, account directory/diagnostics, administrative library access, learned site mappings and linked crossposts remain unavailable. No suspension/impersonation permission or route was added. Future features need their own cross-layer fixture extension before claiming this matrix covers them.

Stop here for review. Local acceptance does not authorize deployment, push/merge, hosted migration or production release.

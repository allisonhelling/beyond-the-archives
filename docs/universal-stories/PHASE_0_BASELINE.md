# Phase 0 — Compatibility And Contract Baseline

Assessed 12 November 2026 on `universal-stories/00-compatibility-contracts`, based on `main` at `082701d`. The starting working tree was clean. The supplied specifications were found at the workspace's `to_implement/beyond-the-archives-docs/universal-stories/`, rather than the repository paths in the brief, and imported here for tracked maintenance. These documents describe later phases as plans, not implemented features.

## Observed Architecture And Deployment Limits

The organizer remains AO3-only. Numeric `works.ao3_work_id`, application work UUIDs, private entry UUIDs, submitted `original_url`, candidate normalized URLs and verified canonical destinations retain their existing meanings. `effectiveWork` applies private extension observations; `effectiveMetadata` applies manual overrides last. Unknown numeric metadata is nullable; zero current reading progress is a separate legitimate value. Tag aliases require explicit AO3 authority and a category-correct verified canonical root.

The base branch has the isolated crossover policy and legacy name-count runtime filtering. The later hierarchy implementation exists on the separate, unmerged `feat/crossover-filter` branch; Phase 0 neither merges nor replaces that work. Subsequent integration must rerun hierarchy/classification tests from that branch.

The migration chain currently ends at `20261109000300_extension_only_retrieval.sql`. It retires hosted claims, normalizes old retrieval preferences, preserves live leases and fences expired results. `server/import-worker.ts` fails immediately; `supabase/functions/import-worker/index.ts` returns 410; `series-preview` parses supplied authenticated snapshots only. Existing retrieval utilities used by archive verification and tag resolution are not an active hosted work-retrieval worker. Backup save/prune/admin restore utilities remain separate trusted operations. No new migration, identity key, grant, policy, backup version, reader queue version or credential was introduced.

Source code and local tests establish these contracts. Installed companion releases, hosted migrations, scheduled services, deployed Edge Functions and actual production configurations have not been inspected. Existing [source compatibility](../architecture/source-compatibility.md), [source data flow](../architecture/source-data-flow.md), [retrieval cutover](../REMOVE_DIRECT_RETRIEVAL.md), [backups](../BACKUPS.md) and [reader operations](../../reader/docs/IMPLEMENTATION.md) remain authoritative for their detailed procedures.

## Boundary Inventory

| Producer → Consumer | Actual Contract And Correlation | Authentication / Trust / Fallback | Coverage And Upgrade Boundary |
| --- | --- | --- | --- |
| Organizer `imports/extension.ts` → Chrome/Edge `background.js` | Existing `AO3_LIBRARY_CAPABILITIES`, `CONNECT`, `DISCONNECT`, `SAMPLE_CONNECT`, `CAPTURE_WORK`, `PREVIEW_SERIES`, `SYNC`. Capability handshake now optionally uses schema revision 1 and an echoed request ID; other messages retain their callback-correlated legacy shapes. | Chrome external sender URL must match configured app origin and have no extension sender ID. CONNECT authenticates the organizer token against `/auth/v1/user`; it is not an AO3 credential. Auth is kept in session storage; owner changes clear prior state. Missing capability yields existing desktop-companion guidance and manual entry. | `companion-contract.test.ts`, `extension-config.test.ts`, `companions/chrome/background.test.js`, built extension browser tests. Current build version remains 0.7.8; schema revision is separate. |
| Background → capture/content/shared bar | `captureMetadataPage` returns URL/metadata-only HTML. Work/series identity and connection generation are checked. Bar bridge has its own sender/secret checks. | AO3/approved Wayback hosts and extension-created tabs; no AO3 cookie/password forwarding. Returned HTML is untrusted. New organizer validation bounds HTML, verifies identity, and preserves archive timestamp; server parsing is still required. | `capture.test.js`, `bar-background.test.js`, `page.test.js`, `extension-handler.test.ts`. No generic-site or mapping capability. |
| Chrome → `extension-metadata` → leased SQL completion | `ExtensionJob`: `id`, `userId`, lease `token`, numeric `workId`, `expiresAt`, `status`, `mode`, optional chapter dates/source URL. Upload has jobId/token/url/html or timedOut and optional navigation snapshot. Job ID + live token correlates writes. | Bearer auth, bounded body, owned live lease, validated work identity precede parsing. `finish_metadata_job` fences duplicate/expired/cancelled completion. Browser observations stay private. | Handler tests plus actual embedded `extension-only-retrieval`, imports and contract SQL tests. Keep existing server envelope; add adapters before any later breaking upload schema. |
| Safari Userscripts / Chrome bar → `userscript_library` | `p_secret`, action, bigint `p_work`, JSON `p_input`; existing version/base snapshots for checked personal writes. Safari release derives from package 0.1.5. | Paired secret establishes owner; caller cannot select one. Secret stays in userscript manager/extension storage. Live AO3 page identity and shared extraction; Safari does not perform website-queued desktop retrieval. | `supabase/tests/userscript.test.ts`, `safe-edits.test.ts`, shared bar tests, Safari build/browser tests. Keep current envelope; future source addressing requires an explicit additive adapter. |
| Organizer → authenticated RPC / query projections | `StoryInput`/`EditValues`, checked save snapshot, query/filter JSON, owner revision and page/facet caches. Native database/PostgREST error codes remain. | Supabase JWT, owner RLS and checked server mutations. Personal fields/manual corrections are not trusted public facts. Failed writes keep editable UI/review state. | `safe-edits`, `canonical-tags`, `library-query`, account isolation, sample and offline tests. Full ordered migrations before dependent clients; no protocol overhaul in Phase 0. |
| Reader → organizer | `Pending`: UUID, book hash, decimal AO3 `work`, account, base/input version, optional anthology member key. `userscript_library` is shared with companions. | Account-matched pending queue and paired secret; server version/base conflicts. Unidentified EPUBs stay local; guest import strips baselines. | `reader.test.ts`, reader account/anthology SQL suites, `chapter-read-history.test.ts`. No AO3-number reinterpretation for foreign sources. |
| EPUB → reader / organizer recovery | File hash identifies EPUB version; `Book.workId` is decimal AO3 string or null; native chapter IDs and member keys remain distinct. Local metadata-only recovery produces partial fields. | Local parsing/sanitization, explicit association; no identity inferred from chapter number or title similarity. Existing downloaded prose is not part of organizer backup. | Shared synthetic fixture IDs in SQL/reader tests; reader version/history tests. Association after organizer restore is tested through the real identity selector, not a running browser sync service. |
| Backup export → decoder → account restore | `between-chapters-backup` version 1, 20 allowlisted tables; optional legacy reading records. `beyond-the-archives-work` version 1 is a distinct export without a dedicated importer. CSV is not an account backup. | Auth owner, recent owned safety object, preview fingerprint, private-ID remap, shared AO3 identity preservation. Admin restore is a separate service-only operation. | `backups/restore.test.ts`, `account-backup-restore`, `saved-backups`, `backups`, new full SQL round-trip. Reject unsupported backup versions; do not invent a general work-JSON importer. |
| Trusted functions and maintenance | Authenticated `series-preview`, `tag-resolution`, `wayback-lookup`, backup handlers, reader inbox and account/login functions retain existing envelopes. No active hosted AO3 work worker. | Existing server-only service keys, owner derivation, URL allowlists and per-operation validation. Handshake revision does not apply to these APIs. | Existing handler/SQL tests are retained. Hosted service deployment, Deno execution, real Storage/Auth/PostgREST and native Safari remain release checks. |

## Schema Revision 1 And Legacy Policy

Only the capability handshake adds a schema revision. Example actual request:

```json
{"type":"AO3_LIBRARY_CAPABILITIES","contractVersion":1,"requestId":"opaque-request-id"}
```

Successful response:

```json
{"ok":true,"contractVersion":1,"requestId":"opaque-request-id","capabilities":["metadata-retrieval-v1"]}
```

`validCapabilityRequest` accepts the known unversioned capability request. Revision 1 requires a nonempty request ID of at most 128 characters. The extension validates origin before returning anything. Unknown or malformed revisions return `ok:false`, `code:"CONTRACT_UNSUPPORTED"` and update/reconnect/manual-entry guidance. No raw page or token appears in these replies.

`hasMetadataRetrievalCapability` accepts known unversioned replies only when `ok` is true and the capabilities array consists of strings and contains `metadata-retrieval-v1`. Revision 1 must match the requested ID. Unknown optional properties/capabilities are tolerated but do not enable anything; unknown major revisions, malformed arrays and missing required fields fail closed. Neither `generic-site-extraction-v1` nor `visual-mapping-v1` is advertised or enabled.

Captured pages require string URL/nonblank HTML, at most 4,000,000 HTML characters, matching work or series identity and appropriate source origin. Archived captures must retain the requested timestamp and work identity. This is a client parser bound; server limits remain separate and byte-based. Scan replies validate the legacy core state/status enum and row cell types; optional scan extensions retain their established consumers. Full recursive validation of series previews, all optional scan diagnostics and reader/backup envelopes belongs at their existing parsers or a later narrowly scoped adapter, not a new global message framework.

Chrome callbacks correlate each legacy capture/scan operation. Promise settlement ignores duplicate replies; disconnect generation fences late capture/scan replies and connection acknowledgements. The handshake request ID is correlation, not authentication. Work uploads use owner/job/lease identity, checked personal writes use version/base, reader queues use account/member/version, and account restore uses its preview fingerprint. Preserve these guards rather than replacing them with a universal request-ID field. No new envelope is imposed on Safari, reader, RPC or backups; future incompatible operations need negotiated adapters and tests first.

## Mixed-Version Matrix

| Producer / Consumer State | Result / Fallback |
| --- | --- |
| Pre-capability desktop companion + new organizer | Missing `metadata-retrieval-v1` rejects automatic retrieval; existing manual entry remains available. No numeric minimum is inferred for unknown historical releases. |
| Existing 0.7.8 unversioned capability reply + new organizer | Accepted through the documented legacy decoder; current AO3 behavior retained. |
| Revised companion + old organizer | Old capability request still works; added response fields are optional and ignored. AO3 message names and capability are unchanged. |
| Revised companion + new organizer | Schema 1/request ID checked; only recognized retrieval capability accepted. |
| Unknown major/malformed handshake or wrong ID | No connection/retrieval enabled. Companion returns structured unsupported error; organizer availability remains false with existing manual/update guidance. |
| Old Safari script or reader + unchanged backend | Existing paired-secret/base-version protocol retained. No universal source payload emitted. Native Safari installation and hosted mixed-version testing remain unverified. |
| New frontend + missing backend migration/Edge Function | Existing schema/auth/network diagnostics; no fallback to hosted scraping. Verify the complete cutover migration/function deployment before client rollout. |
| Old frontend/preferences + cutover backend | Legacy direct preferences normalize to extension; hosted claims stay disabled; live pre-cutover leases retain existing rules. |
| Old backup v1 + current decoder/restore | Existing supported optional fields normalized; preview, safety copy and owner checks apply. Unsupported format/version rejected. |
| Future crosspost/source-version backup or reader queue | Unsupported today; define additive persistence and explicit decoders before writing new identities. |

## Source Errors And Removal Evidence

`src/lib/source-errors.ts` defines `SourceErrorCode`, `SourceFailure` and `sourceFailure`. The record carries code, operation, optional known source, retryability, recovery text, optional bounded retry-after seconds and removal evidence. It is a presentation adapter; persisted AO3 categories, server retry schedules and current HTTP/SQL schemas are unchanged. `importError` uses recognized normalized codes while preserving existing database diagnostics.

| Existing Safe Signal | Normalized Code | Automatic Retry Guidance |
| --- | --- | --- |
| `rate_limited` / HTTP 429 | RATE_LIMITED | Existing source pause; default 3,600 seconds, honor supplied positive finite pause. |
| `restricted` / HTTP 401 / source login page | AUTH_REQUIRED | Source sign-in or manual correction; no credential collection. |
| `blocked` / HTTP 403 / challenge | ACCESS_DENIED | Source access review; existing backend blocking pause remains authoritative. |
| `not_found`, `unavailable` / 404 or 410 | NOT_FOUND | Verify URL, retain metadata; removal unconfirmed. |
| No current removal-proof producer | CONTENT_REMOVED | Reserved code; even an incoming code alone remains unconfirmed. No automated deletion. |
| `invalid_identity` | UNSUPPORTED_SOURCE | Supported AO3 retrieval URL/manual fallback; universal URL entry remains future work. |
| `partial`, `chapter_dates_unavailable` | UNSUPPORTED_METADATA | Manual field fallback; unknown remains unknown. Existing backend chapter-date retries retain their behavior. |
| `parser_failure`, `redirect`, `changed_identity` | EXTRACTION_FAILED | Inspect page/update companion/manual correction; no blank replacement. |
| `network_error`, `timeout`, `temporary_unavailable` | NETWORK_ERROR | Retry after transport recovery; inspect import history first. |
| Unsupported schema/capability/result | CONTRACT_UNSUPPORTED | Update/reconnect/manual entry; avoid repeated automatic retries. |

The normalized recovery policy does not replace operation-specific backend retryability. Unknown signals, SQL codes and cancellation stay on their existing paths. No current signal is promoted to verified removal. No new deletion flag, persisted error enum, telemetry upload or logging of tokens, page HTML, private content, or cookies was added. Future removal-proof thresholds and any telemetry transport need a separately reviewed producer contract; only aggregate boundary/code/revision counters without identities or content are suitable.

## Fixture Manifest And Layer Coverage

Shared current fixtures are in `src/test/compatibility-fixtures.ts`. The SQL test runs the full ordered migration chain with the repository's PGlite Auth/Storage metadata stubs. Actual SQL extraction/completion/query/export/restore paths execute; this is not a PostgREST, Auth HTTP, Edge runtime or Storage blob test. Reader parsing executes separately with shared AO3 identities; no live third-party requests are needed.

| Spec Case | Current Baseline / Executable Evidence | Future Feature Gap |
| --- | --- | --- |
| 1 AO3 identity/tags/series/collection | `ao3-planned`: parser → validator → owner lease completion → indexed query → backup → account restore; raw categories/series/manual title preserved. Canonical authority separately covered by canonical-tags tests. | Later hierarchy branch must be integrated and retested. |
| 2 Original Work | `original-work`: literal fandom retained through the same round trip. | Original Works starter collection not implemented; Phase 1. |
| 3 Legacy unknown | `legacy-unknown`: missing published/total/word counts remain null through SQL/backup/restore. Standalone EPUB identity coverage retained. | No new count confidence/provenance schema. |
| 4 Manual 1–100000/provenance | Existing StoryForm validation/save tests protect manual AO3 entry without retrieval. | Required universal published total, manual checkbox and 100000 ceiling are Phase 2; current ceiling is 2147483647. |
| 5 Published/planned 12/30 | `ao3-planned` keeps published 12, total 30 and in-progress publication. | New confidence/origin UI deferred. |
| 6 Unread 0/N | All shared fixtures retain `to_read`, progress 0 and `readChapter` 1 after an explicit reset; prior chapter event survives. | Unsupported-site navigation deferred. |
| 7 Finished 20/20 → 20/25 | Existing metadata refresh/reading tests retained. | Decision prompt is Phase 2; do not claim implemented. |
| 8 Finished 20/20 → 20/15 | Existing progress validation and checked saves reject invalid counts/progress; history tested separately. | Explicit reduction confirmation/history UI is Phase 2. |
| 9 New chapters after manual Finished | Existing `reading-history`, model and companion suites protect current status/history behavior. | New universal status-origin indicators and notifications deferred. |
| 10 Divergent linked versions | Reader version tests preserve separate EPUB history; no number-based crosspost sync introduced. | User-linked crossposts, correspondence and unlink are Phase 5; no persistence/round-trip claim. |
| 11 Source failures | `server/ao3/source-errors.test.ts`: deterministic HTTP/DOM/transport → error code → import recovery; failure metadata stays null and no false removal proof. | Reliable confirmed-removal evidence producer not implemented. |
| 12 Companion versions | Pure validators, organizer callback tests and actual background handler tests cover legacy/revised/malformed/unsupported capability and wrong request ID, origin checks and disconnect fencing. | Native installed mixed-version release matrix unverified. |
| 13 Reader association/history | Shared fixture IDs feed actual EPUB import/version replacement. SQL restore preserves work identity and reader selector association; chapter-read/backup suites preserve real events. | A running browser reader synchronizing after an actual account restore is not tested by this adapter check. |
| 14 Account isolation | SQL queries/direct reads exclude Bob; restore leaves shared identities intact. Existing RLS, expired/foreign lease and checked-write suites retained. | Mapping drafts/crosspost rows do not exist; add owner tests when those features ship. |

Future cases above are acceptance targets, not skipped tests reported as passes. Preserve this manifest and extend the shared fixtures when each feature becomes executable.

## Validation Record

Exact final commands/results are recorded here after execution. Initial fixture attempts incorrectly used direct entry mutation and expected a replaceable history column; actual RPC-only writes and history triggers rejected those assumptions. The final fixture uses public saves, companion chapter events and checked progress updates instead. No grants or production code were changed to make fixtures pass.

| Exact Command / Check | Observed Result |
| --- | --- |
| `NODE_OPTIONS=--no-experimental-webstorage npm run check` | Lint and organizer build passed; **174 files / 1,979 tests passed**, followed by all **7** integration-configuration tests. The final security scan initially failed because `supportsMetadataRetrieval(` matched its literal `eval(` detector. The helper was renamed to `hasMetadataRetrievalCapability`; scanner rules were not weakened. The combined command therefore exited nonzero and is not reported as a complete pass. |
| `npm run check:security` | Passed after the rename: frontend boundary, privileged-key build rejection, production-bundle secret canary, confirmed signup and private-beta configuration. |
| `npm run lint` | Final rerun passed with zero warnings. |
| `npm run build` | Final rerun passed, including organizer TypeScript and production bundle. Existing large-chunk warning remains. |
| `npm run build --prefix reader` | Passed reader TypeScript and production bundle. Initial attempt caught a missing event ID in the new test fixture; corrected before the passing rerun. Existing large-chunk warning remains. |
| `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/features/imports/companion-contract.test.ts src/features/imports/extension-config.test.ts server/ao3/source-errors.test.ts companions/chrome/background.test.js supabase/tests/compatibility-contracts.test.ts reader/tests/reader.test.ts --maxWorkers 2` | Passed **6 files / 75 tests** after the handshake helper rename. |
| `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/features/imports/companion-contract.test.ts src/features/imports/extension-config.test.ts reader/tests/reader.test.ts --maxWorkers 2` | Passed **3 files / 37 tests** after the typed handshake guards and reader event-ID correction. |
| `NODE_OPTIONS=--no-experimental-webstorage npx vitest run supabase/tests/compatibility-contracts.test.ts --maxWorkers 2` | Final rerun passed **3 tests**, including the explicit unknown/complete/in-progress publication-state assertions. |
| `npx playwright test tests/e2e/extension.spec.ts tests/e2e/userscript.spec.ts tests/e2e/library.spec.ts --grep 'built .*extension\|built userscript\|manual library workflow'` | **8 passed, 2 skipped**. Built hosted/local desktop extension, userscript bundle/editor/reading actions and desktop/mobile manual workflow ran. The two extension mobile cases intentionally skip because desktop Chrome extensions do not run on mobile. The userscript test uses Chromium/GM fixtures, not native Safari. Required permitted local server/browser execution. |
| `git diff --check`; relative documentation file-link inspection | Passed. All links in the imported universal-story documentation resolve to tracked/current files; original consolidated prompts remain in the supplied workspace folder. |
| Ordered migrations | All **123** replayed in actual embedded PostgreSQL as part of SQL suites; no migration was modified or generated type changed. Auth/Storage metadata stubs do not establish hosted service behavior. |
| Full local Supabase/PostgREST/Storage HTTP integration, native Safari, hosted deployment and installed mixed-version release matrix | Not run: no database/Edge change requires a persistent stack operation, native Safari cannot be established by Chromium fixtures, and production operations were not authorized. These remain release verification, not passing gates. |
| Deno Edge typecheck | Not run: `deno` is absent in this environment. Existing Edge code was not changed. |

`NODE_OPTIONS=--no-experimental-webstorage` avoids Node 25's experimental browser-storage globals in jsdom workers; CI uses the existing Node 22 setup. `npm run check` already includes the new SQL and shared fixture suites through existing discovery. No CI service, dependency, credential or third-party network fixture was added. Existing jsdom `scrollTo` notices remain nonfatal. The initial failing fixture/setup attempts and security naming failure are not counted as successful checks.

## Rollout, Rollback And Manual QA

No database or Edge deployment is required for these additive client changes. Start from the already reviewed extension-only backend chain. Consumers accept known legacy handshakes before revised companion producers ship; then rebuild/reload the existing extension and deploy the organizer as independently reviewed artifacts. Packaging tests cover bundling the shared TypeScript contract into the extension; capability revision 1 is independent of package versions. Normal release version bump/distribution remains an operator step. Never redeploy the retired worker.

Rollback either client to its prior build: AO3 message names, storage, numeric IDs, backend schemas and backups are unchanged. Disconnect/reconnect when changing accounts or builds. Rolling back Phase 0 does not authorize rolling back the extension-only cutover migration. Do not uninstall a companion or discard saved scans as a compatibility repair.

Manual QA still required on actual installations:

1. Save/edit an AO3 story without the extension; blank unknown counts stay blank and personal corrections persist.
2. Try a pre-capability companion: retrieval offers update/manual guidance. Reconnect an existing unversioned-capable build, then the revised build; both support AO3 retrieval.
3. Capture a matching live work, fixed Wayback capture and paginated series. Wrong work/source/malformed result must retain the draft and offer recovery.
4. Pause a scan, disconnect or switch account while capture is pending, and confirm the prior response cannot populate the current account. Saved checkpoints stay available to their owner.
5. On desktop and mobile, exercise current accessible manual-entry/error controls. On native Safari, save/edit/read through the installed userscript; verify old paired scripts remain functional.
6. Export/preview/restore a disposable account with an owned safety copy; reconnect the matching reader EPUB and confirm chapter history/association. Check another account cannot see the data.

## Phase 1 Dependencies And Open Decisions

This baseline adds no universal source identity persistence. Phase 1 must validate real source-version requirements against existing UUID/native-ID boundaries, choose additive provenance/observation storage, define Original Works starter collection behavior and extend backup/reader/owner tests before new writes. Phase 2 owns manual-count prompts; Phase 5 owns crossposts. ML and source-indicator appearance remain undecided. Confirmed-removal evidence, deeper optional legacy envelope adapters and any telemetry transport remain explicit future decisions. Hosted deployment and native-browser release verification are still outstanding; local checks are not production approval.

# Phase 1 — Story Foundation Contracts

Implemented against reviewed `main` at `600ef23` on `universal-stories/01-story-foundation`, 12 November 2026. The working tree was clean before creating the branch. The requested root-level PROJECT_OVERVIEW.md and IMPLEMENTATION.md are actually `docs/PROJECT_OVERVIEW.md` and `docs/IMPLEMENTATION.md`. `Codex commands.md` remains in the supplied workspace planning folder; the delivery requirements from the Phase 0 brief are used here.

## Architecture Matrix And Scope Decision

| Existing Component / Capability | Missing Requirement | Minimal Change / Risk / Verification |
| --- | --- | --- |
| `works.id` UUID, unique nullable `ao3_work_id`; owner-private `library_entries.id`, unique `(user_id,work_id)` | A typed source-neutral identity without changing numeric legacy meanings | `story-source.ts` defines namespaced native or URL identity and a current AO3 source-version adapter. Existing primary/FK/native keys remain intact. Pure collision/URL tests and full SQL round trips protect this boundary. |
| `urls.ts`, SQL checked saves/imports, immutable original submission and independently verified canonical URL | Candidate normalization and original/canonical distinction for Phase 2 | Reuse the existing AO3 parser for works/chapters/Wayback. Unknown sites get conservative URL candidates only. No broader SQL or UI URL acceptance, source extractor, shared foreign row or new network authority. |
| `effectiveWork`, `effectiveMetadata`, private `metadata_overrides` / `extension_metadata`, shared `field_provenance` | Typed count/status observations and honest confidence | Project existing protected layers into `FieldObservation<T>`. Missing evidence/time stays unknown/null; a browser observation or user assertion never becomes verified AO3 proof. No duplicated persisted count/status columns. |
| `Story` combines an effective work with its private organization/progress; reader and anthology identities are separate | Precise logical Story vs Source Version terminology | Current private entry UUID is both logical story ID and single-source version ID. Work UUID remains the shared source-work key. Crosspost linking/splitting will require a later additive association; this does not pre-implement it. |
| `exportWork` JSON v1 and CSV; account backup v1, owner preview/safety/fingerprint restore | A real consumer of the typed source/provenance contract | Work JSON v1 adds optional `source_version` with its own `contractVersion:1`. Existing `work` payload and CSV are unchanged. Account backups need no version change because no persisted field was added. Export and restore fixtures cover native identity, provenance, history and ownership. |
| `seed_starter_collection`, signup initializer, editable automatic rules/membership pipeline | Original Works starter | One forward migration adds a private ordinary automatic collection once. Reuse Any fandom matching for `Original Work` / `Original Works`; no new alias/canonical ontology. Preserve same-named shelves and previously deleted One Shots. |
| Versioned sample seed/upgrades and captured snapshots | Sample starter parity without resurrection | Sample version 11 adds Original Works once to older browser libraries. Fresh seeds carry current version immediately; edits/deletions survive reads. Curated complete defaults remain exact; Reset intentionally restores the bundled default. |
| Fandom UUIDs/source-qualified mappings, AO3 canonical root checks, hierarchy projections | Avoid conflating fandom qualification with story/crosspost identity | These modules and policies remain unchanged. Full classifier/SQL regression suites remain part of the quality gate. |
| Desktop `metadata-retrieval-v1`, Phase 0 schema-1 handshake, Safari/reader paired protocol | Keep mixed-version clients compatible | No capability, request, lease, bigint field, reader pending queue, companion or Edge Function change. Manual AO3 entry remains extension-free. Hosted AO3 work/series retrieval stays retired. |

The scope explicitly allows finalizing a minimal typed contract rather than inventing persistence. Existing AO3 storage already preserves UUID identity, private observations and overrides. A new generalized Story/Source Version table would duplicate current single-source responsibilities and require unneeded query/reader/backup cutovers before Phase 2. This phase therefore finalizes the additive adapter and exercises it through a real export consumer. **Non-AO3 identity representation is implemented; non-AO3 organizer persistence/import remains a Phase 2 integration dependency.** No source re-key, foreign save path, speculative crosspost column or history rewrite was needed.

## Identity And URL Contract

`SourceIdentity` is a discriminated union:

```ts
{ kind: 'native'; platform: string; nativeWorkId: string }
// Or, where no provider-native identity has been established:
{ kind: 'url'; origin: string; normalizedUrl: string }
```

`nativeSourceIdentity` validates a bounded namespace and opaque string identifier. AO3 retains positive, safe, canonical decimal identifiers compatible with `parseWorkUrl`; foreign opaque strings are never converted to numbers or stripped of leading zeros. `sourceIdentityKey` serializes the full discriminated tuple, so AO3 `123`, synthetic `fixture_site` `123`, and an unverified URL cannot collide. Names/titles/authors/fandom mappings do not contribute to story identity.

`sourceLocation` preserves the exact submitted `originalUrl`. AO3 live/chapter/collection/Wayback paths reuse `parseWorkUrl` and return the same native work tuple; a capture is an acquisition locator, not another platform. The candidate work URL is not proof that AO3 currently serves the work. Unknown-site candidates use standard URL serialization, preserving path case, trailing slash, query ordering/values and fragments because unknown site rules cannot justify removing them. Native keys are provided separately by an actual future adapter, never guessed from an arbitrary URL's digits.

Only bounded HTTP(S) public-host candidates without credentials/control characters/local hosts or IP literals are accepted. This is a display/identity normalization contract, **not a network SSRF validator**: it performs no DNS lookup, fetch or redirect handling. A later capture/fetch adapter still needs existing permission/origin/server-side validation and private-network/redirect protections. Existing AO3-only save/import allowlists remain unchanged. URL candidates confer no canonical tag, fandom or crosspost authority.

`StorySourceVersion` revision 1 carries private story/version IDs, shared work UUID, owner ID, nullable source identity, exact original URL, candidate URL, independently verified canonical URL/time, typed published count/status and existing personal reading state. Legacy deleted bookmarks keep `identity:null`; their bookmark IDs are never substituted for work IDs. Compact/reader identities, file hashes, anthology member keys and chapter ordinals keep their existing contracts.

Canonical evidence is exposed only when the stored canonical URL exactly matches the AO3 work identity and has a parseable verification timestamp. No normalized candidate, archive capture, manual field or export-generated timestamp creates canonical proof. Source/version IDs in an exported snapshot are informational; they are not authorization or a new accepted save/import payload.

## Metadata Provenance And Publication State

`FieldObservation<T>` carries `value`, `source`, `confirmation`, nullable `observedAt`, and explicit `manualOverride`. The two current consumers are published chapter count and existing `Metadata['publication_status']`; generic typing permits later fields without making them mandatory.

Precedence follows existing effective metadata:

1. The existing private Deleted availability projection wins for publication status, with source `private_availability` and confirmation `unknown`. This does not prove live source removal.
2. Presence of the actual private manual field yields `manualOverride:true`, source `manual` and `user_asserted`. A nested user JSON claim of verified AO3 provenance is ignored. Legacy per-field manual timestamps were not stored, so `observedAt:null` is retained; unrelated entry edit timestamps are not substituted.
3. Actual private browser field presence yields `browser` or `archive`, with `observed` confirmation only for a known value. Its recorded page-capture success time is used when available; this is not falsely described as a distinct field observation time.
4. Existing shared field provenance explicitly attributed to AO3 yields `ao3` / `observed` with its recorded retrieval time. Untyped/absent legacy provenance stays unknown. Field confidence never inherits canonical URL verification.

Current valid published counts include legacy zero and nullable unknown; invalid/out-of-range values normalize to null in the adapter. The future new-manual-story 1–100000 rule is a Phase 2 workflow constraint, not a global legacy database invariant. No count is backfilled. Unknown count differs from unread numeric progress zero.

Publication status reuses `unknown`, `in_progress`, `complete`, `hiatus`, `abandoned`, and `deleted` from existing Metadata. Reading status continues using the existing database enum; it does not become a confidence flag or change when this adapter reads/exports metadata. No new enum or inferred global status was introduced. The adapter does not save anything, modify a source record or trim historical chapter events.

Manual overrides and observations remain protected by existing owner RLS, checked saves/base snapshots, server-only shared writes and lease fencing. The adapter reads those layers and is not an API for submitting trusted provenance. Persisted per-field manual times, mapping provenance and general-source writes must be added through checked owner-only mutations when the corresponding Phase 2/3 workflow exists; a downloaded JSON field is never a trusted writer.

## Original Work And Original Works

`20261112000100_original_works_starter.sql` follows the hierarchy migrations. It adds `seed_original_works_collection(uuid)`, an internal SECURITY DEFINER initializer with empty search path and revoked public/anon/authenticated execution. It reuses the signup trigger initializer, calling the existing One Shots initializer and the new helper for new accounts. A one-time backfill calls **only** the new helper for existing accounts, avoiding resurrection of a previously deleted One Shots collection.

The ordinary collection has `default_key:null`, existing palette color `#07534a`, the existing book symbol and Any fandom rules for the exact labels `Original Work` and `Original Works`. It can be renamed, recolored, reordered, converted to manual and deleted. Existing same-named collections are preserved through the existing owner/name unique constraint. The matcher does not rewrite source labels, grant canonical synonym evidence or conflate Original Work with another fandom.

No seeding occurs on reads or restore. A restored v1 backup without this starter intentionally leaves it absent. Normal owner policies and automatic document/membership/revision maintenance apply; there is no second collection system or new user-callable seeding endpoint. Existing spine/tile colors and CSS remain unchanged. Sample version 11 mirrors the one-time introduction and preserves same-named user collections, prior deletions and exact curated snapshots.

## Compatibility, Fixtures And Rollout

The Phase 0 fixtures now compare typed source identity and provenance before/after actual PostgreSQL account restore, allowing intentional private-ID remapping while preserving shared work ID, original URL, history and owner. Unit fixtures cover foreign native-ID collisions, opaque keys, public URL validation, unknown counts, browser/archive/shared/manual precedence and canonical verification. Existing AO3 tag authority, hierarchy, series, Wayback, DNF, Safari and reader suites remain unchanged regression gates.

`original-works.test.ts` upgrades a populated pre-migration database, snapshots works/private entries, verifies no metadata/count/history change, preserves an edited same-named shelf, checks new-account initialization and two-owner isolation, exercises real automatic matching/conversion/deletion, and restores an older backup with intentionally absent starters. The sample tests verify version-10 introduction and version-11 deletion/rename preservation; desktop/mobile browser coverage exercises the real shelf/editor/deletion controls and existing spine previews.

The account backup remains `between-chapters-backup` v1 with its existing allowlisted tables. The work JSON export remains `beyond-the-archives-work` v1 and adds only optional `source_version` revision 1; old consumers can continue reading `work`. CSV, reader queues, companion capabilities, native AO3 IDs, DNF storage and account restore envelopes are unchanged. No new persisted field means no backup translator or row backfill is required. The work JSON envelope still has no dedicated importer; new snapshot fields do not make it an account restore file.

For an existing local stack use `npx supabase migration up --local`, then `npm run db:lint` and `npm run test:integration`. Do not reset established data. The helper is internal and requires no PostgREST/Edge release. Review the normal hosted migration dry run and apply only with explicit operator authorization; deploy the frontend independently after reviewing the additive export/sample change. Earlier clients tolerate ordinary new collection rows because they already support editable automatic collections.

The one-time collection backfill invokes existing membership/revision maintenance. Its cost for large hosted libraries or many simultaneous accounts was not benchmarked here; review that workload before rollout. It does not rewrite work identities, metadata or reading history.

Rollback frontend changes without dropping user collections or evidence. Leave the additive database initializer in place unless a separately reviewed forward migration changes it. Users can edit/delete the starter; do not delete matching shelves globally or run seeding repeatedly as a repair. No production deployment, push or data cleanup was performed.

## Verification Record

Commands and final results are recorded after execution. Embedded PostgreSQL replay checks actual ordered SQL with minimal Auth/Storage metadata stubs; it is not hosted PostgreSQL/PostgREST/GoTrue/Storage service verification. Initial test attempts found outdated starter counts and a stale sample version marker, plus a test-only nullable-ID TypeScript error; fixes preserve actual migration and seed semantics instead of weakening validation.

| Exact Command / Check | Observed Result |
| --- | --- |
| `NODE_OPTIONS=--no-experimental-webstorage npm run check` | Final run passed: ESLint, organizer TypeScript/Vite build, **182 files / 2,025 tests**, **7** integration-configuration tests and security canaries. This includes SQL owner/grant checks, canonical tags, hierarchy, Wayback, series, DNF, backups, Safari/shared companions, reader and Phase 0 fixtures. An earlier run stopped on the nullable test-ID TypeScript error before it was corrected. |
| `npm run db:types:embedded` | Passed full **126-migration** replay and type generation; `src/types/database.ts` has no diff. No hosted types were generated or edited. |
| `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/features/library/story-source.test.ts src/features/backups/csv-export.test.ts supabase/tests/original-works.test.ts supabase/tests/compatibility-contracts.test.ts --maxWorkers 2` | Passed **4 files / 20 tests**, including final export snapshot and cross-layer provenance assertions. |
| `NODE_OPTIONS=--no-experimental-webstorage npx vitest run supabase/tests/starter-collections.test.ts supabase/tests/original-works.test.ts --maxWorkers 2` | Final rerun passed **2 files / 7 tests** after strengthening deletion-by-ID and restored-null assertions. |
| `npm run lint` | Final rerun passed after the browser/test updates, zero warnings. |
| `npm run build --prefix reader` | Passed separate reader TypeScript and production build. |
| `VITE_SAMPLE_DATA=true npx playwright test tests/e2e/sample.spec.ts --grep 'Original Works\|Update Sample Data\|Reset Sample Data\|sample collections preview'` | **8 passed** across desktop/mobile: new starter matching/editor/deletion/reload, existing spine artwork, captured defaults and reset. Browser runs required permitted local server/Chromium execution. |
| `npx playwright test tests/e2e/features-guide.spec.ts tests/e2e/library.spec.ts tests/e2e/crossover-filter.spec.ts tests/e2e/backup-restore.spec.ts --grep 'exports one work\|manual library workflow\|stages verified\|previews a compressed backup'` | **8 passed** across desktop/mobile: actual JSON/CSV download and typed source snapshot, existing Unfolded association, manual entry, crossover state/defaults and backup UI. Backend transport fixtures are mocked; actual SQL restore is independently covered above. |
| `git diff --check`; documentation file-link and migration-ledger checks | Passed; all **126** ordered migration filenames appear in the ledger and universal-story file links resolve. |
| `docker info --format '{{.ServerVersion}}'` | Sandbox first denied socket access; permitted read-only retry confirmed the Docker daemon is not running. Full local `npx supabase migration up --local`, `npm run db:lint` and `npm run test:integration` were not run. Start the configured disposable local stack before these checks; no established data was reset. |
| Hosted migrations/Auth/PostgREST/Storage, live source recovery, native Safari and installed mixed-version rollout | Not performed or established by local tests. No production access/deployment was requested. Native Safari cannot be verified by Chromium/shared-bar fixtures. |

Node 25 local tests disable experimental webstorage globals; repository CI remains configured for Node 22. Existing Vite large-chunk warnings and jsdom `scrollTo` notices were nonfatal. No live third-party fixture request, service-role browser credential, new dependency, CI bypass or test-timeout increase was introduced.

## Changed Paths

| Area | Paths |
| --- | --- |
| Typed adapter and current consumer | `src/features/library/story-source.ts`, `src/features/library/work-export.ts` |
| Existing collection/sample implementation | `src/features/library/collections/automatic-collections.ts`, `src/features/library/sample/repository.ts` |
| Forward migration | `supabase/migrations/20261112000100_original_works_starter.sql` |
| Unit and SQL fixtures | `src/features/library/story-source.test.ts`, `src/features/library/sample/repository.test.ts`, `src/features/backups/csv-export.test.ts`, `supabase/tests/original-works.test.ts`, `supabase/tests/starter-collections.test.ts`, `supabase/tests/compatibility-contracts.test.ts` |
| Browser regressions | `tests/e2e/sample.spec.ts`, `tests/e2e/features-guide.spec.ts` |
| User/system documentation | `README.md`, `docs/PROJECT_OVERVIEW.md`, `docs/IMPLEMENTATION.md`, `docs/architecture/source-contracts.md`, `docs/architecture/source-data-flow.md` |
| Phase contracts and handoff | `docs/universal-stories/README.md`, `docs/universal-stories/01-story-architecture.md`, `docs/universal-stories/08-security-and-migration.md`, `docs/universal-stories/09-compatibility-contracts.md`, `docs/universal-stories/IMPLEMENTATION_PLAN.md`, `docs/universal-stories/PHASE_1_FOUNDATION.md` |

## Manual QA And Phase 2 Handoff

1. Upgrade a disposable populated local stack; verify existing AO3 IDs, unknown counts, private history and deleted One Shots are unchanged.
2. In a fresh account verify Original Works is an ordinary automatic shelf. Save works using each fandom variant, edit/convert/reorder/delete the collection, and reload on desktop/mobile. No removed starter should return.
3. Export a corrected AO3 work as JSON/CSV. Verify original/canonical links, private overrides, nullable counts and the optional typed snapshot; older work JSON readers should still read `work`.
4. Restore a disposable v1 backup with and without starters, using a preview and owned safety copy. Confirm another account cannot read the data and the reader still associates the same AO3 EPUB/chapter history.
5. Verify sample upgrade from version 10, edited/removed starters, Reset Sample Data and exact captured defaults. Confirm existing artwork/colors remain unchanged.

Phase 2 must connect general-source manual persistence to the namespaced candidate contract through trusted owner-only validation while retaining AO3-specific save/import authority. The present AO3 table/API allowlists are intentionally unchanged; non-AO3 entries must not be sent through the AO3 alias/classification path merely because a TypeScript identity exists. Add per-field manual timestamps/provenance persistence, required-count checkbox/ceiling and Finished count-change review with their actual write workflow. Phase 5 owns confirmed crosspost associations and independent version progress; no equivalence inference or linking has been implemented here. ML and final source-indicator design remain open, as specified.

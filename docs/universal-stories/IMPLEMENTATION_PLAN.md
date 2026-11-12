# Universal Story Tracking — Implementation Plan

**Status:** Proposed implementation sequence derived from the accepted specification. These phases describe deliverables, not a claim that the work has been completed. No release dates are committed.

## Git Branch Strategy

Use **one reviewable feature branch per phase**. Branch names are recommendations, not a claim that branches already exist. Start Phase 0 from the repository's current integration/default branch; after reviewing and merging each phase, create the next branch from the updated integration branch. Confirm the actual default branch (`main`, `develop`, or another) rather than assuming its name. Do not stack unfinished phase branches unless intentionally coordinating dependencies.

| Phase | Suggested branch |
|---|---|
| 0 — Compatibility and contract baseline | `phase/00-compatibility-contracts` |
| 1 — Validate and extend the existing foundation | `phase/01-story-foundation` |
| 2 — Universal manual stories and reading progress | `phase/02-manual-stories-progress` |
| 3 — Extension extraction and visual mapping | `phase/03-extension-visual-mapping` |
| 4 — Classification and bulk imports | `phase/04-tags-bulk-imports` |
| 5 — Crossposts and version-aware reading | `phase/05-crossposts-reading` |
| 6 — Hardening and broader site support | `phase/06-hardening-site-support` |

Before creating a branch, run `git status --short` and `git branch --show-current`; protect existing uncommitted changes. Example, after confirming a clean working tree and updating the intended base branch: `git switch -c phase/00-compatibility-contracts`. Never force-switch, reset, push, merge, or deploy automatically. Keep each phase's migrations, contract fixtures, tests, and documentation together in its own review.

## Cross-Phase Requirements

- Treat Phase 0 contracts and normalized-work fixtures as a regression gate for every subsequent phase; update schemas, error mappings, and fixture expectations with intentional behavior changes.

- Reuse the **already prepared multi-site architecture**. Audit the actual schema, types, RPCs, import paths, and extension contracts before adding migrations; do not assume a new identity refactor is needed.
- Preserve existing AO3 work IDs, canonical tag evidence, reading progress/history, series, collections, Wayback links, private overrides, exports, and archives unfolded sync.
- Keep original/source observations separate from manual overrides; field-level provenance and status derivation must be explicit.
- Manual save/edit must remain possible without a desktop extension; do not reintroduce retired hosted AO3 retrieval.
- Add migration, RLS, account-isolation, backup/restore, and regression tests for every persisted contract.

## Phase 0 — Compatibility And Contract Baseline

Implementation record: [Phase 0 Baseline](PHASE_0_BASELINE.md). The actual branch is `universal-stories/00-compatibility-contracts`, based on `main`; the suggested name below is not a requirement to rename it. Local verification and native/hosted release verification are recorded separately. Later-phase product fixtures remain explicit targets in the baseline manifest.

**Suggested Git branch:** `phase/00-compatibility-contracts` (create from the current reviewed integration branch after the previous phase is merged).

**Goal:** Establish safe interoperability between independently deployed components and a regression baseline **before** implementing new universal-site features. Reuse existing contracts and unsupported-option checks; do not rewrite working integrations.

- [x] Inventory live boundaries: organizer, Chrome/Edge companion, Safari userscript, archives unfolded reader, Edge Functions, database, and any active workers; document observed versions, payloads, auth, and rollout order.
- [x] Define explicit contract schema versions distinct from component versions and advertised capabilities; retain existing `metadata-retrieval-v1` semantics.
- [x] Specify and implement/validate narrow request/response/error envelopes at existing boundaries, with legacy compatibility and safe `CONTRACT_UNSUPPORTED` behavior.
- [x] Create a mixed-version capability matrix covering old/new companions, reader, Safari, and staged backend upgrades; verify manual fallbacks.
- [x] Standardize source error codes and recovery actions; require positive evidence before treating a missing page as permanently removed.
- [ ] Build sanitized normalized-work fixtures for AO3, unknown/manual counts, status changes, crossposts, errors, EPUB association, and account isolation.
- [x] Add cross-layer contract tests through import, persistence, search, export/restore, and reader association where supported; document unavailable CI boundaries.
- [x] Document telemetry privacy, deployment sequencing, rollback, and test commands; avoid production changes.

The fixture item remains partially open: current AO3/Original Work/nullable count, unread reset/history, source error, capability, EPUB and account-isolation baselines execute. The manifest records future manual 1–100000/provenance, count-change prompts, starter collection and linked-crosspost scenarios; their production contracts do not exist yet. Extend fixtures in Phases 1, 2 and 5 rather than inventing persistence or reporting those scenarios as passing. Matrix verification is local automated coverage; native Safari and hosted mixed-version rollout remain unverified.

**Exit criteria:** Existing AO3 and EPUB flows pass baseline checks; incompatible payloads fail safely; transient failures cannot silently delete work data; contract tests provide a reusable gate for Phases 1–6.

**Spec:** [Compatibility contracts, errors, and cross-layer tests](09-compatibility-contracts.md).

## Phase 1 — Validate And Extend The Existing Foundation

Implementation record: [Phase 1 Foundation](PHASE_1_FOUNDATION.md), branch `universal-stories/01-story-foundation` from reviewed `main` at `600ef23`. This phase finalizes typed source/provenance contracts against existing protected storage and adds the ordinary Original Works starter; general-source persistence remains an explicit Phase 2 dependency.

**Suggested Git branch:** `phase/01-story-foundation` (create from the current reviewed integration branch after the previous phase is merged).

**Goal:** Confirm the prepared architecture supports planned source versions and universal metadata without breaking AO3.

- [x] Inventory implemented multi-site seams in database, TypeScript types, repositories, import paths, and companion.
- [x] Define or confirm Shared Story, Source Version, source-specific URL/identity, and independent progress ownership.
- [x] Define or confirm field-level provenance: source/extracted/mapped/manual, verification, observation time, and overrides.
- [x] Specify publication status separately from reading status and chapter-count confidence.
- [x] Confirm migration/backward compatibility for nullable legacy counts and AO3 identities.
- [x] Define Original Work fandom and editable/deletable Original Works starter collection using existing collection semantics.
- [x] Add migration/RLS, restore/export, and existing AO3/EPUB regression coverage.

Verification above means the local automated baseline: pure/SQL/reader regressions, embedded migration replay and desktop/mobile sample checks. Full local Supabase/PostgREST, native Safari and hosted rollout remain unverified. Legacy field observation times are nullable and honest; persisted per-field manual timestamps/mapping provenance belong with their actual Phase 2/3 write workflows.

**Exit criteria:** No destructive migration or new universal identity collision; existing AO3 and EPUB reading flows pass tests.

**Specs:** [Architecture](01-story-architecture.md), [Security and migration](08-security-and-migration.md).

## Phase 2 — Universal Manual Stories And Reading Progress

**Suggested Git branch:** `phase/02-manual-stories-progress` (create from the current reviewed integration branch after the previous phase is merged).

**Goal:** A user can save and track a story from an unsupported URL without automatic extraction.

- [ ] Accept arbitrary valid story URLs in the universal single-story entry flow; preserve submitted vs verified source URL.
- [ ] Add chapter count input with **1–100,000** validation and **Manually entered chapter count** checkbox.
- [ ] Keep legacy unknown-count entries valid; distinguish single-story requirements from deferred bulk review.
- [ ] Preserve unread `0/N` and Read Chapter 1 next action where navigation is available.
- [ ] Implement manual published chapter progress, source URL/location, and independent publication status.
- [ ] Implement status confidence/origin indicators and field-aware filters (including Needs Completion Verification).
- [ ] Increase total: preserve read progress; prompt for explicitly Finished stories whose new total exceeds progress, defaulting to keeping progress; allow deliberate 25/25 or Finished override.
- [ ] Decrease total: save normally if progress remains valid; if total falls below progress, block pending explicit review/confirmation.
- [ ] Preserve chapter-read history by default when adjusting current progress; separately warn before explicit history deletion.
- [ ] Distinguish automatically derived status from manual status; preserve manual Finished and Re-Reading decisions.
- [ ] Add acceptance tests for 0/N, status derivation, increased/decreased counts, and historical events.

**Exit criteria:** Unsupported-site manual tracking works end-to-end; no silent progress loss or unauthorized status change.

**Specs:** [Reading progress](06-reading-progress.md), [Imports](04-imports.md).

## Phase 3 — Extension Extraction And Visual Mapping

**Suggested Git branch:** `phase/03-extension-visual-mapping` (create from the current reviewed integration branch after the previous phase is merged).

**Goal:** Users can extract, preview, correct, and map story metadata from an active page.

- [ ] Extend existing companion capability negotiation for generic extraction and visual mapping.
- [ ] Build in-tab right-side save/edit panel showing **actual extracted values** and personal fields.
- [ ] Support field-first and element-first inspect-style selection, Esc/Cancel, Pause Selection, and safe overlay teardown.
- [ ] Keep mapping drafts separate from story drafts; preserve edits through extension/web handoff.
- [ ] Offer Use Once, exact-URL, URL-pattern, and site-wide scopes; never silently promote one-page mapping.
- [ ] Build selector validation, health status, fallback selectors, suggested repair with explicit review, and versioned JSON export/import.
- [ ] Manage saved mappings under Settings → Imports & Connections → Site Mappings with contextual access.
- [ ] Validate origin, user activation/permissions, account association, request IDs, expiry, and result payloads.
- [ ] Support disconnected/unsupported/uninstalled extension manual-entry fallbacks.
- [ ] Test changing DOM, failed extraction, permissions, and account isolation.

**Exit criteria:** Unknown-site active-page extraction and manual mapping work without silently altering other pages or saved rules.

**Specs:** [Site integrations](02-site-integrations.md), [Extension](03-extension-experience.md).

## Phase 4 — Classification And Bulk Imports

**Suggested Git branch:** `phase/04-tags-bulk-imports` (create from the current reviewed integration branch after the previous phase is merged).

**Goal:** Classify tags predictably and process many story URLs without blocking on incomplete metadata.

- [ ] Preserve raw tags, source-provided categories, and AO3 canonical verification boundaries.
- [ ] Implement deterministic classification and user correction scopes (story, site+fandom, site, fandom, global).
- [ ] Implement site-only above fandom-only default, adjustable explicit priority, and equal-priority conflict review.
- [ ] Add Tag Explorer, classification explanations, and My Classification Rules.
- [ ] Add recognized-only and all-links bulk import modes with preview/deduplication.
- [ ] Queue unknown published counts as nullable, resumable reviews, not zero or failed imports.
- [ ] Default missing-count review to 25/page with 10/25/50 options; allow filtering for active reading.
- [ ] Add review retry, checkpoint persistence, batch failure isolation, and regression tests.
- [ ] Keep ML disabled; deterministic system must stand alone.

**Exit criteria:** Unresolved tag/count cases remain reviewable without losing imported stories or inventing categories.

**Specs:** [Tag classification](05-tag-classification.md), [Imports](04-imports.md).

## Phase 5 — Crossposts And Version-Aware Reading

**Suggested Git branch:** `phase/05-crossposts-reading` (create from the current reviewed integration branch after the previous phase is merged).

**Goal:** Link source versions under one story while preserving independent source progress and history.

- [ ] Implement suggested possible matches vs user-confirmed same-story links; reversible unlink.
- [ ] Preserve per-source URLs, chapter counts, publication state, tags, notes where applicable, and progress.
- [ ] Build source switcher and Compare Versions UI; defer final tile source-indicator appearance.
- [ ] Support 1:1, 1:many, many:1, unmatched, and unknown chapter correspondence.
- [ ] Require verified correspondence for chapter-level progress sync; do not use larger chapter number as conflict resolution.
- [ ] Keep source progress independent by default; add explicit sync/conflict review.
- [ ] Handle source caught-up vs shared-story Finished using publication evidence and user intent.
- [ ] Show completion prompt only for linked, divergent versions with meaningful evidence; avoid repeat prompting for the same state.
- [ ] Preserve manually Finished states on newly observed chapters and show new-content notices.
- [ ] Test divergent editions, split chapters, cross-account isolation, unlink, backup/restore, and reader compatibility.

**Exit criteria:** Crosspost linkage cannot erase progress or fabricate chapter equivalence.

**Specs:** [Crossposts](07-crossposts.md), [Architecture](01-story-architecture.md), [Reading](06-reading-progress.md).

## Phase 6 — Hardening And Broader Site Support

**Suggested Git branch:** `phase/06-hardening-site-support` (create from the current reviewed integration branch after the previous phase is merged).

**Goal:** Release stable multi-site workflows and selectively extend adapter coverage.

- [ ] Add structural AO3-compatible fork detection without assuming shared AO3 canonical tag authority.
- [ ] Implement and test prioritized developer-maintained site adapters (FF.net; Wattpad only if chosen).
- [ ] Harden mapping repair, import/export, permission scoping, security, accessibility, and performance.
- [ ] Verify companion release compatibility, migrations, rollout/rollback, and user documentation.
- [ ] Run end-to-end regression suites for AO3, generic sites, Safari/manual fallback, and archives unfolded.
- [ ] Measure deterministic tag classifier errors; evaluate optional browser-local ML only if useful, with opt-in, privacy, and abstention criteria.
- [ ] Revisit source indicator visual design and optional top-level mapping navigation only if usage warrants.

**Exit criteria:** Supported site workflows pass release checks; optional ML and source-indicator aesthetics remain independently deferrable.

**Specs:** [Site integrations](02-site-integrations.md), [Tag classification](05-tag-classification.md), [Security](08-security-and-migration.md).

## Acceptance Checklist

Phase 0 acceptance includes mixed-version handshake/unsupported capability, transient-vs-confirmed-removal classification, and round-trip normalized-work fixture invariants. See [09-compatibility-contracts.md](09-compatibility-contracts.md).

The supplied consolidated reference (workspace planning source) contains **20 detailed end-to-end acceptance scenarios**; they remain part of this plan. In particular: unknown URL import; teach-from-correction; reusable site mapping; tag conflict and provenance; fork detection; unsupported chapter navigation; linked crossposts and completion; new chapters after completion; bulk review; unread 0/N; manual status uncertainty; count increase/decrease with historical events; and divergent crosspost chapter groups.

## Still Open (Do Not Silently Decide)

1. Final source indicator design.
2. Whether browser-local ML is worthwhile, and model/corpus/evaluation thresholds.
3. Exact payload schemas, evidence thresholds, storage migrations, and Undo mechanics to be finalized against current implementation. Phase 0 establishes the **policy and validation boundaries**, not invented deployed wire formats.

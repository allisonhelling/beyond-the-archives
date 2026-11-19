# Phase 6 Release Readiness

**Release gate open.** This branch implements the source adapters and hardening locally. Staging, live-site browser tests, native devices, and hosted recovery remain required. No deployment was performed.

## Source Capability Matrix

| Source | Desktop Chrome/Edge Capture | Chapter And Identity Behavior | Browser Acceptance |
|---|---|---|---|
| AO3 | Existing work and series capture, paired reading controls, and website import queue | Existing AO3 identity, observed chapter links and reader progress | Existing installed Chromium fixtures. Live AO3 and native browser checks remain part of staging. |
| Fixed Wayback Capture Of AO3 | Existing private snapshot capture through the desktop companion | AO3 work identity with original snapshot URL and historical observations | Existing fixture contract. Availability depends on the snapshot. |
| FanFiction.net Desktop | Candidate recognition for `fanfiction.net` and `www.fanfiction.net` desktop `/s/` URLs. Capture visible title, byline and optional summary from a recognized header. | Private URL identity preserves the submitted chapter URL. Supply the chapter count manually or through a confirmed mapping. Chapter indexing, tags, and publication status have no built-in FF.net extraction. Desktop redirects and challenge pages use the generic review/manual flow. | Synthetic DOM fixtures. The public page showed the expected visible fields, and direct retrieval returned HTTP 403. Installed browser acceptance remains pending. [Public example](https://www.fanfiction.net/s/5782108/1/Harry_Potter_and_the_Methods_of_Rationality/) |
| AO3-Compatible Work Pages | Detect the work route plus visible work preface, metadata list and chapter container. Capture title, optional byline/summary and declared Fandom, Relationship, Character and Additional tags from same-origin categorized links when present. | Private URL identity and classification scoped to the source origin. Archive tag links convey labels and categories. Canonical equivalence and automatic chapter navigation require independent evidence. Discovery without a mapping uses All Links as Candidates. | Source-derived and negative DOM fixtures. Verify each archive independently. [OTW work view](https://raw.githubusercontent.com/otwcode/otwarchive/master/app/views/works/show.html.erb) · [OTW metadata template](https://raw.githubusercontent.com/otwcode/otwarchive/master/app/views/works/_meta.html.erb) |
| Other Sites, Including Wattpad And The FF.net Mobile Subdomain | Generic structured, page or semantic metadata where available. Editable review, visual mapping and manual entry. | Exact private URL, user-managed chapter totals and basic progress. Website queues need page evidence or a working URL-specific rule. | Unknown-site, malformed data and restricted DOM fixtures. Wattpad remains a conditional adapter candidate. |

The adapters use the existing source preview and checked story writer. A working saved mapping can override a detected field. A reusable rule remains Needs Review until explicitly confirmed on a distinct matching page. Imported and broken rules remain in review until repaired. A selector can still return plausible text after a layout change, so inspect extracted values before accepting them.

Phase 5 carryover includes author-link evidence beyond saved summaries, generic chapter indexes and titles, and grouped facet and reading-section counts. Existing source-specific progress and correspondence remain available. [Phase 5 Delivery](PHASE_5_CROSSPOSTS.md)

## Browser And Mixed-Version Compatibility

| Combination | Expected Path |
|---|---|
| Current organizer and companion 0.8.1 | Chromium 120 minimum in the MV3 manifest. Existing revision-1 capabilities, URL preview, active-tab editor with keyboard controls, mapping review, website batch and manual fallback. |
| Current organizer and 0.8.0 | Existing generic extraction and mapping contract, with the older selector-validation behavior. Update to 0.8.1 for the two adapters and explicit second-page confirmation. A recognized desktop FF.net URL may require manual review with the older companion. |
| Current organizer and AO3-only companion reporting `metadata-retrieval-v1` | AO3 retrieval continues through the existing capability check. Other sites can use manual entry. |
| Chrome/Edge permissions unavailable, restricted page, or no companion | Use **Add Story → Enter Manually**. Existing saved edits and progress remain accessible. |
| Safari Userscripts and organizer on mobile | Paired on-page AO3 controls and manual organizer entry for other sites. Website queues and visual mapping require desktop Chrome/Edge. |
| Archives unfolded | Existing EPUB import/open, organizer connection, reading-state sync and Calibre handoff. Adapter detection and crosspost editing run in the organizer. Check unknown URL version linking without assigning an AO3 ID to an EPUB. |

## Ownership, Privacy, And Retention

| Surface | Boundary And Evidence |
|---|---|
| Source Versions And Correspondence | Source versions use owned entries. Group and correspondence writes validate the caller, pair, revision and chapter structure. The private correspondence tables are reached through scoped RPCs. Embedded coverage exercises linking, unlinking, conflicts, divergent chapter groups and account isolation. Live local integration verifies owned linking and independent progress. |
| Mappings And Classification | Row policies restrict reads to the owner. Checked writers use the authenticated owner and expected version. Portable mapping files omit previous/current extracted values and import with fresh IDs. Classification uses origin and explicit category for foreign sources. Both rule types are outside the main account backup. Settings offers classification JSON export for review and a mapping export/import round trip. |
| Drafts And Messages | The external router matches the configured organizer URL origin. Handoffs require the top frame and its document. Requests correlate the account, tab, document, URL and expiration. The editor iframe uses the extension origin, while selectors run in an isolated script. Account checkpoints read only the latest 20 entries within seven days. Physical pruning occurs on draft writes. Tab/request state uses browser-session storage, with pending tab records removed on tab closure and request expiry enforced on read. Time-based physical erasure of all expired handoff payloads is not established. |
| Access And Page Content | Only explicit toolbar access authorizes generic website injection. No additional host grants are shipped. Generic handoff rejects local/credential-bearing addresses, unsafe protocols and recognized secret-like URL parameters. Selector and adapter capture bounds plain-text metadata fields and excludes invisible controls, forms and editable elements. Chapter containers are structural signals and their prose is not read by the new adapters. Treat a reviewed metadata observation or manual note as private user data that can appear in JSON exports. |
| Queues And Exports | Real local integration exercises concurrent claims, expired/cancelled leases and cross-account isolation. JSON backup versions 1–3 preserve supported account data and checked restore. Review mapping export separately and treat browser drafts, original EPUB bytes, live leases and provider recovery as separate recovery surfaces. Retired hosted AO3 retrieval is still a separate staging smoke check. [Backup scope and restore](../BACKUPS.md) · [Retrieval cutover](../REMOVE_DIRECT_RETRIEVAL.md) |

## Manual Acceptance Matrix

| Area | Scenario |
|---|---|
| Unknown Or Blocked Source | Save a public unfamiliar URL manually with 12 chapters. Confirm 0/12, reopen the original URL, then verify chapter 1 becomes the next target when an explicit link is available. Repeat with a browser-denied tab, malformed markup, and a same-document route change. |
| FF.net And Forks | Compare public FF.net desktop header values against the preview. Open a challenge or login page and check for blank adapter fields. On each available archive, verify the foreign tag namespace, no AO3 work ID or canonical aliases, and separation of identical work IDs across origins. |
| Map And Repair | Use Once, save an exact rule, create a matching rule, and confirm it only after inspecting a different matching story. Replace or remove its primary selector. Verify repair, portable export/import, and that a broken rule cannot qualify a bulk capture. |
| Bulk And Classification | Use both link modes. Import a 100-item batch with 12 unresolved totals. Reopen review, change page size, and check stale edits and progress filtering. Test same-priority conflicts, and confirm site corrections and provenance remain limited to the chosen scope. |
| Progress And History | Exercise 20/20 with unknown completion, explicit Finished followed by 25 published, 15 published with progress review, and history retention. Check 100,000 accepted and 100,001 rejected. |
| Linked Versions | Link and unlink different saved sources. Finish one version, then add a chapter and verify the group status and update signal. Map two source chapters to one destination chapter. Verify that completing only the first source chapter leaves the destination unread and preserves both histories. |
| Accessibility And Devices | Use Tab/Enter, Pause Selection, and Escape from the source page and inside the panel. Check that focus returns after closing the panel and dialogs, that provenance and conflict warnings are available without color, and that live output announces selection and errors. Verify zoom, reduced motion, and narrow layouts using a screen reader on at least one desktop and mobile device. |
| Account And Recovery | Switch between two accounts with open draft and queue tabs. Verify drafts, saved stories, and checkpoints stay private. Export and restore versions 1–3, compare link and reading history, and confirm mapping portability separately. Test older companions against the staged app and observe the retired worker response. |

## Performance Measurements

`npm run perf:sites` runs a deterministic synthetic fixture using the same preview, classifier, and embedded PostgreSQL RPCs as the application. The following are single local observations. The benchmark omits network transfer, browser page load, permission prompts, and hosted concurrency.

| Operation | Observed |
|---|---:|
| Preview 2,000 URLs against 1,001 cached mappings, with one matching origin | 3,406.9 ms before grouping by origin, 77.2 ms after |
| Classify 30 observations using 1,000 cached rules across 2,000 pages | 4,480.6 ms total |
| Submit a 2,000-link batch | 3,913.8 ms |
| Read page 4 of a 100-story unresolved review, 25 per page | 200.3 ms |
| Resolve 25 rows at 100,000 chapters each | 914.7 ms |

The classification rules in the benchmark matched every label by construction. Use the conflict and provenance fixtures for logic checks and the evaluation plan below for quality metrics. Max chapter count checks exercise totals and progress, with chapter links resolving only when evidence exists. The 2,000-link test measures queue submission, not completion speed.

The organizer preview loads paginated mappings. The companion currently reads up to 1,000 mapping rows and caches them for a bulk lane. Reopen the lane to capture with updated mapping rules. Classification rules use their existing revision check.

The existing 10,000-work browser suite passed all four Chromium cases for desktop/mobile rendering and revision-aware refresh using fixture transport. Initial results rendered in 2,047 ms desktop and 1,216 ms mobile. The 250-result page took 636 ms desktop and 460 ms mobile. Database benchmarks and established thresholds are tracked separately. [Performance gates](../PERFORMANCE.md)

The embedded database benchmark at 1,000 works per account measured a 52 ms first page, 58 ms manual collection page, and 510 ms navigation reduced to 1 ms with a warm cache. Full-text filtered selection took 2,018 ms, and its candidate count took 2,317 ms. The filtered count missed the existing 100 ms target. The 10,000-work database run was stopped after 24 minutes and 37 seconds without a first measurement.

## Verification Record

Results use Node 24, synthetic fixtures, and the loopback Supabase stack.

| Check | Result |
|---|---|
| `npm run check` | Both runs passed lint and build and stopped in Vitest. The first had 2,192 passes and three failures. The CI-configured run had 2,191 passes and four failures in app navigation, backup settings, imported-series notice, and an embedded reading-history test. All four passed targeted reruns, with the reading-history file run in full to preserve its fixture setup. App-test failures also occurred on the unchanged base. Separate final lint, build, and 46 integration-configuration checks passed. |
| `npm run test:integration` and `npm run db:lint` | Passed 32 live checks and database lint. Integration exercised manual saves, Finished-count guards, owned crossposts, concurrent import claims, backups and beta boundaries. |
| Adapter, Mapping, And Classification Unit Tests | Passed 14 focused tests. The database retry passed the site-bulk lease/count and clean/populated migration suites. The separate focused run passed the mapping, classification, crosspost, and privacy-catalog suites. |
| `npm run test:rbac:local` | Passed on a sequential rerun. User A, User B, Admin and Owner retained private library boundaries. Synthetic role fixtures were cleaned up. |
| `npm run test:privacy:local` | Passed 430 checks after refreshing the synthetic staff MFA immediately before the privileged audit requests. The application retains its five-minute recency check. Synthetic fixture cleanup passed. |
| Local Edge And Restore | Passed account authentication, handler origin checks, connected login and replay denial, retired worker HTTP 410, and synthetic universal/reader data recovery with cross-account denials. |
| `npm run perf:browser` and `npm run perf:sites` | Passed. See measurements above. |
| Organizer Browser Checks | Passed all 12 desktop/mobile manual story cases and four userscript fixtures. Connected mode passed both crosspost browser cases and both installed AO3 extension artifacts. An isolated installed Chromium run passed permission denial, editor handoff, draft recovery, route teardown, bulk capture, selector preview, pointer and keyboard confirmation across two matching pages, and focus retention after Pause with reduced motion emulated. |
| Organizer Offline Browser Checks | Both Chromium cases passed after retrying preview startup. |
| Organizer And Reader Dependency Audits, Dependency Audit Fixtures, Security Gate | Passed. |
| Reader Build, Unit Tests, And CI Browser Cases | Build passed. 107 unit tests and eight Chromium Calibre/cloud tests passed. The browser tests used an isolated source archive with the intact root Playwright install after the reader-local copy failed to load. |
| Calibre | Ten Python tests and the local ZIP build passed. Native and additional OS acceptance remains pending. |
| Deno Edge Type Check | Passed for all nine checked-in Edge entrypoints under Deno 2. |
| Native And Hosted Checks | Pending for the full browser CI matrix, installed Edge, native Safari, real-screen-reader announcements and reduced motion, live FF.net and representative forks, hosted performance, and independently verified recovery. |

## Rollout And Rollback

1. Inventory the intended staging target and its exact installed migration prefix. Preserve the existing recovery evidence and prepare synthetic accounts and compatible prior artifacts. Phase 6 introduces no SQL migration. Reconcile and apply the missing ordered source chain through `20261118000300_crosspost_organization.sql`, including the manual-story and review dependencies, then mapping, classification, bulk import, and the three crosspost migrations. Validate fresh and populated upgrades and Auth, Storage, grants, and RLS on staging. The existing S4 recovery and provider gaps remain release gates. [S4 Readiness](../security-foundation/S4_RELEASE_READINESS.md)
2. Verify the configured origins and Edge boundaries, including the retired worker. Build the organizer, reader and companion for the matching environment. Verify old clients against the expanded database, then test 0.8.1 and the organizer together. Complete the browser, device, performance and recovery gates before seeking production approval. [Release Controls](../security-foundation/PRODUCTION_ROLLOUT_RUNBOOK.md)
3. If staging fails, pause website captures, retain versioned exports and queue checkpoints, and return to the last compatible organizer and companion pair. Leave the additive schema and data in place. Preserve a reader build compatible with the stored IndexedDB and cloud contracts. Reconfirm the current mapping health after extension rollback because 0.8.0 can revalidate rules automatically. Keep hosted AO3 work retrieval retired. Use a reviewed forward fix for schema issues and the independent recovery procedure for actual data corruption. [Recovery And Staging Acceptance](../security-foundation/RECOVERY_AND_STAGING_ACCEPTANCE.md)

## Open Product Decisions

- **Source Indicator Design.** Keep existing fixed tile colors and the bookspine. The current comparison dialog labels sources and the preferred version in text. The tile uses its existing progress and status treatment. Compare a text badge for legibility, a stripe for density, a segmented spine for multiple versions, and combinations for discoverability. Measure whether people can identify the preferred source and number of versions without relying on color, including at narrow widths. Design selection and usability results remain pending.
- **Mapping Navigation.** Keep Settings and contextual entry points. Gather evidence about task frequency, navigation time, and failed discovery before considering a top-level destination.
- **Wattpad.** If selected, inspect public story and chapter routes using the browser permission model. Validate header/metadata against manual labels, SPA route replacement, stale content, duplicate routes, login/deletion/region gates, and consent interstitials. Start with bounded, visibly supported fields and preserve the original URL.
- **Optional Browser-Local ML.** Keep disabled and unnecessary. First label a consented or synthetic evaluation set independently, stratify by origin, tag category and ambiguous case, and hold out source and fandom groups. Measure deterministic precision among assigned labels, coverage, ambiguous/abstain rate, and false assignment by category and site. Evaluate any approved prototype against the same holdout, recording incremental correctly resolved cases, regressions, model bytes, cold and warm latency, memory, storage/egress and deletion behavior. Fixture assertions check classification mechanics. Representative accuracy, latency on real devices and meaningful incremental benefit are still unmeasured. Model, corpus, and thresholds remain open.

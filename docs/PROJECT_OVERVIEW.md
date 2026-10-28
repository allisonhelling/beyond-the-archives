# Project Overview and Specifications

Current repository specification for **Beyond the Archives — A PRIVATE AO3 ORGANIZER**, reviewed **27 October 2026**, package version **0.1.5**. This describes implemented behavior, not a claim that a hosted deployment has been upgraded. The ordered SQL migrations, generated types, and source files are authoritative for exact database signatures and validation.

[Run and Use the App](../README.md) · [Implementation and Operations](IMPLEMENTATION.md) · [Engineering Instructions](../AGENTS.md)

## Purpose and Current Scope

Beyond the Archives is an invitation-only, private AO3 library and reading tracker. It separates a work’s factual AO3 information from each reader’s progress, corrections, notes, ratings, and organization. Readers can save a work even when AO3 metadata is inaccessible, then correct or recover information without losing reading history.

The application has three cooperating parts: a responsive website, Supabase authentication/database/functions, and optional browser companions. Direct metadata retrieval uses a separately running trusted worker. A development-only sample library substitutes browser storage for account-backed persistence.

Implemented capabilities include manual and link entry, bulk imports, CSV review, browser-list scanning, series previews and saved series details, author pages, advanced filtering, automatic collections, chapter history, exports, full backup restore, and DNF archiving. `/stats` provides calendar-filtered reading statistics. Automatic email notifications, automatic future-installment import, and scheduled backup creation are not delivered features. Roadmap text and early phase reports may describe plans beyond the current implementation.

## Main Workflows

1. An operator configures Supabase and invites an account. The reader accepts the invitation, sets a password, and signs in. Recovery links return through `/auth/callback`.
2. The reader adds a work manually, submits a link, recovers metadata from an EPUB, reviews CSV data, or explicitly starts a browser scan. Personal library identity can persist before metadata retrieval succeeds.
3. Library and Currently Reading show server-paged results. The reader filters, groups, sorts, opens details, edits personal information, or follows an AO3 reading link.
4. Website reading controls change saved progress/status. The AO3 companion also supports in-page reading actions and chapter records from the loaded chapter.
5. New metadata observations refresh factual information. Private manual corrections retain precedence; proposed historical reading changes require review.
6. Settings provides display preferences, retrieval choices, exports, backups, restoration, and optional DNF cleanup. Full backups provide recovery of details that a compact DNF archive intentionally omits.

## Routes and Navigation

| Route | Responsibility |
| --- | --- |
| `/reading` | Currently Reading dashboard and filtered reading results; default destination |
| `/library` | Library shelves, custom collections, work/series results |
| `/add` | Link, manual, and EPUB-assisted story entry |
| `/imports` | Link/CSV imports, Library Sync, reading-correction review, previous batches and reports |
| `/stories/:id` | Private saved-work details and editing |
| `/authors/:name` | Saved works credited to that exact author name, including coauthored works |
| `/series/:id` | Basic series identity and saved works, optionally loaded full AO3 details |
| `/settings` | Account, import/retrieval, browsing/display, portability and cleanup settings |
| `/settings/example-work`, `/settings/example-series` | Display editor examples |
| `/stats` | Monthly/yearly volume, profiles, favorites, trends, comparisons, and chapter activity heatmap |
| `/features` | Feature explanations and roadmap |
| `/import-fic` | Compatibility redirect to `/add?import=link` |

Authentication gates the connected application; development-only sample mode starts signed in and supports logout and re-entry with username **Sample** and password **123** through the same login screen. Sample logout survives reloads within the tab and preserves saved browser data; password recovery is a local UI preview. Settings and Log Out are exposed in the profile menu. Secondary settings/import/series pages load lazily, while reading/library routes are eager. Route definitions live in [`App.tsx`](../src/app/App.tsx).

## Work Identity and Metadata Contract

| Data | Specification |
| --- | --- |
| AO3 identity | Normally a unique numeric AO3 work ID; one private library entry per account/work. Deleted bookmark-only entries can have no AO3 work ID. |
| Submitted link | Preserve the original work/chapter URL separately from a verified canonical work URL. Editing or EPUB recovery cannot replace an existing work’s identity. |
| Canonical URL | Normalizing a candidate URL alone does not verify it. Verification requires matching AO3 evidence. |
| Factual metadata | Title, authors and optional author links, fandoms, plain/formatted summary, categorized tags, rating, language, words, published/planned chapters, dates, statistics, series membership and available identifiers. |
| Effective metadata | Shared factual information and account-private browser observations are combined with private manual overrides. Manual corrections take precedence. |
| Unknown values | Nullable chapter/word counts and completion remain unknown; zero is not a substitute for missing information. Missing later observations preserve saved fields. |
| Publication status | `unknown`, `in_progress`, `complete`, `abandoned`, or `deleted`, independent of reading status. Private work availability also distinguishes `unknown`, `available`, and `deleted`. |
| One-shot | Complete single-chapter works or exact case-insensitive “One-shot”, “One shot”, or “Oneshot” AO3/personal tags; a private manual override can correct detection. |
| Formatted summaries | Safe semantic HTML is stored separately from plain searchable text. Active content and unsafe attributes are removed. Manual plain-text corrections override older formatting. |

AO3 Relationships, Characters, Additional Tags, warnings, and relationship Category retain distinct meanings. Personal tags are independent. Legacy unclassified tags are available to broad search but excluded from category-specific filters until classified. Author pages query saved effective metadata; they do not fetch the author’s complete AO3 catalog.

The model is implemented in [`model.ts`](../src/features/library/model.ts), with exact persisted fields and RPC types in [`database.ts`](../src/types/database.ts). The [schema and access reference](IMPLEMENTATION.md#schema-and-access-model) explains the foundation and ownership rules.

## Reading and Personal Data Contract

The seven reading statuses are `to_read` (To Read), `reading` (Reading), `paused_reading` (Paused Reading), `waiting_for_updates` (Waiting for Updates), `re_reading` (Re-Reading), `finished` (Finished), and `did_not_finish` (Did Not Finish).

- Progress is the number of fully read chapters. Chapter IDs are identifiers, not positions. Only explicit verified numbered chapter mappings establish positions or trusted next-chapter destinations.
- A verified explicit chapter-link location at position N represents N−1 fully read chapters. Unverified links retain their original destination and do not invent progress. Explicit chapter-link actions and metadata-only refreshes have different intent; refreshes preserve reading location.
- Caught Up finishes a complete work or puts an ongoing work into Waiting for Updates. Unknown publication status retains the current reading status. Reading all known published chapters of an abandoned work can finish it despite a larger planned total.
- Mark as Finished uses published chapters, falls back to planned chapters when only that is known, and preserves progress when neither is known. Pausing retains progress; resuming restores the applicable active reading state.
- Rereading opens another start/finish range while preserving the earlier range. Imported finishes may have an unknown start. Pause/resume retains the current range. Reading dates represent recorded events, not measured time spent reading.
- Favorites, editable Recs, personal star ratings, notes, tags, and collection membership are private. Source bookmark Rec observations are distinct from the reader’s editable Rec choice. Personal ratings use one through five stars or no rating.
- Concurrent edits use saved baselines/conflict review rather than silently overwriting newer personal changes. Supported reading/deletion actions offer a two-minute Undo snapshot managed above route changes.

For unsaved works, the first-chapter top bar orders Add to Library, To Read, and Reading; Reading saves `reading` with progress 0. Only that chapter’s top bar offers To Read. The first chapter’s bottom bar and both bars on later chapters offer Mark Read; the bottom of a complete final chapter uses Finish Fic (including one-shots). Read actions save the entry, advance through the selected chapter, and reuse chapter-history capture. In Entire Work, each chapter’s trailing bar uses its own ordinal. Unknown/ambiguous chapter positions omit read actions; the latest WIP chapter remains a normal caught-up action. Listing tiles retain their separate To Read shortcut.

Companion Mark Read/Finish actions on a loaded chapter can record chapter number, counted words, server timestamp, and reread evidence. Word counting excludes summary, notes, and controls; only the count is uploaded. Marking through a later chapter also records earlier newly completed chapters, counting their text locally from the loaded page or one full-work fetch. Unavailable text yields an unknown count. The confirmation below the AO3 bar offers Undo, which restores prior reading state and removes the entire action’s history records using a server snapshot and strict version guard. Manual progress changes do not generate historical chapter word counts. Chapter records appear in Story Information and survive backups and DNF reading archives. Details are in [AO3 metadata capture and display](IMPLEMENTATION.md#ao3-metadata-capture-and-display).

## Search, Navigation, and Collections

Library and Currently Reading reuse the same query/filter system, cards, sort/group controls, and suggestions. Library applies filters within the selected shelf/collection. Currently Reading has active/status sections, including To Read, Waiting for Updates, Paused Reading, and Re-Reading. New Chapter requires an existing undismissed notification and verified unread destination; browsing does not itself fetch updates or create notifications.

The search grammar supports spaces for AND, `||` for OR, quoted phrases, leading `-` for NOT, `*` wildcards, and backslash escaping. AND/NOT bind before OR. Matching ignores case/accents and ordinary terms can match substrings. Invalid syntax shows an error. Search scopes include Any Field, Summary, and Notes.

Fandom selections are OR conditions; selected categorized tags must each match. Publication status, AO3 content rating, personal rating, favorites, Recs, notes, one-shot, series membership, and saved metadata dates provide additional predicates. AO3 update-date bounds are inclusive UTC dates. Clear filters retains sort/group preferences. Grouping supports fandom, author, and series; multi-valued works can appear in each relevant group.

Canonical tag evidence augments exact canonical selections with AO3-verified synonyms. It never substitutes related tags, subtags, or a guessed spelling match. Standard Tags appear before unverified suggestions; original fic tags remain unchanged. The same matching applies to ordinary results, series, automatic collections, and counts. Resolver details and refresh/retry rules are maintained in [Canonical Tag Suggestions](IMPLEMENTATION.md#canonical-tag-suggestions).

Manual collections store explicit memberships. Automatic collections use the shared filter predicates and derived memberships; conversion to manual snapshots the current matches. Names, summaries, colors, symbols, order, and appearance are editable. Hiding is a browser preference and does not delete content. Deleting a collection preserves its works. Bulk collection selection and movement reuse existing shelf controls. One Shots is an editable/deletable starter automatic collection, not a shelf recreated on every read.

Paged queries filter before pagination and use deterministic sorting with an identity tie-breaker. Random sort retains its seed while paging/reloading. Pages default to 50 items and allow 25/50/100/250. Browsing URLs preserve query state and support return-position restoration. Toolbar page-size overrides reset on reload; Settings owns the persistent default. Library/collection filter defaults are browser-scoped; saving a library-wide default clears collection-specific defaults. Pages above 100 results use variable-height virtualization; browser Find sees mounted cards only.

Series queries materialize merged work and metadata stages once per series and build normalized text only for an active search scope. Series-only result pools exclude work cards after retaining their context for series aggregation. Saved works are grouped once across series, and the merger receives a stored compact input derived atomically from each effective search document. Series context reads are independent of full work-card documents. The client queues series page, suggestion, catalog and navigation-count reads so results load first without concurrent series scans. Browsing carries compact saved-work identities and series organization through the shared merger; facets skip card payloads and materialize only suggestion fields. Full detail callers retain their original payload contract. The existing owner-private revision cache also retains one merged series pool for subsequent collection, sorting and filtering reads; ordinary matching identities and the series pool share the existing 20-entry bound. Client page caching retains 20 pages. Source edits advance the same revision used by the existing caches. Ordinary work reads remain parallel. Series requests select and hydrate the page from the same pool; work-only requests retain the revision-bound identity cache. Compact navigation avoids full preview aggregation. Catalog and navigation work context read a stored compact document instead of full source overlays, history, chapter maps or summary HTML; the same compact membership/identity fields select cold series candidates. Catalog cancellation uses the existing request signal handling.

The current query architecture uses owner-scoped effective search documents, indexed navigation fields, derived automatic memberships, revision-based identity/count caches, and separate facets. The client checks revisions on foreground return and import completion, with a 45-second visible-tab fallback. A new result’s cards/count commit together; errors retain known values with retry instead of displaying a false zero. Suggestion and result failures share an alert/retry layout with underlined retry labels on hover or keyboard focus, and consistent cause-specific messages for timeouts, expired sessions, missing migrations and connection failures. Full identities/details load on demand. Exact cache budgets, benchmark conditions, and rollout requirements are maintained in [Performance](PERFORMANCE.md#revision-based-navigation-and-counts).

## Series Contract

A basic series page derives from saved library works and memberships without fetching AO3. Official total words/completion remain unknown until full details are loaded; basic totals cover saved works only. Series completion is distinct from series reading status and from completion of individual works.

An explicit preview is temporary. **Load** saves a private full metadata snapshot, potentially including unsaved works; it does not import those works. **Refresh** updates that snapshot. **Remove** discards downloaded details while preserving saved works and private series organization. Notes, favorites, collections, and finish actions can operate with a minimal series identity.

Reading status is derived from saved installments: active reading or a Finished/To Read mixture is Currently Reading, all To Read is To Read, and all Finished is Finished. Unsaved preview works do not participate. An explicit Finished state can remain when no works are saved; adding a work recalculates it. Marking a series Finished changes only saved works and preserves their other personal fields.

Series link imports, scanned series, and Related Series review reuse the shared work picker. Each list, CSV, pasted-link or Add Story link import has an unchecked **Check Series Containing Imported Works** option. Off limits discovery/review to directly bookmarked series and supplied series links or series lists; on also checks memberships of imported works. The existing Choose/All behavior applies independently. Scans persist this choice across pause/resume and batches; older saved scans retain their original all-series behavior. Completion review excludes already reviewed series and includes opted-in CSV works already kept in the library. Save appears only for series absent from saved series records and verified memberships of saved works. Save controls use compact vertical padding to preserve review spacing. Loading previews can be cancelled with Cancel, close, or Escape; cancelled reviews ignore late responses and cannot automatically import works. Saving details and submitting imports still block dismissal. Completed writes release the picker before background library refresh finishes; failed writes retain downloaded previews for retry. Header/footer controls hide it immediately after saving; Save All Series skips existing series and disappears when none remain to save. Overlaps deduplicate; no unselected work is imported. Saving full series details is independent from importing installments. Named manual series without AO3 IDs remain filterable but have no AO3 series page. See [Series Import Previews](IMPLEMENTATION.md#series-import-previews) and the [companion guide](../companions/chrome/README.md) for listing and selection limitations.

## Import and Recovery Contracts

| Method | Behavior and Limits |
| --- | --- |
| Manual entry | Work URL and title required; optional personal/factual fields; no AO3 request needed to save. |
| Wayback snapshots | Fixed 14-digit HTTPS Wayback captures wrapping supported AO3 work/chapter links; optional `id_`/`if_` modifiers. Retains snapshot URL, deduplicates by AO3 ID, retrieves archived metadata privately via the existing worker or Chrome capture. No archived series/list scans or wildcard capture searches. | Archived imports are automatically marked Deleted through the existing private availability/publication projection, including after metadata retrieval; personal reading state is preserved.
| Work/chapter links | Up to 2,000 URL tokens per submission; database validates identity independently; saved entries and persistent metadata jobs are separate. |
| Series links | Preview and select installments before importing; saving details does not automatically import missing works. |
| CSV | Up to 2,000 unique works and 20 MB per review; supports scraper exports and source-list distinctions; personal-data conflict review supports Keep/Overwrite. |
| EPUB | Up to 50 MB; metadata-only local recovery with bounded decompression and corruption checks; encrypted metadata unsupported. Missing fields preserve editor values, and existing identity cannot change. |
| Library Sync | Explicit browser scan with durable account-scoped checkpoints; page-sized import transactions; 500 pages per batch across listings/series. |

Add Story offers **Import Source → Import from Wayback Machine** with a dedicated snapshot URL field; pasting a supported snapshot in the normal link field selects this source automatically. The work details page observes the originating import batch so metadata and failures remain visible when retrieval finishes during navigation. Wayback imports preserve the historical source in submission history and new entries. Replay-rewritten links are normalized for metadata/identity parsing. Historical observations remain private, do not verify a live canonical URL or current availability, and preserve manual corrections. Archive requests cannot redirect to live AO3 or another work; no current chapter-index request is added. Saved reading destinations retain the capture instead of assuming another archived chapter exists. Missing archive metadata leaves the saved identity editable. Chrome/Edge v0.7.6 requires archive host permission; Safari is not used for import retrieval.

Link submissions can save bare work identities while retrieval is pending, restricted, or unavailable. Import history preserves inputs/results and exposes retry/cancellation where allowed. An explicit existing-work chapter import may change reading location; bulk repeat-import observations preserve personal history unless the reader approves corrections. Later personal edits invalidate conflicting proposals or queued inference.

New bookmark entries can infer Finished when their bookmark date is later than work update date; earlier/same-day bookmarks remain Reading. Optional chapter-date verification estimates only a consecutive prefix strictly before the bookmark day. Missing or ambiguous evidence remains unconfirmed. Marked for Later adds new works as To Read and keeps existing entries. These are import inferences, not proof that AO3 tracked reading. CSV personal overwrite remains an intentional replacement path separate from factual metadata refresh.

Full scans support user/pseud Works, Bookmarks, Series, Marked for Later, filtered listings, tag/search pages, and AO3 collections. Combined collection scans visit Works and Bookmarks; Import to New Collection can create a manual collection. Series encountered are expanded once, without recursive discovery of every other series. External bookmarks are skipped. Deleted bookmarks retain available bookmark identity and information; absence from a list never proves deletion.

Quick Sync is limited to complete unfiltered user Bookmarks/Marked for Later lists. It stops after the first overlapping page, retaining all observations on that page. A baseline advances only after the complete scan’s imports are acknowledged. Ranges, early-ended scans, and intermediate batches do not advance it. End Scan stops new primary-list discovery but finishes discovered series and enabled chapter-date checks before review. Continue From Previous Scan resumes at the next uncaptured page, before or after importing results; unimported checkpoints are preserved.

Scans use one owned AO3 tab, durable page checkpoints, and 15-second default spacing configurable from 5–3,600 seconds. Restrictions, login requirements, unexpected pages, missing tabs, and timeouts pause for manual resolution. DOM capture cannot read HTTP Retry-After headers. Reconnect the same account after restart to resume; private checkpoint data stays on that device until imported/discarded. Saved reports persist separately and expose skipped-entry/chapter-date evidence, factual repairs, series repairs, and proposed reading corrections. The report selector pages ten reports at a time.

The bookmark-conflict results panel compares saved and incoming personal data in a two-column grid (one column on small screens), with maroon hover-underlined work links. Each work has explicit Keep Saved Data and Use Incoming Bookmark actions. Applying incoming data replaces notes, tags, and reading state through the existing listing import with the post-import expected version; stale reviews are rejected. Deleted-bookmark choices replace notes/tags only. Unrelated ratings, favorites, collections, and manual metadata corrections remain protected.

Repeat observations update nonempty factual fields while preserving manual corrections; zero statistics and false completion flags are meaningful values. Source bookmark observations and reading provenance remain distinct from personal data. Review Reading Corrections can accept individual/multiple proposals or keep history; reading-only approval never replaces notes, tags, ratings, favorites, or collections. See [Repeat Import Repairs](IMPLEMENTATION.md#repeat-import-repairs) for provenance and deployment dependencies.

## Runtime Architecture and Security

| Layer | Responsibility |
| --- | --- |
| Website | React 19/TypeScript, Router 7, Vite 7, Tailwind CSS 4; authenticated shell, shared library state, feature repositories and reusable UI. |
| Supabase | Auth, PostgreSQL, owner-scoped RLS, narrow transactional RPCs, private backup Storage, and authenticated Edge Functions. |
| Direct worker | Trusted Node process or scheduled `import-worker` invocation; claims persistent jobs, retrieves bounded AO3 metadata, and commits fenced results. |
| Chrome/Edge | Built extension with AO3 controls, authenticated metadata capture/jobs, series previews, scans, checkpoints, and local sample integration. |
| Safari | Built userscript with paired AO3 reading/personal controls; no metadata-job processing or Library Sync. |
| Sample mode | Development-only browser repository backed by bundled snapshots/local storage; explicit local-extension imports can add data without Supabase. |

The main persisted families are shared works/authors/fandoms/tags and their relationships; private library entries, personal tags and collections; saved series and series memberships; reading timelines/archives; imports/jobs/logs; metadata preferences and companion device pairings; backup state; tag evidence; and derived search/query caches. Foundation table descriptions alone are not the complete schema.

Anonymous access is denied. Account ownership derives from verified authentication and database policies. Composite ownership keys prevent cross-account memberships. Browser code receives public configuration only; service-role/secret credentials stay in trusted processes. Shared metadata and queue mutations follow restricted server/RPC paths. Browser-origin metadata stays private to the account. Sign-out clears account-specific client caches. Paired AO3 reading-bar devices remain authorized until explicit revocation/disconnection; website sign-out does not revoke them.

Desktop/mobile retrieval preferences are independent at the 1,100 CSS-pixel layout boundary; mobile can inherit desktop. Each queued job retains its original mode. Direct and extension queues have distinct claims/leases and pacing. The direct global gate spaces eligible requests by at least 15 seconds; a one-job-per-minute schedule has a nominal 60-job/hour ceiling. Extension jobs wait three seconds after successful completion; scans use their separate configurable gate. These are implementation limits, not throughput guarantees. See [retrieval capacity](PERFORMANCE.md#retrieval-capacity-and-fairness).

## Display, Exports, and Data Lifecycle

Display settings independently arrange tiles and information pages for work/series and mobile/desktop profiles. Field visibility, grouping, and order are configurable; tag shapes/colors remain shared. Desktop tile editors preview both profiles with independent save/cancel. Screen previews share the actual responsive styles and support preset or exact dimensions. New metadata fields start hidden to preserve existing arrangements. Phone collection editing places Done Editing beside Select Collections. During selection, Done Editing and Hidden sit above Cancel Selection, the selected count, and Edit Selected. Work reading controls reserve room for the rating heading and constrain collection buttons to the remaining column. Companion chapter controls use a full-width toolbar row on phones and retain their reading-action order.

CSV ZIP export supports works, series, collections, memberships, and optional archived reading records. It covers all pages and includes private organization. Structured cells use JSON; spreadsheet-formula-like text is escaped. CSV is an analysis/export format, not a complete restore format.

Full versioned JSON backups include account data and allowlisted browser preferences. Downloaded JSON/JSON.gz and private Supabase copies can be previewed for restore. Replacement requires confirmation, saves a safety copy, checks for edits since preview, and preserves other accounts/shared metadata. Saved storage retains three successful files per account, limits files to 50 MiB, and gates save attempts to once per minute. Local downloads have no such storage quota. No automatic save schedule is installed. Exact format, exclusions, and administrator commands are maintained in [Backups](BACKUPS.md).

DNF cleanup is disabled by default with a seven-day retention setting. Presets are 24 hours, 7, 30, or 60 days; custom durations range from 24 hours to 3,650 days. Default protections cover favorites/Recs, notes, ratings, tags, and manual memberships; queued/processing metadata jobs always protect entries. Manual previews process up to 100 entries per confirmation. Optional background execution runs at minute 17 hourly when explicitly installed. Archival and removal commit together; compact reading records preserve reading context/history but omit full notes, tags, summaries, maps, and memberships. Routine imports skip archived identities until an explicit add starts another lifecycle. See [DNF Cleanup](DNF_CLEANUP.md) for the exact recovery and scheduling contract.

## Development, Deployment, and Verification

Node 22.12+ and npm are required. The authenticated local stack also needs Docker and Supabase; sample mode does not. All startup, public/server environment configuration, companion builds, production preview, shutdown, and optional local reset procedures are maintained in [Run Locally](../README.md#run-locally).

Hosted deployments require the complete ordered migrations through `20261028000600_compact_library_catalog.sql`, appropriate Auth redirects/invitation settings, affected functions, the selected worker, and rebuilt companions. Frontend production output is `dist/`; companion outputs are `extension/dist/`, `extension/local/dist/`, and `userscript/dist/`. A frontend build performs no hosted migration or deployment. DNF scheduling and worker scheduling are separate operator actions.

`npm run check` covers lint, TypeScript/build, Vitest, integration-configuration tests, and security checks. Playwright, live local Supabase integration, database lint, dependency audit, and performance runners are separate. Embedded PostgreSQL tests exercise real migrations/RLS but simulate the Auth contract; browser tests use mocked transport. Neither demonstrates deployed AO3 throughput or hosted latency. The [verification reference](IMPLEMENTATION.md#verify) gives commands and prerequisites; [Performance](PERFORMANCE.md) distinguishes measured results from outstanding hosted acceptance targets.

Future changes must update the user README, this current specification, and implementation/focused guides according to [AGENTS.md](../AGENTS.md#documentation-responsibilities), keeping procedures in one authoritative location and replacing stale claims.

## Future Considerations

### Brand and Supported Scope

The product name remains **Beyond the Archives** as its supported scope grows. Website headers display **beyond the archives** in lowercase; all other product-name placements use Title Case, and taglines remain uppercase. The current tagline is defined centrally in `src/lib/brand.ts`; choose a broader tagline when the implemented functionality supports that focus.

| Stage | Product Name | Tagline |
| --- | --- | --- |
| Now — AO3 Only | Beyond the Archives | A PRIVATE AO3 ORGANIZER |
| Future — Fanfiction Focused | Beyond the Archives | A PRIVATE FANFICTION ORGANIZER |
| Future — All Online Fiction | Beyond the Archives | A PRIVATE FICTION ORGANIZER |

The future scopes are considerations, not implemented source support.


## Sample Collection Defaults

The bundled sample has 23 works, four saved series and 24 custom collections: one example for each of the 21 spine designs, One Shots and Deleted Works automatic collections, and the captured custom collection. All nine standard shelves use the same implementation as hosted mode. Missing version-9 examples are added once to older samples while preserving existing edits and prior deletions. Version 10 swaps the Plain and Cascading Star Trails examples, then places used-design examples after unused ones. Used designs come from the shared built-in/automatic artwork configuration and the plain custom collection. Existing samples receive the new ordering once. Reset Sample Data restores the complete default and clears collection hiding/order preferences so restored shelves are visible; unrelated browser preferences remain intact.

## Reading Statistics

The Stats page defaults to the current local calendar month. Monthly/yearly modes share a period selector with arrows, a month/year calendar dialog, direct entry (`mm/yyyy` for MDY/DMY, `yyyy-mm` for YMD, `yyyy` for yearly), and Today. Every metric follows that period; comparisons use the preceding calendar period, and trends end at the selected period.

Volume sums known words from dated `chapter_read` events, including archived DNF attempts. Unique words count each chapter’s first recorded non-re-read completion once across the entire history; later completions and explicit re-reads contribute to re-read words. The total equals both components. Unknown word counts remain visible and are excluded from words and time. Fics are distinct work identities; chapter totals count completion events. There is no invented consumption from imported status or progress.

Profiles support words or fic passes and inclusion/exclusion of re-reads. A pass counts a work once; repeated occurrences of each chapter identify additional passes, including partial passes. Multi-tag distribution credit splits equally so percentages sum to 100%; favorite tag/author rankings give full appearance or word credit to every tag. Length classes use whole-work metadata, with boundaries under 1,000, under 10,000, under 40,000, through 100,000, and above 100,000 words. Historical breakdowns use current saved metadata/ratings; compact archived records lack detailed taxonomy and personal ratings.

Status progression includes works added or with recorded activity during the period, using their last recorded status before the end. Archived attempts stay separate. Daily word charts, yearly monthly-volume charts, previous-period comparisons, five-year/six-month tag trend tables, and weekday/hour chapter completion heatmaps share these records. Batch chapter records reflect their marking time, not a continuous reading session.

Settings → Reading Statistics saves reading speed on this browser (default 225, whole numbers 1–2,000 words/minute), included in backup preferences. Estimated time is known words divided by speed. Session timers and measured reading duration are not implemented. Deleted entries without archive history do not contribute.

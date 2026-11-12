# Beyond the Archives

**A PRIVATE AO3 ORGANIZER**

A private application for organizing AO3 works and series, tracking reading progress, and keeping your own notes, ratings, tags, and collections. Create a shared organizer/reader account with Supabase, or try the local sample library without signing in.

Hover or focus an information icon for help. Help boxes expand to fit their text. Click an icon to keep its help box open; click again or press Escape to close it.

## Major Features

- **BookFusion Links:** save a book or fixed-location bookmark link through Edit AO3 Metadata. Work info shows Wayback, Unfolded (when the connected reader has a matching EPUB), and Bookfusion (when linked) buttons; the bookspine footer also retains its shortcut. Match saved AO3 works with a Calibre mapping CSV. See [BookFusion setup and report import](docs/BOOKFUSION.md).

- **Library and Currently Reading:** shelves, favorites, editable Recs, personal star ratings, notes, tags, and reading statuses from To Read through Finished or Did Not Finish.
- **Reading Statistics:** section tabs for monthly, yearly, and all-time chapter word totals, re-reads, reading-time estimates, status progression, taxonomy profiles, favorites, trends, and activity heatmaps. Set your reading speed in Settings → Reading Statistics. Monthly/yearly date labels open a calendar with exact keyboard entry; press Enter to apply. All Time omits date navigation and Today.
- **Reading Progress:** chapter tracking, pause/resume, rereads, reading date ranges, and chapter reading history recorded by the browser companion. Begin Re-Reading sets Re-Reading, resets current progress, and retains history; numeric corrections preserve that mode until caught up. Other footer edits update reading status: To Read at zero, Reading partway through, and Finished when caught up with a complete, abandoned, or deleted work, or Waiting for Updates for an ongoing work or a work on hiatus. On Hiatus and Abandoned are available as private publication overrides and quick actions. Reading status stays separate from AO3 publication status. The Deleted symbol shows “This work was deleted on AO3” on hover or keyboard focus; there is no separate Deleted on AO3 marker.
- **Flexible Imports:** work/chapter links, series selection, manual entry, metadata recovery from EPUBs, scraper CSV files, and browser scans of AO3 lists and collections.
- **Search and Organization:** Available In filters for Archives Unfolded downloads or saved BookFusion links (other reader platforms are shown as unavailable), pending filter selections applied with **Apply Filters** (Escape dismisses search suggestions while keeping the text), title/author search, Any/All tag matching with Custom OR-of-AND fandom groups, Allowed/Only/Exclude crossover filtering, word-count sorting, clickable removal of individual applied filters, verified canonical-tag synonyms, saved custom collections, automatic collection rules, grouping, and seeded random sorting. Author pages group works already in your library. Top and bottom page controls both use Page [number] of [total] and remain available while the visible results update. Sort options stay on one line and use bullet-separated qualifiers. Filled Chips in the tag-format picker matches the EPUB reader’s default style.
- **Series Pages:** review related installments, save optional full series details, and manage series notes, favorites, and collections independently of individual works.
- **Display Settings:** the mobile EPUB reader has a four-item bottom bar and category-based Settings, configurable work summaries, horizontal chapter swipes, and optional page animations; default work tiles place fandoms below the author line and expandable, categorized tag lists excluding fandoms below series/rating/word-count facts, with relationships, characters, Additional Tags, categories, and archive warnings in that order and verified tags prioritized within each category; configurable work/series tiles and information pages, four tags initially on organizer phones and seven on desktop, separate desktop/mobile arrangements, previews at custom screen sizes, and account-synced tag formats/colors.
- **Data Portability:** CSV ZIP exports, complete JSON backups, saved private backups, restore previews with safety copies, and optional DNF cleanup with an archive of compact reading records.
- **Browser Companions:** Chrome/Edge metadata retrieval, Library Sync, and AO3 reading controls; Safari reading controls through a userscript. Read confirmations in both bars offer Undo with visible day/night styling.

Series scan reviews save your selections and review page in this browser so reloading can restore your progress. **Import Selected Works** saves checked installments while keeping the review open and scanning paused. Use **Import Batch and Continue** when you are ready to finish that batch and resume scanning, or **Finish Import** for the final batch. Hover over the selected-works and batch-continuation buttons for a reminder of which action keeps Work Selection open.

Statistics use dated chapter completion records; older progress without chapter history cannot be backfilled accurately. Reading sessions and automatic email chapter notifications are not implemented. Metadata retrieval and full series details run when requested; future installments are not automatically imported. In Offline, expand **Installation Reports** to remove an old download report without deleting books or disconnecting your reader. For repeated Library or collection-loading timeouts, see the [performance troubleshooting and rollout notes](docs/PERFORMANCE.md#filter-suggestions-and-reader-heartbeats).

A shared loading icon and short explanation appear while the app loads data, processes files, saves changes, imports works, or runs an active scan or metadata job. The indicator stays visible inside open dialogs and above mobile navigation. It clears when work finishes; reduced-motion settings keep the icon static.

## Quick Preview

In sample mode, **Update Sample Data** saves your current library into the project as the default for fresh browsers and **Reset Sample Data**. Share the resulting project file change to give other checkouts the same default. It captures library data, including reading progress, notes, collections, and series; display settings stay in your browser.

Requires Node **22.13+ (22.x) or 24+** and npm. From `beyond-the-archives/`:

```sh
npm ci
npm run dev:sample
```

Open the URL printed by Vite. Sample mode needs no Docker, Supabase, or account. It includes 23 works, 4 series, and 24 custom collections. Design examples place unused artwork before designs already used on the main shelves. Edits persist in this browser; **Reset Sample Data** restores the bundled library, all spine-design collections, and collection visibility. Use **Profile Menu → Log Out** to preview the login page, then sign in with username **Sample** and password **123**. Logout persists through reloads in that tab and preserves your sample library. Forgot Your Password previews the recovery screen locally. Continue From Reader appears beside Sign In and opens the local sample library without contacting a reader account. Sample mode is development-only and makes no Supabase requests. Explicit AO3 imports require the local Chrome/Edge companion and your normal AO3 session. CSV import and account import history require the authenticated app.

Adding the app to your Home Screen uses the name **Beyond the Archives**. Mobile text fields use at least 16px text to avoid focus zoom, and the bottom navigation includes safe-area spacing.

The reader also offers a separate Sample/123 account with original EPUBs and the same Update/Reset Sample Data workflow. See [Local Sample Reader](reader/README.md#local-sample-reader) for `npm run dev:sample` and saved-default details.

Both organizer development modes and the reader’s local development server offer the same **Local Preview** toolbar with device presets and custom dimensions. The default mobile preset is **iPhone 16**. The Mobile button shows only the selected unit. Preview size controls support inches and millimeters using standard CSS units; presets keep their CSS viewport dimensions. Save edits before first entering mobile preview, which reloads the app in an embedded viewport. Keep `VITE_SAMPLE_DATA` out of `.env.local` for normal authenticated development.

## Run Browser Tests Like GitHub

With Docker Desktop running (Docker Engine with Compose v2 also works), run from `beyond-the-archives/`:

```sh
npm run test:e2e:ci                     # shard 1/4
npm run test:e2e:ci -- --shard=2/4      # choose 1/4, 2/4, 3/4, or 4/4
npm run test:e2e:ci -- --shard=1/1      # all functional browser tests
```

This uses your current files, including uncommitted edits, with the same Node 22 Linux environment as GitHub’s organizer browser shards. Docker installs dependencies and Chromium; no host `npm ci` or browser installation is required for this command. Tests run headlessly with `CI=true`, two workers, and both desktop/mobile projects, excluding `@performance`. Failure traces remain in `test-results/e2e/<run-id>/`. Keep source files unchanged while a run is active.

The container is limited to two CPUs and 7 GiB of memory. For comparable capacity, give Docker Desktop at least those resources. On an 8 GB Mac, keep Docker at 4 GiB and stop local Supabase first with `npx supabase stop`; these browser tests use mocked data. The 7 GiB limit is a ceiling, not reserved memory, and a smaller Docker allocation cannot reproduce CI’s available memory. The first run downloads and builds the image; later runs reuse cached layers, rebuilding dependencies when the lockfile changes. Apple Silicon uses Linux amd64 emulation to match GitHub’s architecture, so timing can still differ. See the [verification reference](docs/IMPLEMENTATION.md#verify) for environment details.

## Run Locally

Run commands from `beyond-the-archives/`. Requires Node **22.13+ (22.x) or 24+**, npm, Docker Desktop running, and the Supabase CLI. The `npm run db:*` scripts expect `supabase` on your PATH; the equivalent `npx supabase ...` commands below also work without a global CLI install.

### First-Time Setup and Database Upgrades

```sh
npm ci
npx supabase start
npx supabase migration up --local
npx supabase status
```

Run each command after the previous one succeeds. `supabase start` starts the Docker services in the background; leave Docker running. The local Supabase stack is named `beyond-the-archives`. If you previously used `ao3-library-tracker`, preserve its data and stop that stack before starting the renamed stack; the different project ID does not automatically move its database. See the [rename instructions](docs/IMPLEMENTATION.md#project-names-and-app-origin). Apply migrations again after pulling database changes. Use migration upgrades for an existing database; resetting it is optional and destructive, as described below.

On a fresh checkout only, create the browser configuration:

```sh
cp .env.example .env.local
```

Keep an existing `.env.local` rather than copying over it. Set these values using the local URL and **publishable/anon** key shown by `npx supabase status`:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_LOCAL_PUBLISHABLE_OR_ANON_KEY
EXTENSION_LOCAL_APP_ORIGIN=http://127.0.0.1:5173
```

Without valid public configuration, the app shows a setup screen. Server secret/service-role keys belong only in server configuration, never in `VITE_` variables. Restart Vite after changing `.env.local`.

Have the project owner approve your email for the private beta, then choose **Create Account** in either app with your email, password, and username. Confirmation, invitation, and recovery emails appear at `http://127.0.0.1:54324`; local Studio is at `http://127.0.0.1:54323`. Confirm your email before signing in. The [Supabase setup guide](docs/IMPLEMENTATION.md#set-up-supabase) covers Auth configuration, [beta approvals](docs/IMPLEMENTATION.md#private-beta-signup), and operator invitations.

### Start Each Local Session

Start Docker Desktop, then ensure Supabase is running:

```sh
npx supabase start
```

Run the following long-running commands in **separate terminals**. Leave each required process running while using the app.

| Terminal | Command | When needed |
| --- | --- | --- |
| 1 | `npm run dev` | Normal authenticated website at `http://127.0.0.1:5173` |
| 2 | `npx supabase functions serve extension-metadata` | Browser-extension imports and metadata refreshes |
| 3 | `npx supabase functions serve` | Optional full function runtime for series previews, canonical tag resolution, and saved backups; use instead of terminal 2 |

Use the URL printed by Vite. For the local extension build, it must match `EXTENSION_LOCAL_APP_ORIGIN` exactly (default `http://127.0.0.1:5173`), including the port and `127.0.0.1` versus `localhost`. The extension and app must target the same Supabase instance.

**Extension mode needs both the website and the Edge Function handler.** A successful “Extension connected” message confirms authentication but does not prove the handler is running. If it is stopped, metadata uploads fail and older requests can hold up the queue. A `503` with `name resolution failed` from `/functions/v1/extension-metadata` means the local function runtime is unavailable; start terminal 2 and reconnect in Settings.

### Build and Connect the Local Browser Extension

With `.env.local` pointing to local Supabase, build into the local directory so the hosted extension build is preserved:

```sh
npm run build:extension:local
```

In Chrome/Edge, open `chrome://extensions` or `edge://extensions`, enable Developer mode, and **Load unpacked → `extension/local/dist`**. After rebuilding, click **Reload** on that extension's card. If you have an older local extension without the fixed ID, remove that older local installation and load the new local build once. In the local app’s **Settings → AO3 Metadata Retrieval**, enter the extension ID and click **Reconnect Extension**. With no saved or configured extension ID, the local app falls back to the fixed ID of **Beyond the Archives Companion (Local)**. If Settings already contains another companion ID, enter the local build’s ID from your browser’s Extensions page. A shared companion build can instead target Local through its extension settings; see the extension guide. Use **Reconnect Extension** after a browser restart. Complete any AO3 sign-in or adult-content confirmation in the requested AO3 tab.

Import one work with **Add → Add Story**, which opens **Add Story → Import from link**, or use **Add → Import History from AO3** for batches. Importing a verified chapter link opens the existing fic when already saved and sets its reading location: chapter 10 means chapters 1–9 read. This also supports returning to an earlier chapter. Metadata-only refreshes preserve reading location; edits made while retrieval is pending take precedence. Saved jobs survive disconnection; reconnect the desktop companion to continue. See [the extension guide](companions/chrome/README.md) for hosted builds and detailed behavior.

### Test a Production Build Locally

```sh
npm run build
npm run preview
```

Open the preview URL printed by Vite, normally `http://127.0.0.1:4173`. Preview serves the built frontend; Supabase and the extension metadata handler must still be running. To test extension imports there, run `EXTENSION_LOCAL_APP_ORIGIN=http://127.0.0.1:4173 npm run build:extension:local`, reload the local extension, and reconnect in Settings. Use the local build’s ID in Settings if another ID is already configured. Settings stored under port 5173 do not carry over to port 4173.

### Stop Local Services

Press **Ctrl+C** in the Vite, function-handler, and preview terminals that you started. When finished with the local database:

```sh
npx supabase stop
```

The default stop keeps a database backup for the next start. Avoid `--no-backup` when keeping development data.

### Optional: Reset Disposable Local Data

Only when you deliberately want to erase and recreate the local database:

```sh
npx supabase db reset --local
```

This deletes local library entries and test accounts and reapplies migrations. Use `npx supabase migration up --local` for normal upgrades instead.

## Using the Application

**Begin Re-Reading** starts a new pass at chapter zero with status **Re-Reading**, retaining earlier history. Selecting Re-Reading in the status editor does the same. Progress stays Re-Reading until caught up: complete works become Finished; ongoing or hiatus works become Waiting for Updates. Only recorded chapter reads add reading-volume statistics; changing status or correcting a chapter number does not invent reading activity. Repeated chapter reads contribute reread words, separately from first-read words.

Use **Crossovers → Only/Exclude**, **One-Shot**, **Word Count** sorting, and click applied filter chips to remove individual selections. Crossovers uses verified AO3 fandom identities and hierarchy relationships. Only includes verified crossovers; Exclude retains unresolved works. Resolution runs separately from browsing, so results can change as evidence arrives. Sample mode uses simulated hierarchy evidence. **Remove from Collection** in a work’s menu removes only its membership in the current manual collection. Pause/Finish menu shortcuts appear for Reading and Re-Reading works; other states remain editable on the work page.

Collection shelves share regular-weight titles and heading spacing across organizer and reader. Edit Collections is aligned to the right; while editing, Hidden and Select Collections sit immediately before Done Editing. The collection editor uses a square visibility button. In either app, Add Story sits beside the selected manual collection name. Reader collection titles retain their color when hovered. Collection shelves scroll horizontally on desktop and mobile; use Show All Collections to expand them. Hide Empty hides zero-count collections without deleting them. Offline has the same shelves, with retained collection definitions and counts based on distinct works uploaded as cloud EPUBs.

### Sign In and Find Settings

Use your approved private-beta email with **Create Account**, a password, and a unique username, then confirm your email. Or choose **Continue From Reader** to open reader authorization in this tab, review the account, and return to your intended organizer page. If this browser cannot access the reader session, sign in there and continue. In the reader, **Continue From Organizer** uses an existing organizer account. Both apps share one account per email in the same backend project, with separate sessions and library data; continuing does not copy or merge libraries. Open the profile-icon menu for **Settings**, account details, password recovery, and **Log Out**.

Settings opens Account, Design, Library & Reading, Imports & Connections, and Data & Backups as separate pages. Select Settings Categories in the left panel to return to the main Settings page; on mobile, this link appears above the category content. Design → Work Tile Summaries offers full summaries or Show More/Show Less with expanded or truncated defaults. On mobile, Stats is in the profile menu. Search accepts AO3 work IDs; reselect a sort option to reverse its arrow. Empty library results omit bottom pagination.

### Add and Recover Works

Choose **Add → Add Story**. Paste a work or chapter URL, choose **Enter Manually**, or use **Import from EPUB**. For an archived work, select **Import Source → Import from Wayback Machine** and paste a fixed Wayback Machine capture of an AO3 work, such as `https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/17199254?view_full_work=true`, into the **Wayback Machine Link** field. Pasting a snapshot into the regular link field also selects Wayback automatically; bulk URL import still accepts snapshot links. The importer reads that snapshot’s metadata, keeps the archived reading link, and automatically marks the fic **Deleted**. Captures must contain accessible AO3 metadata; wildcard/history pages and archived series/list scans are unsupported. Manual entry needs an AO3 work URL and title; unknown chapter totals can stay blank. An EPUB can recover title, authors, summary, tags, and other available metadata from a downloaded file. Review the fields before saving. The file stays on your device; chapter text is not saved. EPUB files are limited to 50 MB. For deleted works, retain the original work URL and choose **Deleted** as the publication status.

For a saved AO3 work, choose **Open in Wayback** from its story actions menu, or **Wayback** (the archive building symbol) on its details page. The details action’s hover text is **Open in Wayback Machine**. A new tab checks recent captures and opens the newest page it can verify, including adult-content warning pages. Login-only captures are skipped. If no recent page can be verified or the archive is unavailable, use **Browse Snapshot Calendar** or **Try Again**. The lookup does not change the saved story, and a working capture does not guarantee every chapter was archived.

The **Read Chapter** action returns to chapter 1 for Finished works, without resetting chapters read, notes, or reading history. Other reading statuses continue from the next unread chapter. If chapter 1 has no verified link, the action opens the work’s base AO3 page; saved Wayback destinations stay unchanged.

A verified chapter link sets the reading location: chapter 10 means nine fully read chapters. Unverified links retain their URL without guessing progress. Explicit chapter-link imports can change an existing work’s reading location; metadata-only refreshes preserve it. Manual metadata corrections take precedence over later automatic retrievals.

### Track Reading and Personal Details

Open a work’s full details to edit metadata, notes, personal tags, collections, and star rating. Favorites and Recs are independent choices. Personal Rating Info preserves the line breaks in your saved rating explanation. Click the chapter count to edit progress. **Mark as Caught Up** finishes complete works or moves ongoing works to Waiting for Updates; **Mark as Finished** completes all known published chapters. Pause/resume retains progress, and rereads keep prior reading date ranges. Reading changes and story removal offer a two-minute Undo notice where shown.

For a work not yet saved, the AO3 companion’s first-chapter top bar offers **To Read** and **Reading**; Reading saves it at chapter 1 with zero chapters read. **Mark Read** at the first chapter’s bottom or either bar of later chapters saves the work and marks through that chapter read. The bottom of a complete fic’s final chapter offers **Finish Fic**. The AO3 companion can record chapter number, locally counted words, time, and reread information when you mark a loaded chapter read. View these under **Chapter Reading History**. When marking through a later chapter, it also counts earlier newly completed chapters, retrieving one full-work page if needed. Unavailable counts remain unknown. The confirmation below the AO3 bar offers **Undo**, restoring the prior progress and removing that action’s reading records. Chapter text stays in the browser.

### Browse, Filter, and Organize

The Series collection contains series tiles only. Work summaries on series tiles start collapsed; use **Expand All Work Summaries** or **Collapse All Work Summaries** beside pagination to apply the choice throughout the collection. Individual summary toggles remain available.

Library shelves include all saved statuses; Currently Reading focuses on active reading and its status sections. Filter by fandom, publication status, AO3 content rating, personal rating, favorites, Recs, tags, one-shot status, and other saved fields. Fandoms default to Any; Relationships, Characters, and Additional Tags default to All. Each offers Any/All matching, and Fandoms also offers Custom groups: every tag within a group must match, and any group can satisfy the filter. Edit groups within the Fandom dropdown, then choose Apply Filters. Empty groups are editing placeholders and do not broaden results. Verified Standard Tags include their verified synonyms; unverified names remain searchable. Tag suggestions sort names beginning with special characters last. The Features page provides a linked, detailed guide to the current workflows. The app uses a warm parchment page background, cream content surfaces, and a soft beige for progress and secondary panels. Cards and information panels use square corners; interactive controls stay rounded, and collection spines retain their 7px rounding while filter selectors use a compact 4px radius. Progress sections are centered and divided, and titles use the shared serif font.

**Search Within Results** supports spaces for AND, `||` for OR, quoted phrases, leading `-` for NOT, `*` wildcards, and backslash escapes. Choose Any Field, Summary, or Notes as the scope. Search ignores case and accents. Invalid syntax shows an error.

Sort is on the top page-navigation row; Group remains in the filter bar. Choose 25, 50, 100, or 250 results per page. Toolbar page-size changes last until reload; set a persistent default in Settings. While replacement results load, the previous rows and their numbered range remain visible with Updating… feedback. Browsing URLs preserve filters, sort, grouping, collection, and page. Returning from details restores your browsing position; interacting with the page takes control immediately. Clearing filters keeps your sort and grouping; switching shelves uses the filters you just applied or cleared. Returning through navigation restores your current browser preferences even after a quick switch between Reading and Library. Use **Save as Library Default** or the collection-specific default action to reuse filters; library-wide defaults replace saved collection defaults in this browser. Random ordering stays stable while paging; switch to another sort and back to Random to reshuffle. A large page only mounts nearby cards, so browser Find may miss off-screen results; use the app’s search instead.

Create manual or automatic custom collections, choose colors and symbols, and organize shelf order with **Edit Collections**. Keyboard collection moves retain focus after saving, including moves across shelf rows. Hiding a collection preserves its contents and applies in this browser; **View Hidden** lets you restore it. Deleting a collection preserves its works. When browsing series, results load before filter suggestions and collection counts; those may appear afterward. The Series collection includes explicitly saved full series and series identified by AO3 memberships of at least two distinct works in your library. A series with only one saved work is not given an inferred organizer page; explicitly saved series remain available. Series pages initially show saved works only. **Refresh Works** queues an AO3 metadata refresh for every work in that series already in your library, preserving reading progress and private edits. **Load** saves full available AO3 series details; choose individual installments to import. Series review shows **Save** only for series not already in your library; **Save All Series** skips existing series. Saving returns control after the write completes; library refresh continues in the background. **Check Series Containing Imported Works** is unchecked for each new import. Leave it off to handle only directly bookmarked or explicitly supplied series; enable it to also check memberships of imported works. This applies to list scans, CSV files, pasted links, and Add Story link imports. **Remove** discards downloaded series details while preserving your library and personal series data.

**Original Works** is an editable automatic starter collection matching the fandom labels **Original Work** and **Original Works**. Rename, change its rules, or delete it like other custom collections; deleting it keeps its stories and it stays deleted on reload.

Use **Export Work Metadata** in a work tile’s **…** menu or the download symbol immediately beside **Retry / Update Metadata** on its information page. Choose **JSON** or **CSV**, then **Export**. The confirmation also appears on mobile. Each download contains one saved work, including its effective metadata, reading progress, private notes, and personal tags. JSON also describes the saved source identity and available chapter-count/status provenance; unknown evidence and dates remain unknown.

### Import Lists and Review Changes

**Import Selected Works** shows saved-page progress and a completion summary inside **Choose Works From Series**. Successful imports remain in your library while the review stays open; library and history refreshes continue in the background.

If a scan import fails, keep the saved scan and selections. The error identifies the saved page and series when available, includes the server’s error code/message, and gives guidance for connection, sign-in, schema, or timeout problems. For a database timeout (`57014`), check Import History before retrying; repeated timeouts need investigation. Retry from the existing review after resolving the reported problem.

Open **Add → Import History from AO3** or `/imports`. Choose **Work or Series Links**, **AO3 Library Sync**, **CSV (Bookmarks or Marked for Later)**, or **Calibre (Bookfusion)**. Each tab ends with **Previous Batches**. Switching tabs keeps drafts and scans; reloading retains the selected tab. Link batches accept up to 2,000 URL tokens. CSV imports accept up to 2,000 unique works and 20 MB per review. Review series selections and personal-data conflicts before confirming. Optional chapter-date checks estimate progress strictly before a bookmark’s date; missing or same-day evidence stays unconfirmed.

For browser scans, connect Chrome/Edge Companion, then use **Import Bookmarks**, **Import Marked for Later**, or **AO3 List URL**. Full scans also support Works, Series, filtered listings, search results, and AO3 collections. Start with a full scan; Quick Sync is limited to unfiltered user Bookmarks/Marked for Later and stops on the first overlapping page. It cannot detect changes behind that boundary or infer deletions from missing listings.

Series review previews can be dismissed with **Cancel**, the close button, or Escape while loading. Cancelling stops further preview loading and does not import works.

Scans keep checkpoints and support pause/resume, inclusive page ranges, and **Import Batch and Continue** at the 500-page batch boundary. Page numbers may exceed 500. **End Scan** stops primary-list discovery, then finishes discovered series and enabled chapter-date checks. **Continue From Previous Scan** resumes an ended scan from its saved position, before or after importing its results. Partial ranges and early-ended scans do not update the Quick Sync baseline. Resolve sign-in or restriction problems in the AO3 scan tab before resuming. Request spacing defaults to 15 seconds and can be set to 5–3,600 seconds.

Repeat imports refresh factual metadata while preserving manual corrections. **Bookmark Conflicts — Review Personal Data** compares saved and incoming notes, personal tags, and reading state in two columns (one on small screens). Choose **Keep Saved Data** or **Use Incoming Bookmark** for each work. Saved data stays unchanged until you choose incoming data; incoming deleted bookmarks replace only notes and tags. Ratings, favorites, and collections are preserved. **Review Reading Corrections** lets you accept proposed corrections or keep saved history. Each review is limited to its current AO3 sync or latest CSV import; CSV review IDs are retained for your account in this browser. CSV **Overwrite** is a separate explicit personal-data replacement choice. **Previous Batches** shows import results; **View Saved Sync Reports** offers a report selector, ten reports per page, Refresh, and details of skipped entries or unavailable chapter dates. See the [Chrome/Edge guide](companions/chrome/README.md) for installation and scan recovery.

### Choose Browser Integration

In **Settings → Imports & Connections → AO3 Metadata Retrieval**, connect the current Chrome/Edge desktop companion. All website imports, CSV imports, Full Scan, Quick Sync, series previews, metadata refreshes and Wayback snapshot imports require its compatible connection. Narrow desktop windows remain supported. On mobile, open an AO3 work and save it with the Safari companion, or add a story manually. Your saved library, editing, reading progress, Import History and Wayback lookup remain available.

Chrome/Edge Companion supports retrieval, scans, and AO3 reading controls. The [Safari userscript](companions/safari/README.md) supplies AO3 reading controls and pairing, but does not process metadata jobs or Library Sync scans. Rebuild and reload companions after updates; their installation guides cover hosted builds and pairing. Paired AO3 reading bars remain authorized until you disconnect the device in the bar or revoke it in Settings; website sign-out does not revoke them.

If the app reports an incompatible companion response, update and reconnect the existing companion. Keep saved scans and library data; manual entry remains available while retrieval is unavailable.

### Export, Restore, and Clean Up

Use Settings → Data & Backups to export spreadsheet CSVs or a complete JSON backup. CSV is for analysis and is not a full restore format. **Export Backup** includes account data and supported browser preferences; saved Supabase copies require the backup function. **Restore Backup** previews JSON/JSON.gz or a saved copy, requires replacement confirmation, and saves a safety copy first. Saved storage retains three successful backups per account with a 50 MiB file limit and one save attempt per minute. Keep downloaded copies too. See the [backup guide](docs/BACKUPS.md).

**DNF Cleanup** is off by default. Preview eligible entries and protections before enabling it or cleaning manually. Cleanup removes detailed entries and retains compact reading records; recovering full details requires a backup. Background cleanup requires an installed server schedule. See [DNF cleanup](docs/DNF_CLEANUP.md).

## Project Layout

```text
src/
  app/                 protected routes and responsive shell
  components/          shared presentation components
  features/
    auth/              session provider, sign-in and password recovery
    settings/          Settings layout, navigation, account and pairing controls
    imports/           AO3 imports, sync, metadata retrieval and their settings
    backups/           backup/restore and CSV export, settings, styles and tests
    library/           shared library models, data access and work/reading UI
      collections/     collection controls, shelves, appearance, rules and tests
      series/          series data, search, pages, controls and tests
      browsing/        page size, pagination, restoration and settings
      display/         display preferences, editors, previews and settings
      summaries/       summary parsing, rendering, styles and tests
      sample/          local sample data and repository
  lib/                 public configuration and typed Supabase client
  types/database.ts    generated migration-derived types
  test/                frontend and server-boundary test setup
companions/
  shared/              AO3 bar, parsing, personal controls, styles and tests
  chrome/              extension entrypoints, capture, sync, messaging and tests
  safari/              userscript entrypoint, build tests and install guide
server/                trusted operator utilities, excluded from browser imports
supabase/
  migrations/          versioned PostgreSQL schema, constraints, grants and RLS
  functions/           authenticated server boundary
  tests/               PostgreSQL migration and isolation tests
scripts/               database harness, types, integration and security checks
tests/e2e/             desktop and mobile browser tests
docs/                  project overview, implementation and operations guides
```

## Further Documentation

- [Project Overview and Specifications](docs/PROJECT_OVERVIEW.md): product behavior, architecture, data contracts, limits, and current scope.
- [Implementation and Operations](docs/IMPLEMENTATION.md): technical decisions, migrations, hosted setup, deployment, and verification commands.
- [Chrome/Edge Companion](companions/chrome/README.md) and [Safari Companion](companions/safari/README.md): installation and browser-specific usage.

## Independent EPUB Reader

Web URLs in EPUB text are clickable, including plain-text addresses in existing downloads. External links open in a new tab while the book stays open.

The separate [archives unfolded](reader/README.md) EPUB reader lives in `reader/` with its own bookshelf, downloads, preferences, and offline shell. Sign in with the shared account in either app. After confirmed sign-in and reader-access checks, organizer sync is enabled automatically. When the reader opens its authenticated account library, it registers this installation or reuses its saved credential. The apps retain separate browser sessions and use the connected-sign-in handoff where the browser permits it. Use **Organizer & Sync → Sync Now** to sync cloud storage and reading progress. Credential details, legacy pairing, and connection repair are under **Advanced Troubleshooting**. Guest-library import, adding EPUB-only works to the organizer, and choosing downloads remain explicit; AO3 browser companions and Calibre keep their separate pairing flows. Offline shows reported downloads and cloud-saved works, including works not saved in the organizer.

For local use, set `VITE_READER_URL=http://127.0.0.1:5174/` in the organizer’s root `.env.local` and `VITE_ORGANIZER_URL=http://127.0.0.1:5173/` in `reader/.env.local`. Give both apps the same public Supabase configuration and restart their dev servers. Run the reader with `npm run dev --prefix reader`, sign in, and choose **Open Reader** from organizer settings or Offline. Local Auth redirects must allow the reader origin.

Anthology EPUBs use the first story’s summary and show separate work/chapter totals. The reader detects individual fics, excludes metadata pages from chapter counts, and offers **Review Anthology Contents** for corrections. Organizer progress syncs per identified fic. Each fic links to its organizer entry, and organizer EPUB actions open the matching fic; the reader offers a remembered choice when multiple EPUBs contain it. See [reader anthologies](reader/README.md#anthologies). EPUB summaries retain metadata paragraphs, line breaks, and safe emphasis in archives unfolded’s shelf previews and full details, using the organizer’s shared summary parser and renderer. Plain-text descriptions preserve literal newlines; existing local EPUB metadata is re-indexed without changing reading progress.

The reader keeps author notes separate from chapter identities, so repeated notes or prose do not select multiple chapters. Older downloads repair automatically when opened; if a saved position was ambiguous, choose where to resume. Reading history is retained.

Optional reader accounts add private EPUB cloud storage, selected downloads on other devices, and queued reading-state sync independently of organizer pairing. Existing organizer invitations also grant reader cloud access. Delete EPUB permanently removes a selected version and its reading data, including the account cloud copy on sync; deletion stays queued if cloud sync fails, with greyed-out Deleting tiles and storage rows until cloud removal is confirmed. Remove Download keeps its reading data. Guest reading remains offline and account-free. See the [reader account guide](reader/README.md#optional-reader-account).

The reader’s **Profile Menu** shares the organizer’s formatting and shows connection status, Reader Account, Cloud Library, and display controls. Cloud Library contains sync and conflict choices; Reader Account contains sign-in and editable username, email, and password rows. In both apps, the account icon stays readable on hover and its filled highlight clears when the menu closes. The mobile reader profile menu shows the site name without its subtitle. Its compact status group has a divider below it and shows Network, Cloud, and Organizer with distinct symbols; hover or tap for their independent connection/sync status. It contains **Reader Account**, **Organizer & Sync** (or **Connect Organizer**), **Tag Format**, and **Customize Tiles**. Linked work tiles offer **View in Organizer** in their **…** menu. Its **Customize Tiles** control reuses the organizer’s preview editor for independent mobile/desktop reader layouts. **Storage** opens a dialog with a searchable table, initially sorted by Title with sortable/reorderable columns, row selection, bulk Download/Remove Download, and double-click work details. A failed save caused by full browser storage opens that screen; browser eviction can still happen without advance warning when persistence is not granted, including loss of local notes, reading history, and unsynced updates. Already-synced server copies are unaffected. Both apps refresh their interface online and retain an offline fallback. Reader collection-loading errors show their cause and a Retry Collections action; downloaded books remain readable.

The reader’s [Calibre companion](companions/calibre/README.md) sends selected or all existing EPUBs through a paired cloud inbox or local reader bridge. Automatic delivery follows the reader’s cloud account independently of organizer connection, and offline cloud uploads stay queued for that account. Both paths share the reader’s duplicate/version/history behavior. The reader’s Pending tab includes uploaded cloud transfers before processing starts; uploads still waiting inside Calibre appear after delivery. Calibre Work Link (`#work_link`) also connects matching organizer tiles to the reader. Choose Download Imports or Cloud Only when exporting; cloud-only imports require a reader account. Manage Local Storage offers Delete from Cloud beside Remove Download for permanent account-library deletion. The companion guide covers ZIP installation, pairing, metadata mapping, and local reception requirements.

In the reader, click **Ch. # / #** to edit progress, or use **Mark As Read** to mark the current chapter and all earlier chapters read. **Begin Re-Reading** in Manage EPUB resets progress while preserving previous reading history. The header shortcuts are **Storage** and **Calibre**. Reader dialog close icons are centered, Start Reading retains its text color on hover, and chapter selectors show the chapter name without a separate Choose Chapter heading.

The reader accepts the same account username or email/password as the organizer, supports password recovery and Remember Me session choice, and can restore an enabled organizer connection on other signed-in devices. Continue From Reader uses a visible reader authorization page in the current tab and returns to the intended organizer page after account confirmation. If the session is unavailable, sign in on that page and continue. Account connection authorizes the handoff; it cannot access a login held in another browser, tab-only session, or installed PWA. Continue From Organizer in Reader Account retains its popup flow; when Remember Me is unchecked in the organizer, keep its signed-in tab open. Both explicit actions work independently of organizer synchronization. The shared sign-in forms accept Username or Email with a password, Remember Me, and Forgot Your Password. Create or change your username in Settings → Account & Security or Reader Account using **Edit**. In Reader Account, **Change Password** (or **Set Password** for a passwordless account) is beside Save Username. New passwords need matching confirmation; changes require the old password and can be canceled. The 12-character rule is removed; the minimum is six characters. **Edit Email** requires your current password and confirmation at the new address; the old address receives a notification. Email sign-in remains available. Cloud conflicts describe the differing reading information and offer device/cloud choices, with readable preserved versions. An organizer connects only to its matching reader account; that account can use multiple devices. Guest reading stays local and requires sign-in before organizer connection or sync. Recovery requires an email address, with Back to Sign In below Send Recovery Link; Continue From Reader sits to the left of the organizer sign-in button. See [reader account setup](reader/docs/IMPLEMENTATION.md#connected-accounts-and-login-handoffs). Saved series names on reader work tiles open the matching saved works through the existing Series filter; remove its chip to return to the shelf.

Both apps offer **Tag Format → All Tags Order** with up/down buttons for category ordering. Additional Tags is first by default. Save organizer changes with **Save**; reader changes save immediately and can follow the linked organizer.

Reader visits reuse the existing installation credential after ownership validation. Other devices register independently. Legacy pairing links remain supported for troubleshooting and cannot silently replace another account’s connection.

EPUB tiles in the reader and organizer Offline hub support Favorite and Recommended markings. Connected accounts synchronize these markings and reading progress; first imports retain the furthest saved progress/status. Offline changes wait for reconnection. Click a work tag or fandom to apply a search, or press Enter after typing a filter search.

Connected reader accounts share the organizer's collection shelves and editors, including automatic collections, appearance, ordering, bulk editing, and visibility. Edit memberships from a linked EPUB tile's **Add to Collection** button. Collection editing requires an online organizer connection; downloaded EPUBs remain readable offline. See [reader collections](reader/README.md#collections).

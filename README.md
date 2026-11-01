# Beyond the Archives

**A PRIVATE AO3 ORGANIZER**

A private application for organizing AO3 works and series, tracking reading progress, and keeping your own notes, ratings, tags, and collections. Use an invited account with Supabase, or try the local sample library without signing in.

Hover or focus an information icon for help. Help boxes expand to fit their text. Click an icon to keep its help box open; click again or press Escape to close it.

## Major Features

- **BookFusion Links:** save a book or fixed-location bookmark link on a work page and open it from the bookspine footer. Match saved AO3 works with a Calibre mapping CSV. See [BookFusion setup and report import](docs/BOOKFUSION.md).

- **Library and Currently Reading:** shelves, favorites, editable Recs, personal star ratings, notes, tags, and reading statuses from To Read through Finished or Did Not Finish.
- **Reading Statistics:** section tabs for monthly, yearly, and all-time chapter word totals, re-reads, reading-time estimates, status progression, taxonomy profiles, favorites, trends, and activity heatmaps. Set your reading speed in Settings → Reading Statistics. Monthly/yearly date labels open a calendar with exact keyboard entry; press Enter to apply. All Time omits date navigation and Today.
- **Reading Progress:** chapter tracking, pause/resume, rereads, reading date ranges, and chapter reading history recorded by the browser companion. Footer edits also update reading status: To Read at zero, Reading partway through, and Finished or Waiting for Updates when caught up with a completed or ongoing work. Reading status stays separate from AO3 publication status.
- **Flexible Imports:** work/chapter links, series selection, manual entry, metadata recovery from EPUBs, scraper CSV files, and browser scans of AO3 lists and collections.
- **Search and Organization:** pending filter selections applied with **Apply** (Escape dismisses search suggestions while keeping the text), title/author search, fandom and categorized tag filters, verified canonical-tag synonyms, saved custom collections, automatic collection rules, grouping, and seeded random sorting. Author pages group works already in your library. Top and bottom page controls both use Page [number] of [total]. Sort options stay on one line and use bullet-separated qualifiers. Filled Chips in the tag-format picker matches the EPUB reader’s default style.
- **Series Pages:** review related installments, save optional full series details, and manage series notes, favorites, and collections independently of individual works.
- **Display Settings:** default work tiles place fandoms below the author line and expandable, categorized tag lists excluding fandoms below series/rating/word-count facts, with relationships, characters, Additional Tags, categories, and archive warnings in that order and verified tags prioritized within each category; configurable work/series tiles and information pages, four tags initially on organizer phones and seven on desktop, separate desktop/mobile arrangements, previews at custom screen sizes, and account-synced tag formats/colors.
- **Data Portability:** CSV ZIP exports, complete JSON backups, saved private backups, restore previews with safety copies, and optional DNF cleanup with an archive of compact reading records.
- **Browser Companions:** Chrome/Edge metadata retrieval, Library Sync, and AO3 reading controls; Safari reading controls through a userscript. Read confirmations in both bars offer Undo with visible day/night styling.

Series scan reviews save your selections and review page in this browser so reloading can restore your progress. **Import Selected Works** saves checked installments while keeping the review open and scanning paused. Use **Import Batch and Continue** when you are ready to finish that batch and resume scanning, or **Finish Import** for the final batch. Hover over the selected-works and batch-continuation buttons for a reminder of which action keeps Work Selection open.

Statistics use dated chapter completion records; older progress without chapter history cannot be backfilled accurately. Reading sessions and automatic email chapter notifications are not implemented. Metadata retrieval and full series details run when requested; future installments are not automatically imported. For repeated collection-loading timeouts, see the [performance troubleshooting and rollout notes](docs/PERFORMANCE.md#chapter-date-maps-in-series-inputs).

A shared loading icon and short explanation appear while the app loads data, processes files, saves changes, imports works, or runs an active scan or metadata job. The indicator stays visible inside open dialogs and above mobile navigation. It clears when work finishes; reduced-motion settings keep the icon static.

## Quick Preview

Requires Node **22.13+ (22.x) or 24+** and npm. From `beyond-the-archives/`:

```sh
npm ci
npm run dev:sample
```

Open the URL printed by Vite. Sample mode needs no Docker, Supabase, or account. It includes 23 works, 4 series, and 24 custom collections. Design examples place unused artwork before designs already used on the main shelves. Edits persist in this browser; **Reset Sample Data** restores the bundled library, all spine-design collections, and collection visibility. Use **Profile Menu → Log Out** to preview the login page, then sign in with username **Sample** and password **123**. Logout persists through reloads in that tab and preserves your sample library. Forgot Your Password previews the recovery screen locally. Continue From Reader appears beside Sign In and opens the local sample library without contacting a reader account. Sample mode is development-only and makes no Supabase requests. Explicit AO3 imports require the local Chrome/Edge companion and your normal AO3 session. CSV import and account import history require the authenticated app.

Adding the app to your Home Screen uses the name **Beyond the Archives**. Mobile text fields use at least 16px text to avoid focus zoom, and the bottom navigation includes safe-area spacing.

Both local development modes offer a **Local Preview** toolbar with device presets and custom dimensions. Save edits before first entering mobile preview, which reloads the app in an embedded viewport. Keep `VITE_SAMPLE_DATA` out of `.env.local` for normal authenticated development.

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

Open local Studio at `http://127.0.0.1:54323` to invite a development user. Invitation and recovery emails appear at `http://127.0.0.1:54324`. Follow the invitation to set a password; public registration is disabled. The [Supabase setup guide](docs/IMPLEMENTATION.md#set-up-supabase) covers Auth configuration and operator invitations.

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
| 3 | `npm run worker` | Direct retrieval mode; requires `.env.worker` below |
| 4 | `npx supabase functions serve` | Optional full function runtime for series previews, canonical tag resolution, and saved backups; use instead of terminal 2 |

Use the URL printed by Vite. For the local extension build, it must match `EXTENSION_LOCAL_APP_ORIGIN` exactly (default `http://127.0.0.1:5173`), including the port and `127.0.0.1` versus `localhost`. The extension and app must target the same Supabase instance.

**Extension mode needs both the website and the Edge Function handler.** A successful “Extension connected” message confirms authentication but does not prove the handler is running. If it is stopped, metadata uploads fail and older requests can hold up the queue. A `503` with `name resolution failed` from `/functions/v1/extension-metadata` means the local function runtime is unavailable; start terminal 2 and reconnect in Settings.

### Build and Connect the Local Browser Extension

With `.env.local` pointing to local Supabase, build into the local directory so the hosted extension build is preserved:

```sh
npm run build:extension:local
```

In Chrome/Edge, open `chrome://extensions` or `edge://extensions`, enable Developer mode, and **Load unpacked → `extension/local/dist`**. After rebuilding, click **Reload** on that extension's card. If you have an older local extension without the fixed ID, remove that older local installation and load the new local build once. In the local app’s **Settings → AO3 Metadata Retrieval**, select **Browser Extension**, and click **Save Metadata Mode**. With no saved or configured extension ID, the local app falls back to the fixed ID of **Beyond the Archives Companion (Local)**. If Settings already contains another companion ID, enter the local build’s ID from your browser’s Extensions page. A shared companion build can instead target Local through its extension settings; see the extension guide. Use **Reconnect extension** after a browser restart. Complete any AO3 sign-in or adult-content confirmation in the requested AO3 tab.

Import one work with **Add → Add Story**, which opens **Add Story → Import from link**, or use **Add → Import History from AO3** for batches. Importing a verified chapter link opens the existing fic when already saved and sets its reading location: chapter 10 means chapters 1–9 read. This also supports returning to an earlier chapter. Metadata-only refreshes preserve reading location; edits made while retrieval is pending take precedence. Existing queued requests keep their original retrieval mode. See [the extension guide](companions/chrome/README.md) for hosted builds and detailed behavior.

### Configure the Direct Metadata Worker

For **Direct retrieval** in Settings, create the ignored `.env.worker` with these server-only values from local Supabase status:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=YOUR_LOCAL_SECRET_OR_SERVICE_ROLE_KEY
```

`npm run worker` loads this file automatically and polls continuously. To process at most one eligible job and exit:

```sh
npm run worker -- --once
```

The worker processes direct jobs; the extension and Edge Function handler process extension jobs. Run the service for the mode being tested. Neither service changes the mode of already queued requests.

### Test a Production Build Locally

```sh
npm run build
npm run preview
```

Open the preview URL printed by Vite, normally `http://127.0.0.1:4173`. Preview serves the built frontend; Supabase and the selected metadata service must still be running. To test extension imports there, run `EXTENSION_LOCAL_APP_ORIGIN=http://127.0.0.1:4173 npm run build:extension:local`, reload the local extension, and reconnect in Settings. Use the local build’s ID in Settings if another ID is already configured. Settings stored under port 5173 do not carry over to port 4173.

### Stop Local Services

Press **Ctrl+C** in the Vite, function-handler, preview, and worker terminals that you started. When finished with the local database:

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

### Sign In and Find Settings

Use the invitation link to set your password, then sign in. There is no public registration. Open the profile-icon menu for **Settings**, account details, password recovery, and **Log Out**.

### Add and Recover Works

Choose **Add → Add Story**. Paste a work or chapter URL, choose **Enter Manually**, or use **Import from EPUB**. For an archived work, select **Import Source → Import from Wayback Machine** and paste a fixed Wayback Machine capture of an AO3 work, such as `https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/17199254?view_full_work=true`, into the **Wayback Machine Link** field. Pasting a snapshot into the regular link field also selects Wayback automatically; bulk URL import still accepts snapshot links. The importer reads that snapshot’s metadata, keeps the archived reading link, and automatically marks the fic **Deleted**. Captures must contain accessible AO3 metadata; wildcard/history pages and archived series/list scans are unsupported. Manual entry needs an AO3 work URL and title; unknown chapter totals can stay blank. An EPUB can recover title, authors, summary, tags, and other available metadata from a downloaded file. Review the fields before saving. The file stays on your device; chapter text is not saved. EPUB files are limited to 50 MB. For deleted works, retain the original work URL and choose **Deleted** as the publication status.

For a saved AO3 work, choose **View in Wayback Machine** from its story actions menu or details page. A new tab checks recent captures and opens the newest page it can verify, including adult-content warning pages. Login-only captures are skipped. If no recent page can be verified or the archive is unavailable, use **Browse Snapshot Calendar** or **Try Again**. The lookup does not change the saved story, and a working capture does not guarantee every chapter was archived.

The **Read Chapter** action returns to chapter 1 for Finished works, without resetting chapters read, notes, or reading history. Other reading statuses continue from the next unread chapter. If chapter 1 has no verified link, the action opens the work’s base AO3 page; saved Wayback destinations stay unchanged.

A verified chapter link sets the reading location: chapter 10 means nine fully read chapters. Unverified links retain their URL without guessing progress. Explicit chapter-link imports can change an existing work’s reading location; metadata-only refreshes preserve it. Manual metadata corrections take precedence over later automatic retrievals.

### Track Reading and Personal Details

Open a work’s full details to edit metadata, notes, personal tags, collections, and star rating. Favorites and Recs are independent choices. Personal Rating Info preserves the line breaks in your saved rating explanation. Click the chapter count to edit progress. **Mark as Caught Up** finishes complete works or moves ongoing works to Waiting for Updates; **Mark as Finished** completes all known published chapters. Pause/resume retains progress, and rereads keep prior reading date ranges. Reading changes and story removal offer a two-minute Undo notice where shown.

For a work not yet saved, the AO3 companion’s first-chapter top bar offers **To Read** and **Reading**; Reading saves it at chapter 1 with zero chapters read. **Mark Read** at the first chapter’s bottom or either bar of later chapters saves the work and marks through that chapter read. The bottom of a complete fic’s final chapter offers **Finish Fic**. The AO3 companion can record chapter number, locally counted words, time, and reread information when you mark a loaded chapter read. View these under **Chapter Reading History**. When marking through a later chapter, it also counts earlier newly completed chapters, retrieving one full-work page if needed. Unavailable counts remain unknown. The confirmation below the AO3 bar offers **Undo**, restoring the prior progress and removing that action’s reading records. Chapter text stays in the browser.

### Browse, Filter, and Organize

The Series collection contains series tiles only. Work summaries on series tiles start collapsed; use **Expand All Work Summaries** or **Collapse All Work Summaries** beside pagination to apply the choice throughout the collection. Individual summary toggles remain available.

Library shelves include all saved statuses; Currently Reading focuses on active reading and its status sections. Filter by fandom, publication status, AO3 content rating, personal rating, favorites, Recs, tags, one-shot status, and other saved fields. Multiple fandoms match any selected fandom; selected character, relationship, and additional tags must each match. Verified Standard Tags include their verified synonyms; unverified names remain searchable. Tag suggestions sort names beginning with special characters last. The Features page provides a linked, detailed guide to the current workflows. The app uses a warm parchment page background, cream content surfaces, and a soft beige for progress and secondary panels. Cards and information panels use square corners; interactive controls stay rounded, and collection spines retain their 7px rounding while filter selectors use a compact 4px radius. Progress sections are centered and divided, and titles use the shared serif font.

**Search Within Results** supports spaces for AND, `||` for OR, quoted phrases, leading `-` for NOT, `*` wildcards, and backslash escapes. Choose Any Field, Summary, or Notes as the scope. Search ignores case and accents. Invalid syntax shows an error.

Sort is on the top page-navigation row; Group remains in the filter bar. Choose 25, 50, 100, or 250 results per page. Toolbar page-size changes last until reload; set a persistent default in Settings. Browsing URLs preserve filters, sort, grouping, collection, and page. Use **Save as Library Default** or the collection-specific default action to reuse filters; library-wide defaults replace saved collection defaults in this browser. Random ordering stays stable while paging; switch to another sort and back to Random to reshuffle. A large page only mounts nearby cards, so browser Find may miss off-screen results; use the app’s search instead.

Create manual or automatic custom collections, choose colors and symbols, and organize shelf order with **Edit Collections**. Hiding a collection preserves its contents and applies in this browser; **View Hidden** lets you restore it. Deleting a collection preserves its works. When browsing series, results load before filter suggestions and collection counts; those may appear afterward. The Series collection includes explicitly saved full series and series identified by AO3 memberships of at least two distinct works in your library. A series with only one saved work is not given an inferred organizer page; explicitly saved series remain available. Series pages initially show saved works only. **Refresh Works** queues an AO3 metadata refresh for every work in that series already in your library, preserving reading progress and private edits. **Load** saves full available AO3 series details; choose individual installments to import. Series review shows **Save** only for series not already in your library; **Save All Series** skips existing series. Saving returns control after the write completes; library refresh continues in the background. **Check Series Containing Imported Works** is unchecked for each new import. Leave it off to handle only directly bookmarked or explicitly supplied series; enable it to also check memberships of imported works. This applies to list scans, CSV files, pasted links, and Add Story link imports. **Remove** discards downloaded series details while preserving your library and personal series data.

### Import Lists and Review Changes

**Import Selected Works** shows saved-page progress and a completion summary inside **Choose Works From Series**. Successful imports remain in your library while the review stays open; library and history refreshes continue in the background.

If a scan import fails, keep the saved scan and selections. The error identifies the saved page and series when available, includes the server’s error code/message, and gives guidance for connection, sign-in, schema, or timeout problems. For a database timeout (`57014`), check Import History before retrying; repeated timeouts need investigation. Retry from the existing review after resolving the reported problem.

Open **Add → Import History from AO3** or `/imports`. Link batches accept up to 2,000 URL tokens. CSV imports accept up to 2,000 unique works and 20 MB per review. Review series selections and personal-data conflicts before confirming. Optional chapter-date checks estimate progress strictly before a bookmark’s date; missing or same-day evidence stays unconfirmed.

For browser scans, connect Chrome/Edge Companion, then use **Import Bookmarks**, **Import Marked for Later**, or **AO3 List URL**. Full scans also support Works, Series, filtered listings, search results, and AO3 collections. Start with a full scan; Quick Sync is limited to unfiltered user Bookmarks/Marked for Later and stops on the first overlapping page. It cannot detect changes behind that boundary or infer deletions from missing listings.

Series review previews can be dismissed with **Cancel**, the close button, or Escape while loading. Cancelling stops further preview loading and does not import works.

Scans keep checkpoints and support pause/resume, inclusive page ranges, and **Import Batch and Continue** at the 500-page batch boundary. Page numbers may exceed 500. **End Scan** stops primary-list discovery, then finishes discovered series and enabled chapter-date checks. **Continue From Previous Scan** resumes an ended scan from its saved position, before or after importing its results. Partial ranges and early-ended scans do not update the Quick Sync baseline. Resolve sign-in or restriction problems in the AO3 scan tab before resuming. Request spacing defaults to 15 seconds and can be set to 5–3,600 seconds.

Repeat imports refresh factual metadata while preserving manual corrections. **Bookmark Conflicts — Review Personal Data** compares saved and incoming notes, personal tags, and reading state in two columns (one on small screens). Choose **Keep Saved Data** or **Use Incoming Bookmark** for each work. Saved data stays unchanged until you choose incoming data; incoming deleted bookmarks replace only notes and tags. Ratings, favorites, and collections are preserved. **Review Reading Corrections** lets you accept proposed corrections or keep saved history. CSV **Overwrite** is a separate explicit personal-data replacement choice. **Previous Batches** shows import results; **View Saved Sync Reports** offers a report selector, ten reports per page, Refresh, and details of skipped entries or unavailable chapter dates. See the [Chrome/Edge guide](companions/chrome/README.md) for installation and scan recovery.

### Choose Browser Integration

In **Settings → AO3 Metadata Retrieval**, choose Direct Retrieval with a running worker or Browser Extension. Desktop and mobile choices are independent; mobile may inherit desktop or use direct retrieval. The mobile layout applies at widths up to 1,100 CSS pixels. Queued jobs retain the retrieval mode selected when created.

Chrome/Edge Companion supports retrieval, scans, and AO3 reading controls. The [Safari userscript](companions/safari/README.md) supplies AO3 reading controls and pairing, but does not process metadata jobs or Library Sync scans. Rebuild and reload companions after updates; their installation guides cover hosted builds and pairing. Paired AO3 reading bars remain authorized until you disconnect the device in the bar or revoke it in Settings; website sign-out does not revoke them.

### Export, Restore, and Clean Up

Use Settings to export spreadsheet CSVs or a complete JSON backup. CSV is for analysis and is not a full restore format. **Export Backup** includes account data and supported browser preferences; saved Supabase copies require the backup function. **Restore Backup** previews JSON/JSON.gz or a saved copy, requires replacement confirmation, and saves a safety copy first. Saved storage retains three successful backups per account with a 50 MiB file limit and one save attempt per minute. Keep downloaded copies too. See the [backup guide](docs/BACKUPS.md).

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

The separate [archives unfolded](reader/README.md) EPUB reader lives in `reader/`. It has its own local bookshelf, EPUB storage, reading preferences, optional organizer connection, and offline application shell. Choose **Connect Reader** in Settings → AO3 Browser Bar → EPUB Reader or the Offline page, the reader connects automatically. Manual connection needs only a pairing code and optional device name; self-hosted backend settings arrive through the organizer connection link. Shelf titles share a row with action menus, fandom spacing is compact, and Contents indents chapter entries. Organizer series tiles share the default work-tile metadata styling. Calibre updates replace existing reader books while preserving reading data, skip already-downloaded files, and separate transfer results into Successful, Failed, and Pending tabs. Shelf three-dot menus and clickable work titles in the reader open saved details, and shelf tag lists expand in place. Choose Apply to update shelf results; pending search and filter edits do not apply automatically. Applied filters appear below the filter box. Tag Format in the bookshelf header offers six shared styles with Filled Chips as the reader default; connected readers can optionally follow organizer tag settings or keep an independent format. Publication symbols match the organizer; shelf facts use bullet dividers. Contents follows Bookshelf and opens a left-side overlay panel, completion buttons stay in the top bar, and the counter counts actual chapters. Left/Right changes chapters in both layouts; Up/Down or Page Up/Down turns paginated pages, and two-finger touchpad swipes turn one page per gesture. The actual-chapter counter and completion controls share the top bar; underlined chapter titles open navigation dropdowns. The separate chapter bar and its toggle have been removed. Continuous-scroll headings sit between the previous/next buttons, with only the chapter name underlined. Continue Reading restores the saved scroll/page position; Mark Through Ch # completes the viewed chapter and earlier chapters. Reading controls include numeric font/width sliders, chapter navigation above and below the text in continuous scroll, and keyboard page turns. The bookshelf uses 24 works per page with inline Page [ ] of # navigation on the Sort By row, loads book contents on demand, and displays browser storage usage; organizer refreshes proceed in bounded batches. Guest EPUBs use device/browser storage; optional reader accounts upload originals to private Supabase storage. After installing root dependencies, run it with `cd reader && npm ci && npm run dev`. Separate reader hosting uses its own Vercel configuration; see the [reader deployment guide](reader/docs/IMPLEMENTATION.md#vercel-deployment). Build and preview it for offline use; development mode does not install the offline shell. The organizer’s Offline destination reuses library work tiles and filters, and the regular library offers Available Offline. Work pages offer Read EPUB for a selected reported reader. Availability is last reported by a named reader, with a timestamp; the reader confirms its local files. After an online setup and successful production shell caching, the organizer opens its retained Offline hub without a network connection or active session. The reader must be prepared and populated separately. A never-loaded device cannot open an uncached interface offline. Explicit organizer logout removes the retained hub snapshot. See the [offline contract](docs/PROJECT_OVERVIEW.md#offline-hub-and-reader-availability) for details.

For local pairing, add `VITE_READER_URL=http://127.0.0.1:5174/` to the organizer’s root `.env.local` and restart its dev server. Run the organizer at `http://127.0.0.1:5173/` and the reader with `npm run dev --prefix reader`. Sign in to the local organizer and choose **Connect Reader**; its link opens the local reader and supplies that organizer’s backend settings automatically. To test reader-account cloud sync too, give `reader/.env.local` the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as the organizer and restart the reader. Keep both environment files untracked. Local browser libraries are separate from the hosted reader’s library.

Anthology EPUBs use the first story’s summary. EPUB summaries retain metadata paragraphs, line breaks, and safe emphasis in archives unfolded’s shelf previews and full details, using the organizer’s shared summary parser and renderer. Plain-text descriptions preserve literal newlines; existing local EPUB metadata is re-indexed without changing reading progress.

The reader keeps author notes separate from chapter identities, so repeated notes or prose do not select multiple chapters. Older downloads repair automatically when opened; if a saved position was ambiguous, choose where to resume. Reading history is retained.

Optional reader accounts add private EPUB cloud storage, selected downloads on other devices, and queued reading-state sync independently of organizer pairing. Existing organizer invitations also grant reader cloud access. Delete EPUB permanently removes a selected version and its reading data, including the account cloud copy on sync; Remove Download keeps its reading data. Guest reading remains offline and account-free. See the [reader account guide](reader/README.md#optional-reader-account).

The reader’s **Profile Menu** shares the organizer’s formatting and shows icons beside its options. It contains **Reader Account**, **Organizer & Sync** (or **Connect Organizer**), **Tag Format**, and **Customize Tiles**. Its **Customize Tiles** control reuses the organizer’s preview editor for independent mobile/desktop reader layouts. **Manage Storage** opens a wide, searchable table with sortable/reorderable columns, row selection, bulk Download/Remove Download, and double-click work details. A failed save caused by full browser storage opens that screen; browser eviction can still happen without advance warning when persistence is not granted, including loss of local notes, reading history, and unsynced updates. Already-synced server copies are unaffected. Both apps refresh their interface online and retain an offline fallback.

The reader’s [Calibre companion](companions/calibre/README.md) sends selected or all existing EPUBs through a paired cloud inbox or local reader bridge. Automatic delivery follows the reader’s cloud account independently of organizer connection, and offline cloud uploads stay queued for that account. Both paths share the reader’s duplicate/version/history behavior. The companion guide covers ZIP installation, pairing, metadata mapping, and local reception requirements.

The reader accepts the same invited account email/password as the organizer, supports password recovery and Remember Me session choice, and can restore an enabled organizer connection on other signed-in devices. Connected apps can continue sign-in from each other, with a popup fallback for browser privacy restrictions. The shared sign-in forms accept Username or Email with a password, Remember Me, and Forgot Your Password. Create or change your username in Settings → Account & Security or Reader Account; email sign-in remains available. Recovery requires an email address, with Back to Sign In below Send Recovery Link; Continue From Reader sits to the left of the organizer sign-in button. See [reader account setup](reader/docs/IMPLEMENTATION.md#connected-accounts-and-login-handoffs). Saved series names on reader work tiles open the matching saved works through the existing Series filter; remove its chip to return to the shelf.

Both apps offer **Tag Format → All Tags Order** with up/down buttons for category ordering. Additional Tags is first by default. Save organizer changes with **Save**; reader changes save immediately and can follow the linked organizer.

Repeated **Connect Reader** handoffs to the same reader reuse its existing organizer connection after checking account ownership. They do not create another active connection or change its saved reading-sync identity. Other reader devices remain independently connected.

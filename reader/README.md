# archives unfolded

An independent, browser-based EPUB reader in the same repository as the organizer. No organizer account is required. The organizer web interface is unchanged.

## Run Locally

Requires Node.js 22.12+ and the full repository checkout. From this folder:

```sh
npm ci --prefix ..
npm ci
npm run dev
```

Open http://127.0.0.1:5174. The development server does not install the offline shell. To use or test the PWA:

```sh
npm run build
npm run preview
```

Open http://127.0.0.1:4174 while online, wait for **Reader prepared for offline use**, and import EPUBs. After preparation, reopen this same origin offline. Different ports, browsers, profiles, and installed applications can have separate storage. Deploy the built `dist` directory at the root of its own HTTPS origin; native packaging is out of scope.

## Pair With The Local Organizer

In the organizer’s root `.env.local`, set `VITE_READER_URL=http://127.0.0.1:5174/` and restart its dev server at `http://127.0.0.1:5173/`. Keep this reader running at `http://127.0.0.1:5174/`. Sign in to the local organizer and choose **Connect Reader** from Offline or Settings. The link supplies the organizer’s backend URL, public key, and one-time pairing code; no backend fields need to be entered in the reader. If this local reader already has an organizer connection, disconnect it before pairing another one.

For optional reader-account cloud testing, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in this folder’s untracked `.env.local` to the same public values as the organizer and restart the reader. This account configuration is separate from organizer pairing. The local Supabase configuration allows reader sign-in redirects at ports 5174 and 4174; restart the local Supabase stack after changing its Auth configuration. Reader-account sign-in still requires an invited Auth user with reader-app access. Local browser storage stays separate from the hosted reader’s origin. Keep `127.0.0.1` consistent rather than switching to `localhost`.

## Hosting

Deploy the reader as its own Vercel project using Root Directory `reader`, with **Include source files outside of the Root Directory in the Build Step** enabled. The checked-in reader configuration installs both dependency sets and builds `dist`. See the [deployment guide](docs/IMPLEMENTATION.md#vercel-deployment) for exact settings and troubleshooting.

## Reading

Import AO3-generated or ordinary reflowable EPUB 2/3 files. Search saved titles, authors, fandoms, tags, summaries, series, collections, publisher, or AO3 work ID. Metadata search and the Fandoms multi-select stay visible on the collapsed toolbar. The **Filters** button opens the filter box; **Hide** closes it without clearing selections. Basic expanded filters cover reading status, author, rating, and organizer collection. Expand **More Metadata Filters**, **Length & Popularity**, and **Publication & File Dates** for:

- Publisher (first in More Metadata Filters), publication status, category, language, archive warnings, relationships, characters, freeform tags, series, active/retained EPUB version, and single/multiple fandoms.
- Excluding freeform tags, warnings, characters, or relationships.
- Minimum/maximum words, published chapters, kudos, bookmarks, comments, and hits.
- Inclusive date ranges for original publication, story update, EPUB packaging, and local import.

Every filter combines with search, other fields, exclusions, and ranges. Fandoms, characters, relationships, and freeform tags use searchable dropdown multi-selects, with selected values shown as removable chips. Language has a dropdown multi-select without a search box. Fandoms and languages default to matching any selected value; characters, relationships, and freeform tags default to requiring all selected values. Searchable fields show a **Match All Selected / Any Selected** control when multiple values are selected. Exclusions reject a book matching any excluded value. Other categorical controls select one saved value. Options show local work counts and offer **Unknown / Not Saved** when applicable. Unknown numeric/date values do not match an active range, including a zero minimum. Applied filters appear as removable chips below the filter box, including search, exclusions, matching modes, and range bounds. They remain visible when the box is hidden. Remove a chip to clear just that value, or use **Clear All Filters** to reset search and filters while preserving sort order. Sort by title, import time, length, popularity, or publication/update/package date. The bookshelf displays 24 works per page. Use Prev, Next, or enter a page number in the centered **Page [ ] of #** control on the Sort By row (wrapping on narrow screens) and press Enter. Search and filters cover the entire saved catalog and return to page one when changed; opening and closing a book preserves the current shelf page. The six Length & Popularity ranges share one compact row; the four Publication & File Dates boxes share another. Both rows scroll horizontally on narrow screens. **EPUB Version** selects the active copy opened by organizer links or other saved downloads retained for the same story. **Packaged** sorts by the creation/download date saved in the EPUB metadata. **Freeform Tags** means AO3 Additional Tags. Work tiles show Additional Tags before warnings, relationships, characters, and categories, preserving source order within each category. Generic Tag and Work Link filters are omitted.

AO3 collections can be included in metadata search but have no dedicated filter; the collection filter uses organizer collections. Software versions, adapter names, duplicate URL/HTML fields, and other downloader diagnostics are not filter controls. This is metadata search, not full-text chapter or personal-note search. Metadata can be older than the online library.

AO3, FanFicFare title pages (standard and table formats), standard EPUB package fields, and recognized Calibre custom fields populate the local catalog. Existing downloads are re-indexed locally once when upgrading. **Refresh Local Metadata** re-reads retained files without a network request, changing reading history, or updating organizer data. Fields absent from the EPUB remain unknown; refreshing cannot fetch newer AO3 information.

Choose **One Chapter** or **Entire Work**, independently of **Continuous Scroll** or **Paginated**. Left/Right arrow keys change chapters in both layouts. Paginated reading uses page-edge taps, touch swipes, two-finger touchpad swipes, or Up/Down and Page Up/Down to turn pages without first focusing the book. Keyboard shortcuts leave form controls and dialogs alone. Continuous Scroll provides Previous/Next Chapter controls above and below each section, including Entire Work mode. The chapter/work heading is centered between the Previous/Next buttons, with its matching EPUB heading moved there to avoid a duplicate. Only the chapter name is underlined; a leading Chapter # label stays plain. Titles change color on hover; click one to open the chapter-navigation dropdown. The same dropdown is available above the text in paginated mode. Adjust font size, width, and dark mode under **Display**; both sliders show their current pixel values and reach both endpoints. New settings default to 17.28 px text (AO3’s 1.08× text size with the usual 16 px browser base) and the maximum 1100 px reading width. Existing saved settings are preserved. Positions save automatically, including when returning to the bookshelf or leaving the tab. **Continue Reading** restores the exact saved scroll offset or page when the display layout is unchanged, and uses a text anchor if font size, width, or screen dimensions change. Use explicit **Mark Chapter Read** or **Mark Through Ch #** actions to complete chapters. The # follows the currently viewed chapter; the latter marks that chapter and every earlier unread chapter in this EPUB, excluding front matter.

**Work Actions** (the three-dot menu at the top right of a shelf card) offers **View Details** and, for downloaded EPUBs, **Remove Download**. Within a work, click the work title in the reading header to open the same details. The chapter counter and completion controls share the top bar. The separate chapter bar and its toggle are removed; chapter-title dropdowns and previous/next navigation remain available. **Contents**, with a list icon immediately right of Bookshelf, toggles a left-side panel over the reading text without resizing it. Select a section to navigate; close it with the button, Escape, or a click outside. Mark Chapter Read and Mark Through Ch # stay beside the counter in the top bar. The Contents heading uses a compact 20 px size. The counter reports actual chapters, excluding front matter and standalone author-note sections. Left/Right switches chapters in either layout; Up/Down or Page Up/Down turns pages in paginated mode; two-finger touchpad swipes also turn pages. It shows the full saved summary, authors, publication metadata, categorized tags, statistics, dates, series/collection information, source links, and your local reading information and notes. Unknown fields are identified explicitly. Details use the saved EPUB snapshot, work offline, and do not fetch the online work or load chapter contents. On shelf cards, click **+# more** to expand all saved tags and **Show Less** to collapse them. Clicking a tag continues to search the catalog. Publication-status labels are omitted from chips; the icon beside the work title uses the organizer’s symbol and hover/focus description. In the reading header, that description appears below the symbol. Publication status remains available in details and filters. Word count, chapter count, and rating sit directly below the author line with bullet dividers. Fandoms use shared 13 px accent text, and shelf tags use the same 13 px size. Authors, these facts, and reading status/chapters read use the same 15 px text size as the summary.

**Manage EPUB** contains personal notes, reading status, optional work linking, active-version selection, replacement, removal, and rereading. **Make Active Version** selects which saved EPUB version opens from organizer links to that AO3 work; other versions and their reading data remain saved. Author notes remain in the book. Exact duplicates open the existing copy. Different versions offer replacement or retention. Uncertain replacement mapping prompts for a resume chapter. Removing the download retains reading history and position and does not delete organizer data.

Search and filter edits remain pending until you choose **Apply** in the bookshelf toolbar, including when the filter panel is hidden. Applied-filter chips show the current results. **Clear All Filters** resets immediately; removing an applied chip also updates the results immediately. Invalid ranges must be corrected before applying.

## Tag Format

Open **Tag Format** in the bookshelf header. Choose **Filled Chips** (the reader default), **Rounded Pill**, **Curved Rectangles**, **Sharp Rectangles**, **Text With Bullet Separators**, or **Text With Comma Separators**. The choice applies to shelf tags, detail tags, and applied-filter chips and is saved on this reader. Tags flow together without category headings. Non-filled styles use category colors; Filled Chips uses the Additional Tags color for every tag. Use the shared color pickers and **Save Colors** to save independent reader colors. Tag search and +# more expansion continue to work in every style.

When connected, optionally enable **Sync Tag Format With Organizer**. The reader follows the organizer’s saved tag shape and category colors; change those in organizer Settings → Tile and Page Information → Tag Format. The reader style selector and color controls are disabled while linked. Uncheck the option to restore your previously chosen independent reader format. Connecting alone never enables this setting. Saved organizer appearance works offline; changes refresh while both apps are open, on focus/reconnection, and about every 30 seconds. Other settings, such as reading size/width and tile layouts, remain independent.

## Optional Reader Account

Open **Reader Account** and request an email sign-in link for an invited account. This passwordless flow also restores account access. After signing in, choose **Open This Account’s Library**. The guest library and every account library have separate local books, preferences, history, and organizer connections. **Open Guest Library** returns to guest reading without deleting account downloads. **Sign Out & Open Guest Library** also signs out on this device.

Choose **Import Guest Library** to explicitly copy guest EPUBs, notes, and history into the account. Existing exact versions are skipped; the original guest library stays intact. Organizer credentials and pairing associations are never copied. New imports in an account upload on the next sync. **Sync Cloud Now** uploads retained original EPUBs and individual changed fields, then refreshes the cloud bookshelf. Select **Download EPUB** for each cloud book you want available offline on this device. Removing a downloaded book keeps its already-synced cloud copy. Open Reader Account using the circular profile button at the far right of the header.

Sync retries on launch, foregrounding, reconnection, and every 30 seconds while the app is visible. Saved linked reading changes also trigger sync. Organizer refreshes are throttled to once per minute unless Sync Now is chosen. Routine successful organizer syncs stay quiet; manual reports, errors, and conflicts remain visible. Checked 0 of 0 linked versions means no EPUB versions are linked to that organizer account. The app must be open. Offline edits stay queued locally. Conflicting notes, positions, statuses, or completion sets require **Use This Device** or **Use Cloud Version**; the discarded variant remains under **Preserved Conflict Versions**. Reading-history events merge by ID. Resume uses chapter identity and text position across screen sizes, including intentional backward movement for rereading. Device-only pixel positions remain local. Organizer connection remains optional and independent.

Reader cloud access must be enabled by the application owner before sync is available. See the [cloud setup instructions](docs/IMPLEMENTATION.md#reader-cloud-setup). Social sign-in and public account registration are not exposed in this private application.

## Optional Organizer Connection

Choose **Connect Reader** in the organizer’s settings or Offline page to open and connect this reader automatically with a one-time pairing code. Alternatively, open **Connect Organizer** in the reader and paste a dedicated pairing code from organizer settings. **Device Name** is optional and defaults to My Reader. Hosted backend settings are already configured; self-hosted backend settings arrive through the organizer connection link. An **Open Reader** fallback link remains available if automatic tab navigation is blocked. If an installed reader shows the old Backend URL or Public API Key fields, close its old tabs and reopen/reload it online; do not clear site data to update. Never use a service-role key or share pairing codes and paired secrets. The existing organizer backend must include its companion checked-edit and chapter-history migrations, including `20261028000500_chapter_read_batches_and_undo.sql`. Optional tag-format linking additionally requires `20261029000100_shared_tag_appearance.sql`; without it, independent reader formats still work and linking reports an unavailable-backend message.

An identifiable newly imported AO3 EPUB matches an existing organizer entry when connected. Previously standalone books require confirmation through **Link to Organizer Work**. The reader never automatically creates organizer entries or overwrites organizer catalog metadata, ratings, tags, or collections. Earlier standalone reads are not uploaded retroactively.

Verified chapter-completion actions queue reading status, progress, and word counts. Notes and explicit status edits also queue. Queued edits retry on launch, foregrounding, reconnection, and **Sync Now**, while the app is open. Organizer refreshes check up to 50 linked EPUB versions per run, with at most four requests in flight, and continue from the saved checkpoint on subsequent runs. Automatic refreshes are at least one minute apart; **Sync Now** immediately checks the next batch. Large libraries may need multiple runs before all organizer changes appear. Queued local edits are sent before these refreshes and are not delayed by the automatic-refresh interval. Incoming organizer status, notes, and collection labels refresh when no local edits are pending. Conflicts remain queued and offer explicit reader/organizer choices. A failed or expired connection never blocks local reading.

Disconnecting removes saved connection credentials while retaining files, copied metadata, local notes, history, and account-bound pending updates. Reconnect the same paired credentials to resume the queue. Before disconnecting, save the paired secret using the copy icon beside **Organizer & Sync → Reader Connection Credential → Paired Reader Secret** if you need to reconnect. The icon copies the field’s value and briefly shows **Copied**. **Sync Now** and **Disconnect Organizer** share the action row below the credential and pending updates. Keep a dedicated secret for this installation: pending updates cannot automatically migrate to a newly paired secret.

## Local Storage And Large Libraries

The shelf loads a lightweight metadata catalog; EPUB files, chapter text, and images load for the book you open. Managing notes/status and syncing do not load book contents. Existing reader libraries upgrade automatically, keeping downloads, positions, notes, history, settings, and queued updates. Close older reader tabs if an upgrade is waiting. Metadata refreshes still read retained files one at a time, and a first schema upgrade can take longer for large libraries.

On mobile, the downloaded-work count sits beside Import EPUB. Offline readiness and account/organizer state share a line with a bullet divider, wrapping on very narrow screens. Desktop keeps the existing summary layout.

The shelf summary shows estimated storage used by this reader's site, its browser allowance, and whether persistent storage was granted. Tap the info icon beside browser allowance to learn how to choose EPUB downloads to remove while keeping their reading data. Usage includes the reader's database and offline application cache; it is not an EPUB-only total or a measure of free device space. Unsupported or unavailable browser estimates are shown explicitly. Guest EPUBs stay on this device. Reader accounts upload retained originals to private Supabase storage. Keep original EPUB backups: clearing site data still removes the local library.

**Storage may be cleared automatically** means the browser has not granted persistent storage. It is not a storage-full alert: browsers can clear this site’s local data without advance notice, even while the reader is closed. This can remove EPUBs, personal notes, reading history, positions, preferences, and unsynced cloud/organizer updates across all local guest/account libraries on that reader origin. Already-synced server data and original EPUB files kept outside the browser are unaffected; guest-only or unsynced data may be unrecoverable. **Manage Storage** shows the current library’s downloads, known original-file sizes, and a **Request Persistent Storage** action. Persistence depends on the browser and does not protect against manually clearing site data.

If a local save runs out of browser space, the reader reports that the save did not complete and opens **Manage Local Storage**. Choose **Remove Download** for the files you want to remove, confirm each choice, then retry the failed action. Nothing is deleted automatically. Remove Download is also available in each downloaded work’s three-dot menu. Removed downloads keep their metadata tiles on the bookshelf, marked Not Downloaded, and remain searchable. Import the same EPUB or use Download EPUB in a reader-account library to read again. Notes, reading history, and position stay saved; keep an original backup or verify a cloud copy before removing a download. Older saved downloads may show **File size unavailable** until reopened. The site-wide estimate includes guest/account libraries and the offline shell, while this list covers the current library.

There is no book-count cap. Capacity depends on browser storage allowance and device space. Pagination bounds rendered cards, but the metadata catalog and filters still run in memory. The browser suite exercises a synthetic 10,000-entry catalog; this is not a guarantee for 10,000 large EPUBs or every mobile device.

## Limits

- Maximum EPUB: 50 MiB compressed; 16 MiB per extracted resource; 200 MiB extracted resources per import. The reused metadata parser has an additional 2 MiB per-resource / 8 MiB total metadata budget.
- DRM, password-protected ZIPs, fixed layout, interactive books, imported styles/fonts, remote images, and SVG illustrations are unsupported. Unsupported fonts use the reader font. Text, raster images, internal chapter links, summaries, and author notes are supported. Imports reject missing required prose or raster image resources.
- Publication information comes from the imported EPUB snapshot. The existing companion API does not expose a fresh publication metadata snapshot; import a newer EPUB to refresh it. Only reliably mapped AO3 chapter IDs and ordinals can trigger final status or chapter-history synchronization. Uncertain chapters retain local history and do not change organizer progress.
- The reader verifies its own IndexedDB copy. Browser storage can be evicted or cleared; retain original EPUB files. Cloud copies require an invited reader account with reader access; unsynced files remain local.
- Reader-installation availability reporting, organizer Offline navigation/filter/actions, and organizer offline startup remain future organizer work. See [the implementation contract](docs/IMPLEMENTATION.md).

## Verify

```sh
npm test
npm run build
npx playwright test
```

The browser suite uses the production preview on port 4174 and requires an installed Playwright Chromium. Also perform a real-device airplane-mode check after closing and reopening the installed reader; browser automation cannot emulate every platform’s storage and PWA lifecycle.

EPUB summaries retain metadata paragraphs, line breaks, and safe emphasis in archives unfolded’s shelf previews and full details, using the organizer’s shared summary parser and renderer. Plain-text descriptions preserve literal newlines; existing local EPUB metadata is re-indexed without changing reading progress.

## Import From Calibre

Choose **Calibre Transfers** to pair Calibre with this reader library. The plugin offers **Sync Selected Books**, **Sync All Books**, and **Automatic**, **Cloud Inbox**, or **Local Reader** delivery. Automatic follows reader-cloud sign-in at pairing, independently of the organizer: account libraries use cloud delivery, guest libraries use the local bridge, and offline cloud uploads stay queued for the same account. Local delivery requires Calibre and this reader open on the same computer, with browser local-network access allowed. Both paths share EPUB parsing, duplicates, retained versions, and history preservation. Use the [Calibre companion guide](../companions/calibre/README.md) to build/install the ZIP, pair, map metadata, and retry or cancel transfers. Cloud delivery requires the matching backend deployment.

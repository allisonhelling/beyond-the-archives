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

## Reading

Import AO3-generated or ordinary reflowable EPUB 2/3 files. Search saved titles, authors, fandoms, tags, summaries, series, collections, publisher, or AO3 work ID. Metadata search and the Fandoms multi-select stay visible on the collapsed toolbar. The **Filters** button opens the filter box; **Hide** closes it without clearing selections. Basic expanded filters cover reading status, author, rating, and organizer collection. Expand **More Metadata Filters**, **Length & Popularity**, and **Publication & File Dates** for:

- Publisher (first in More Metadata Filters), publication status, category, language, archive warnings, relationships, characters, freeform tags, series, active/retained EPUB version, and single/multiple fandoms.
- Excluding freeform tags, warnings, characters, or relationships.
- Minimum/maximum words, published chapters, kudos, bookmarks, comments, and hits.
- Inclusive date ranges for original publication, story update, EPUB packaging, and local import.

Every filter combines with search, other fields, exclusions, and ranges. Fandoms, characters, relationships, and freeform tags use searchable dropdown multi-selects, with selected values shown as removable chips. Language has a dropdown multi-select without a search box. Fandoms and languages default to matching any selected value; characters, relationships, and freeform tags default to requiring all selected values. Searchable fields show a **Match All Selected / Any Selected** control when multiple values are selected. Exclusions reject a book matching any excluded value. Other categorical controls select one saved value. Options show local work counts and offer **Unknown / Not Saved** when applicable. Unknown numeric/date values do not match an active range, including a zero minimum. Applied filters appear as removable chips below the filter box, including search, exclusions, matching modes, and range bounds. They remain visible when the box is hidden. Remove a chip to clear just that value, or use **Clear All Filters** to reset search and filters while preserving sort order. Sort by title, import time, length, popularity, or publication/update/package date. The bookshelf displays 24 works per page. Use Prev, Next, or enter a page number in the centered **Page [ ] of #** control on the Sort By row (wrapping on narrow screens) and press Enter. Search and filters cover the entire saved catalog and return to page one when changed; opening and closing a book preserves the current shelf page. The six Length & Popularity ranges share one compact row; the four Publication & File Dates boxes share another. Both rows scroll horizontally on narrow screens. **EPUB Version** selects the active copy opened by organizer links or other saved downloads retained for the same story. **Packaged** sorts by the creation/download date saved in the EPUB metadata. **Freeform Tags** means AO3 Additional Tags. Generic Tag and Work Link filters are omitted.

AO3 collections can be included in metadata search but have no dedicated filter; the collection filter uses organizer collections. Software versions, adapter names, duplicate URL/HTML fields, and other downloader diagnostics are not filter controls. This is metadata search, not full-text chapter or personal-note search. Metadata can be older than the online library.

AO3, FanFicFare title pages (standard and table formats), standard EPUB package fields, and recognized Calibre custom fields populate the local catalog. Existing downloads are re-indexed locally once when upgrading. **Refresh Local Metadata** re-reads retained files without a network request, changing reading history, or updating organizer data. Fields absent from the EPUB remain unknown; refreshing cannot fetch newer AO3 information.

Choose **One Chapter** or **Entire Work**, independently of **Continuous Scroll** or **Paginated**. Paginated reading uses page-edge taps, swipes, Left/Right arrow keys, or Page Up/Down without first focusing the book. Keyboard shortcuts leave form controls and dialogs alone. Continuous Scroll provides Previous/Next Chapter controls above and below each section, including Entire Work mode. The chapter/work heading is centered between the Previous/Next buttons, with its matching EPUB heading moved there to avoid a duplicate. Only the chapter name is underlined; a leading Chapter # label stays plain. Titles change color on hover; click one to open the chapter-navigation dropdown. The same dropdown is available above the text in paginated mode and works with the chapter bar hidden. Adjust font size, width, and dark mode under **Display**; both sliders show their current pixel values and reach both endpoints. New settings default to 17.28 px text (AO3’s 1.08× text size with the usual 16 px browser base) and the maximum 1100 px reading width. Existing saved settings are preserved. Positions save automatically, including when returning to the bookshelf or leaving the tab. **Continue Reading** restores the exact saved scroll offset or page when the display layout is unchanged, and uses a text anchor if font size, width, or screen dimensions change. Use explicit **Mark Chapter Read** or **Mark Through Ch #** actions to complete chapters. The # follows the currently viewed chapter; the latter marks that chapter and every earlier unread chapter in this EPUB, excluding front matter.

**Work Actions** (the three-dot menu at the top right of a shelf card) opens **View Details**. Within a work, click the work title in the reading header to open the same details. The header has a direct **Hide Chapter Bar / Show Chapter Bar** button instead of a three-dot menu; it toggles the chapter selector and read controls. The choice is saved across books and restarts, while chapter-title dropdowns and previous/next navigation stay available. It shows the full saved summary, authors, publication metadata, categorized tags, statistics, dates, series/collection information, source links, and your local reading information and notes. Unknown fields are identified explicitly. Details use the saved EPUB snapshot, work offline, and do not fetch the online work or load chapter contents. On shelf cards, click **+# more** to expand all saved tags and **Show Less** to collapse them. Clicking a tag continues to search the catalog. Publication-status labels are omitted from chips; the icon beside the work title uses the organizer’s symbol and hover/focus description. In the reading header, that description appears below the symbol. Publication status remains available in details and filters. Word count, chapter count, and rating use bullet dividers.

**Manage EPUB** contains personal notes, reading status, optional work linking, active-version selection, replacement, removal, and rereading. Author notes remain in the book. Exact duplicates open the existing copy. Different versions offer replacement or retention. Uncertain replacement mapping prompts for a resume chapter. Removing the download retains reading history and position and does not delete organizer data.

## Tag Format

Open **Tag Format** in the bookshelf header. Choose **Filled Chips** (the reader default), **Rounded Pill**, **Curved Rectangles**, **Sharp Rectangles**, **Text With Bullet Separators**, or **Text With Comma Separators**. The choice applies to shelf tags, detail tags, and applied-filter chips and is saved on this reader. Tag search and +# more expansion continue to work in every style.

When connected, optionally enable **Sync Tag Format With Organizer**. The reader follows the organizer’s saved tag shape and category colors; change those in organizer Settings → Tile and Page Information → Tag Format. The reader style selector is disabled while linked. Uncheck the option to restore your previously chosen independent reader format. Connecting alone never enables this setting. Saved organizer appearance works offline; changes refresh while both apps are open, on focus/reconnection, and about every 30 seconds. Other settings, such as reading size/width and tile layouts, remain independent.

## Optional Organizer Connection

Connect using the backend URL, public API key, and a dedicated companion pairing code (or paired secret) from the organizer. Never use a service-role key. The existing organizer backend must include its companion checked-edit and chapter-history migrations, including `20261028000500_chapter_read_batches_and_undo.sql`. Optional tag-format linking additionally requires `20261029000100_shared_tag_appearance.sql`; without it, independent reader formats still work and linking reports an unavailable-backend message.

An identifiable newly imported AO3 EPUB matches an existing organizer entry when connected. Previously standalone books require confirmation through **Link to Organizer Work**. The reader never automatically creates organizer entries or overwrites organizer catalog metadata, ratings, tags, or collections. Earlier standalone reads are not uploaded retroactively.

Verified chapter-completion actions queue reading status, progress, and word counts. Notes and explicit status edits also queue. Queued edits retry on launch, foregrounding, reconnection, and **Sync Now**, while the app is open. Organizer refreshes check up to 50 linked EPUB versions per run, with at most four requests in flight, and continue from the saved checkpoint on subsequent runs. Automatic refreshes are at least one minute apart; **Sync Now** immediately checks the next batch. Large libraries may need multiple runs before all organizer changes appear. Queued local edits are sent before these refreshes and are not delayed by the automatic-refresh interval. Incoming organizer status, notes, and collection labels refresh when no local edits are pending. Conflicts remain queued and offer explicit reader/organizer choices. A failed or expired connection never blocks local reading.

Disconnecting removes saved connection credentials while retaining files, copied metadata, local notes, history, and account-bound pending updates. Reconnect the same paired credentials to resume the queue. Before disconnecting, save the paired secret using **Organizer & Sync → Reader Connection Credential** if you need to reconnect. Keep a dedicated secret for this installation: pending updates cannot automatically migrate to a newly paired secret.

## Local Storage And Large Libraries

The shelf loads a lightweight metadata catalog; EPUB files, chapter text, and images load for the book you open. Managing notes/status and syncing do not load book contents. Existing reader libraries upgrade automatically, keeping downloads, positions, notes, history, settings, and queued updates. Close older reader tabs if an upgrade is waiting. Metadata refreshes still read retained files one at a time, and a first schema upgrade can take longer for large libraries.

The shelf summary shows estimated storage used by this reader's site, its browser allowance, and whether persistent storage was granted. Usage includes the reader's database and offline application cache; it is not an EPUB-only total or a measure of free device space. Unsupported or unavailable browser estimates are shown explicitly. EPUBs stay on this device and do not consume Supabase file storage. Keep original EPUB backups: clearing site data still removes the local library.

There is no book-count cap. Capacity depends on browser storage allowance and device space. Pagination bounds rendered cards, but the metadata catalog and filters still run in memory. The browser suite exercises a synthetic 10,000-entry catalog; this is not a guarantee for 10,000 large EPUBs or every mobile device.

## Limits

- Maximum EPUB: 50 MiB compressed; 16 MiB per extracted resource; 200 MiB extracted resources per import. The reused metadata parser has an additional 2 MiB per-resource / 8 MiB total metadata budget.
- DRM, password-protected ZIPs, fixed layout, interactive books, imported styles/fonts, remote images, and SVG illustrations are unsupported. Unsupported fonts use the reader font. Text, raster images, internal chapter links, summaries, and author notes are supported. Imports reject missing required prose or raster image resources.
- Publication information comes from the imported EPUB snapshot. The existing companion API does not expose a fresh publication metadata snapshot; import a newer EPUB to refresh it. Only reliably mapped AO3 chapter IDs and ordinals can trigger final status or chapter-history synchronization. Uncertain chapters retain local history and do not change organizer progress.
- The reader verifies its own IndexedDB copy. Browser storage can be evicted or cleared; retain original EPUB files. No EPUB uploads, cloud downloads, or cross-device file transfers are provided.
- Reader-installation availability reporting, organizer Offline navigation/filter/actions, and organizer offline startup remain future organizer work. See [the implementation contract](docs/IMPLEMENTATION.md).

## Verify

```sh
npm test
npm run build
npx playwright test
```

The browser suite uses the production preview on port 4174 and requires an installed Playwright Chromium. Also perform a real-device airplane-mode check after closing and reopening the installed reader; browser automation cannot emulate every platform’s storage and PWA lifecycle.

EPUB summaries retain metadata paragraphs, line breaks, and safe emphasis in archives unfolded’s shelf previews and full details, using the organizer’s shared summary parser and renderer. Plain-text descriptions preserve literal newlines; existing local EPUB metadata is re-indexed without changing reading progress.

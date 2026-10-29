import { Link } from 'react-router-dom'
import '../features/settings/settings.css'

const sections = [
  { id: 'save-stories', title: 'Save AO3 Works, Series, and Manual Entries', content: <>
    <p>Open <Link className="clickable-text" to="/add">Add Story</Link> to paste an AO3 work, chapter, or series URL. Chapter links can retain a verified reading destination. For a series, review its installments and select the works you want to import; reviewing a series does not add every installment. Use manual entry for stories whose details you want to supply yourself.</p>
    <p>For larger libraries, open <Link className="clickable-text" to="/imports">Import</Link> to paste multiple links, review AO3 scraper CSV files, or scan Bookmarks and Marked for Later with the browser companion. CSV review accepts up to 2,000 unique works and 20 MB. Bookmark notes become private notes and bookmark tags become personal tags. Review conflicts with existing personal data before applying incoming values.</p>
    <p>Library Sync offers a full scan and Quick Sync. Run Bookmarks and Marked for Later separately. Quick Sync stops at known records, so use a full scan to revisit older entries. Import history shows job progress and failures. AO3 metadata retrieval uses your configured hosted worker or browser extension; it requires that retrieval service to be available.</p>
  </> },
  { id: 'reading-progress', title: 'Track Chapters, Reading Status, and Re-Reads', content: <>
    <p>Use <Link className="clickable-text" to="/reading">Currently Reading</Link> to switch between complete stories, ongoing stories, new chapters, re-reading, waiting for updates, paused reading, and To Read. These views follow your saved progress; author completion and your reading status are separate.</p>
    <p>Select the chapter count on a work to edit your last fully read chapter. Use the work’s progress controls to mark available chapters read, finish the work, or change its reading status. Read Chapter opens a verified unread destination when one is available. A title or chapter count alone cannot verify that destination.</p>
    <p>Re-read a saved work without creating another library entry. Chapter reading history and archived attempts preserve recorded reading activity. Settings also offers DNF cleanup: preview eligible works before archiving and removing them, with protections for favorites and other personal details. The browser companion can record chapter progress from AO3 when you mark chapters read; configure it for the browser where you read.</p>
  </> },
  { id: 'collections', title: 'Build Manual Collections and Automatic Filtered Shelves', content: <>
    <p>Open <Link className="clickable-text" to="/library">Library</Link> to browse built-in shelves, favorites, and your own collections. Create a collection with a name, summary, color, and spine symbol. Edit collection membership from a work or series, and use collection management to organize your shelves.</p>
    <p>Automatic collections save filter rules and update membership as matching works change. Use them for combinations such as fandom, reading status, tags, ratings, or favorites. Edit the collection’s rules to change what belongs there; manual collections let you choose membership yourself.</p>
    <p>Series favorites and collection memberships are independent of their individual works. Putting a series in a collection does not assign every installment to it. The Series collection displays series tiles only.</p>
  </> },
  { id: 'search', title: 'Combine Search Terms, Tag Filters, and Saved Defaults', content: <>
    <p>Filter a collection by title or author, fandom, publication status, content rating, personal rating, favorites, recommendations, notes, tags, one-shots, series membership, and AO3 update dates. Applied filters appear beneath the controls. Clear All Filters removes the current selections; saved defaults can restore your preferred starting view for a shelf.</p>
    <p>Search Within Results can search all saved information, work summaries, or your private notes. Separate words require both terms; <code>Harry || Potter</code> matches either term, <code>"Harry Potter"</code> matches an exact phrase, <code>Harry -Potter</code> excludes a term, and <code>book*</code> matches a word prefix. Use the search help icon for escaping literal operators. Matching ignores case and accents.</p>
    <p>Relationship, character, and additional-tag suggestions group AO3-verified canonical names under <strong>Standard Tags</strong>. Verified synonyms can find the same standard tag, while imported tag names stay intact. <strong>Other / Unverified Tags</strong> retain their original names; verification runs in the background, and saved-tag searches remain usable when verification is unavailable. Suggestions alphabetize letters and numbers before names beginning with special characters.</p>
    <p>Sort results by date added, AO3 update date, chapters ready, title, or random order. Group by fandom, author, or series. Use Prev, Next, or the page number to navigate. Changing works per page here lasts until reload; set the default in Settings.</p>
  </> },
  { id: 'series', title: 'Review Series Installments Without Importing Them All', content: <>
    <p>The Series collection includes saved series and AO3 series inferred from at least two distinct saved works. Tiles show saved installments with their original part numbers. Work summaries start hidden; open an individual title or use Expand All Work Summaries and Collapse All Work Summaries beside pagination across the collection.</p>
    <p>Open a series title for its organizer page. A basic page uses your library’s saved works without downloading a full AO3 listing. Choose Load to save the description, creator notes, official totals, completion status, and available installments. Official totals remain unknown until loaded; basic word totals cover your saved works.</p>
    <p>Choose Works to Import opens a picker for individual installments. Loaded listings can show or hide works outside your library. Refresh updates the saved series snapshot; Refresh Works updates metadata for installments already in your library. Remove discards downloaded series details while keeping your saved works and personal organization.</p>
    <p>Your Progress follows saved installments, independently of AO3 series completion. Marking a series finished finishes its saved works without importing missing ones. A series can have its own private note, favorite, recommendation, and collections.</p>
  </> },
  { id: 'personal-details', title: 'Add Private Notes, Personal Ratings, Tags, and Reader Links', content: <>
    <p>On a work page, add or edit Your Note, assign personal tags and a star rating, mark favorites or recommendations, and choose collections. Configure personal rating options in Settings. Private notes are also available on series pages. If another edit changes the same saved information, the conflict review lets you choose what to keep.</p>
    <p>Edit work metadata to correct titles, authors, summaries, or tags. Explicit manual corrections take precedence over later metadata refreshes. Refresh AO3 details for one work or use the collection’s mass refresh action for works on the current page. Series refreshes preserve personal organization.</p>
    <p>Add a BookFusion reader link with the pencil beside BookFusion Link. Choose a book link for BookFusion’s latest position, or a bookmark for a fixed location. Open in BookFusion launches that destination. Link Books from Calibre on Import reviews a mapping CSV against exact AO3 work IDs; opening a reader link does not change this app’s chapter progress.</p>
  </> },
  { id: 'statistics', title: 'Explore Recorded Reading by Date and Word Count', content: <>
    <p>Open <Link className="clickable-text" to="/stats">Stats</Link> to explore all-time, yearly, or monthly reading. Charts separate unique words from re-read words and include a data-table view. Reading-speed settings control estimated reading time.</p>
    <p>Totals depend on recorded chapter completions with known word counts. Editing a progress number or importing a finished date does not reconstruct historical chapter counts or exact reading times. Estimates use your configured speed; the app does not yet record timed reading sessions.</p>
  </> },
  { id: 'customize', title: 'Arrange Tiles and Information Pages for Desktop and Mobile', content: <>
    <p>In <Link className="clickable-text" to="/settings">Settings</Link>, open the display controls to arrange and hide fields on work tiles, series tiles, and information pages. Group fields onto shared lines or separate them, add dividers, and preview your changes. Desktop and mobile layouts have independent preferences and configurable preview sizes.</p>
    <p>Choose tag colors and shapes, browsing defaults, date formatting, and personal rating settings. Configure desktop and mobile AO3 metadata retrieval separately; mobile can follow the desktop choice or use the hosted worker while desktop uses the browser extension.</p>
  </> },
  { id: 'backups', title: 'Export Your Library and Preview a Backup Restore', content: <>
    <p>In Settings, export a complete JSON backup or download a CSV for spreadsheet use. Use Save Backup to Supabase for a private stored copy. The three most recent successful backups are retained; you can download or delete them from Saved Backups. Scheduled backup creation is not yet available.</p>
    <p>To restore, select a JSON or JSON.gz backup from your own account and preview the changes before replacing your library. The app saves a private safety copy first and stops if it cannot save that copy. CSV export is for reviewing your data; use the complete backup format for restoration.</p>
  </> },
]

export function FeaturesPage() {
  return <div className="settings-page features-guide">
    <aside className="settings-outline"><nav aria-label="Features Navigation"><h2>On This Page</h2><ul>{sections.map(({ id, title }) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ul></nav></aside>
    <div className="settings-content"><div className="page-heading"><div><h1>Features</h1><p className="muted">How to save, organize, find, and keep track of your reading.</p></div></div>{sections.map(({ id, title, content }) => <section className="settings-card" id={id} key={id} aria-labelledby={`${id}-title`}><h2 id={`${id}-title`}>{title}</h2>{content}<p><a className="clickable-text" href="#main">Back to Top</a></p></section>)}</div>
  </div>
}

# BookFusion Links

## Link a Work

1. Upload/import the EPUB into your BookFusion account, directly or through BookFusion’s Calibre plugin.
2. Copy its BookFusion HTTPS reader or content link.
3. Open the organizer’s work information page, choose **Edit** beside **BookFusion Link**, and paste the URL into **BookFusion Link**.
4. Choose **Book · Latest Position** for a book-level destination without a query or fragment. Choose **Bookmark · Fixed Location** to retain a specific destination and its location parameters. Save the story.

The overlapping-books symbol appears to the right of the caught-up button in the shared bookspine footer, with **Open in BookFusion** hover text. It opens a new tab. BookFusion controls resuming your position; the organizer does not synchronize BookFusion progress. Bookmark destinations are preserved rather than converted to book links. Clearing the field removes the shortcut. Links are private to your organizer account and included in existing metadata exports and full backups.

## Export and Review Calibre Associations

Synchronize your EPUBs through [BookFusion’s existing Calibre plugin](https://docs.bookfusion.com/docs/Calibre/calibre-plugin) first. Close Calibre so the helper reads a settled library database. Python 3 and its standard library are sufficient. From the project directory, run:

```sh
python3 scripts/export-bookfusion-mapping.py --library "/path/to/Calibre Library" --output "/path/to/bookfusion-mapping.csv"
```

The helper opens `metadata.db` read-only and creates a new CSV; it refuses to overwrite existing reports. It exports `link` (AO3 URL), `title`, `author`, `bookfusion_id`, and `bookfusion_url`. AO3 URLs come from Calibre identifier values containing an AO3 work URL. Multiple AO3 identities generate separate rows; missing identities and BookFusion identifiers remain visible for review. It does not inspect EPUB files to recover absent AO3 identifiers.

BookFusion’s [plugin source](https://github.com/BookFusion/calibre-plugin/blob/master/upload_worker.py) saves its API upload identifier as the `bookfusion` identifier. That source does not establish a conversion to a reader/content URL. The helper deliberately leaves `bookfusion_url` blank. Paste copied book-level links into the report, or enter them in the organizer’s preview.

Open **Mass Import from AO3 → Link Books from Calibre**, choose the CSV, and review the associations. Reports must contain 1–2,000 rows and be no larger than 5 MB. Exact AO3 work IDs match existing saved works; titles and authors never serve as matching evidence. Valid unique matches are selected initially. Existing links require explicit selection before replacement. Editing a URL clears its selection so the changed association can be reviewed. Bookmarks can be set on individual work pages after import; mapping imports accept book-level links only.

Missing/invalid AO3 URLs, works absent from the library, duplicate AO3 rows, and missing/invalid BookFusion URLs cannot be saved. Correct the CSV and reimport, or edit the matched work manually. **Save Selected Links** persists each association through the existing conflict-checked story save. A concurrent change produces a per-row error rather than silently overwriting it. Successful rows remain saved if another row fails; review failures before trying again. This is a report import, not a live Calibre companion or an EPUB upload service.

# AO3 Library Companion (Chrome / Edge)

For the inline library controls in iOS Safari's free Userscripts app, see [the userscript companion](../userscript/README.md). Build its installable file with `npm run build:userscript`.

This Manifest V3 extension is part of the hosted library project. It captures metadata for explicitly requested work imports, refreshes, series previews, and library listing scans on the connected website. It does not install an AO3 content script, watch browsing history, or import works just because you visit them.

## Deploy the hosted boundary

1. Apply the project migrations through `20261016000800_existing_import_reading_location.sql` to your Supabase project using your normal migration workflow (`supabase db push` for a linked project). Existing direct imports keep their behavior.
2. Deploy `supabase functions deploy extension-metadata`. Keep the supplied `verify_jwt = false` function setting: the handler itself verifies every bearer token with Supabase Auth, including projects with modern signing keys. Service-role credentials stay inside the Edge Function.
3. Deploy the updated website. The mode selector is under **Settings → AO3 metadata retrieval**.

These instructions describe deployment; building locally does not apply migrations or publish the function or website.

## Build and install

Use the existing public Supabase configuration in `.env.local`. Add the exact website origin (no path) to that file:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_public_publishable_or_anon_key
EXTENSION_APP_ORIGIN=https://your-library.example.com
```

Then run:

```sh
npm run build:extension
```

The build reuses the app's public-key validation and writes `extension/dist/manifest.json` and `background.js`. Only public configuration is embedded. The generated directory is ignored by Git. For local development set `EXTENSION_APP_ORIGIN=http://127.0.0.1:5173` (or the actual Vite port). A build accepts messages from exactly that configured website origin; build again if the origin or Supabase project changes.

The Supabase URL and public key must also match the connected website's project. If `.env.local` points to local Supabase and your hosted public configuration is in `.env.local.hosted`, set `EXTENSION_APP_ORIGIN` to the hosted website origin and build with:

```sh
node --env-file=.env.local.hosted --experimental-strip-types scripts/build-extension.mjs
```

This uses the hosted public configuration without changing the app's local Supabase settings. Confirm `extension/dist/manifest.json` lists your hosted website under `externally_connectable` and your hosted Supabase project under `host_permissions`. Origins in `*.test.js` are test fixtures and do not configure the installed extension.

Open `chrome://extensions` or `edge://extensions`, enable Developer mode, click **Load unpacked**, and select `extension/dist`. Allow access to AO3 and the configured Supabase project. Copy the extension's ID into the hosted site's Settings, choose **Browser extension**, and click **Save metadata mode**. An optional `VITE_AO3_EXTENSION_ID` frontend build variable supplies the default ID; the Settings field overrides it on this device. For distribution, package the generated directory and follow Chrome Web Store / Edge Add-ons publishing; an unpacked install is sufficient for personal use.

When using local Supabase, start its Edge Function handler in a separate terminal and leave it running:

```sh
npx supabase functions serve extension-metadata
```

The extension can connect to Supabase Auth while this handler is stopped, but uploads and timeout reports will fail and hold up the import queue. A `503` with `name resolution failed` from `/functions/v1/extension-metadata` means the local Edge Function runtime is unavailable. Start it, then reconnect the extension in Settings. Older requests that have already failed can be retried from import history.

For local use, run `npm run dev` and open `http://127.0.0.1:5173/settings` (use the port printed by Vite). After rebuilding the extension, click **Reload** on its card in the browser's extensions page. `https://library-extension-test.example` is intercepted only inside the automated browser test; opening it normally produces a DNS error. Tests build their extension in a temporary directory so your installed `extension/dist` keeps its configured origin.

## Behavior and connection lifetime

- New import/refresh jobs snapshot your selected mode. Changing Settings does not move existing jobs between modes; cancel an old batch and submit again to change its mode.
- The website sends the extension a short-lived Supabase access token through the browser's external-messaging API. The manifest and background worker both restrict the sender to your configured website origin. AO3 pages never receive that token. It is stored only in `chrome.storage.session`, with no refresh token.
- The extension claims only your outstanding extension jobs. It handles one work at a time, reuses a matching AO3 tab, or opens a normal background tab. It captures only metadata, summary and chapter-navigation elements; no chapter text, account forms, or cookies are uploaded. Existing tabs are never closed or redirected.
- After a successful import, the browser checks for the next queued work after 3 seconds. Imports remain sequential, and the next work waits for the current page’s metadata to be ready and saved. A 30-second background alarm still checks for new jobs and retries interrupted requests; page-load events also trigger checks. Keep the browser running. Opening the website refreshes the connection; after a browser restart or expired login, reconnect from Settings. `AUTH` on the extension badge means reconnect; `WAIT` means a requested page is waiting; `!` means a request failed and will be retried while the lease remains valid.
- Requested tabs can supply metadata before images and other resources finish loading. An early check waits up to 8 seconds for the HTML to be parsed and the title, byline, fandom, rating, word count, and chapter count to be present. Full-load checks remain the fallback for sparse pages or an early miss. Chapter navigation and optional fields come from the parsed document; login and confirmation pages are not imported. Overlapping checks share the existing sequential job processor. The `webNavigation` permission supplies an AO3-only, main-frame DOM-ready event; ordinary visits still do not create import jobs or trigger capture. Reload the extension after rebuilding and accept its updated permissions if Chrome requests them.
- Finish AO3 sign-in, adult-content confirmation or a blocking challenge yourself in the requested tab. The extension captures only after the requested work loads successfully. After about five minutes it records a retryable failure; retry explicitly from import history. Network outages preserve the request until the lease expires; fencing tokens reject late, cancelled, or superseded uploads.
- Browser-supplied metadata is stored privately on the requesting library entry. The existing server parser and validator process it; manual overrides take precedence. Shared AO3 metadata and manual corrections are preserved. Explicitly importing a verified chapter URL sets fully read chapters to the linked chapter position minus one, including for an existing fic and when returning to an earlier chapter. A To Read fic becomes Reading when at least one chapter is read. Metadata-only refreshes preserve the current reading location. Personal edits made while retrieval is pending take precedence over delayed results. Chapter links can use private verified mappings.
- All requests already authorized in your account can continue when the website tab closes, until the extension's short-lived token expires. Signing out through an open app disconnects its extension session. Browser restart clears it. Ordinary AO3 browsing never creates work requests.

## Verification

`npm test` includes real PostgreSQL migration/RLS tests, the Edge handler boundary, metadata capture, extension request gating, cancellation, session expiry, and service-worker restart recovery. `npm run build:extension` creates the installable artifact. Live AO3 access, your deployed Supabase environment, and store publication require their respective environments.

### Series previews

Rebuild and reload the extension after updating. In the importer, explicitly loading an AO3 series preview reuses or opens the first series page, captures its listing, description and work blurbs, then follows each Next link by opening that page and combining its work previews. It does not open the listed works or create imports. Complete sign-in/confirmation in the AO3 tab within two minutes, or retry/skip the preview. Deploy the `series-preview` function and apply the series-preview migration before using this feature. Selected works use the existing import queue after confirmation.

## Bookmarks and Marked for Later sync

Apply migrations through `20261022000400_library_sync.sql`, deploy the updated website, rebuild with `npm run build:extension`, and reload the unpacked extension in Chrome. Accept the added `unlimitedStorage` permission, used for durable large-library checkpoints. Reconnect in Settings with the extension ID. No new Edge Function or Python installation is required for listing sync.

Open **Mass Import from AO3 → AO3 Library Sync**. Paste an unfiltered URL:

- `https://archiveofourown.org/users/USERNAME/bookmarks`
- `https://archiveofourown.org/users/USERNAME/readings?show=to-read`

Run **Full library scan** for each list initially, then choose **Import scanned works**. Subsequent **Quick Sync** runs use that list's acknowledged record IDs (bookmark IDs for Bookmarks, work IDs for Later). Bookmark requests explicitly use creation date descending. Quick Sync stops after the first overlapping page, preserving all new works on that page; it cannot detect removals or additions behind the overlap boundary. Use a full scan if list ordering changes. Both modes keep existing library entries, including manual metadata, notes, tags, ratings, and progress. Full scan adds missing works; it does not overwrite existing metadata.

The listing selectors are ported from `ao3_scraper/ao3_export.py`. The existing JavaScript CSV row converter and database importer validate and save new works. Listing sync completes its import jobs in the same transaction without fetching individual work pages. New bookmark notes and tags follow CSV import rules; historical chapter progress cannot be established without chapter release dates and is left unconfirmed. Series bookmarks, deleted works, and external works are counted as skipped. Work and bookmark source rows have separate Quick Sync identities; the library's existing model still has one entry per work, preserving the first saved entry when the work occurs in both lists.

Scans use a separate local checkpoint state and one extension-owned AO3 tab, never redirecting existing browsing tabs. They wait for the current work job or series preview, then hold new work claims until paused or finished. Requests wait at least 15 seconds plus jitter; Chrome's alarm schedule can lengthen waits. Work imports retain their existing three-second queue interval. The request gate prevents imports/previews from opening a new page during a scan's cooldown. This coordinates this extension's traffic only, not other browsers or the hosted worker.

Pause, resume, or discard from the importer. Error, login, redirect, missing-tab, timeout, or restriction pages pause the scan rather than retrying automatically; inspect the AO3 scan tab and resume manually when appropriate. DOM capture cannot read HTTP status or Retry-After headers, so no automatic rate-limit bypass or retry is attempted. Five hundred pages is an incomplete-scan safety stop, never a successful partial import.

Each successful page is saved in extension local storage, scoped to the connected library account. Tokens remain session-only. Checkpoints survive service-worker/browser restarts; reconnect the same account to continue. Saved private notes stay on this device until imported or discarded. Completed baseline IDs remain until extension storage is cleared/uninstalled. Page-sized database transactions permit libraries larger than the CSV form's 2,000-work submission limit. An interrupted upload can be retried safely: existing works are kept, and baseline IDs advance only after all saved pages have been acknowledged. Different website tabs cannot acknowledge a replacement scan by accident. Closing the website does not cancel scanning while the session is valid.

# AO3 Library Companion (Chrome / Edge)

This Manifest V3 extension is part of the hosted library project. It captures metadata only for requests explicitly created by **Import URLs** or **Refresh metadata** on the connected website. It does not install an AO3 content script, watch browsing history, or import works just because you visit them.

## Deploy the hosted boundary

1. Apply the project migrations through `20261016000600_extension_imports.sql` to your Supabase project using your normal migration workflow (`supabase db push` for a linked project). Existing direct imports keep their behavior.
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

Open `chrome://extensions` or `edge://extensions`, enable Developer mode, click **Load unpacked**, and select `extension/dist`. Allow access to AO3 and the configured Supabase project. Copy the extension's ID into the hosted site's Settings, choose **Browser extension**, and click **Save metadata mode**. An optional `VITE_AO3_EXTENSION_ID` frontend build variable supplies the default ID; the Settings field overrides it on this device. For distribution, package the generated directory and follow Chrome Web Store / Edge Add-ons publishing; an unpacked install is sufficient for personal use.

## Behavior and connection lifetime

- New import/refresh jobs snapshot your selected mode. Changing Settings does not move existing jobs between modes; cancel an old batch and submit again to change its mode.
- The website sends the extension a short-lived Supabase access token through the browser's external-messaging API. The manifest and background worker both restrict the sender to your configured website origin. AO3 pages never receive that token. It is stored only in `chrome.storage.session`, with no refresh token.
- The extension claims only your outstanding extension jobs. It handles one work at a time, reuses a matching AO3 tab, or opens a normal background tab. It captures only metadata, summary and chapter-navigation elements; no chapter text, account forms, or cookies are uploaded. Existing tabs are never closed or redirected.
- The browser checks the queue at most every 30 seconds, also responding when its requested tab completes loading. Keep the browser running. Opening the website refreshes the connection; after a browser restart or expired login, reconnect from Settings. `AUTH` on the extension badge means reconnect; `WAIT` means a requested page is waiting; `!` means a request failed and will be retried while the lease remains valid.
- Finish AO3 sign-in, adult-content confirmation or a blocking challenge yourself in the requested tab. The extension captures only after the requested work loads successfully. After about five minutes it records a retryable failure; retry explicitly from import history. Network outages preserve the request until the lease expires; fencing tokens reject late, cancelled, or superseded uploads.
- Browser-supplied metadata is stored privately on the requesting library entry. The existing server parser and validator process it; manual overrides take precedence. Shared AO3 metadata and reading progress are not overwritten. Chapter links can use private verified mappings, but importing a chapter URL does not infer that you read earlier chapters.
- All requests already authorized in your account can continue when the website tab closes, until the extension's short-lived token expires. Signing out through an open app disconnects its extension session. Browser restart clears it. Ordinary AO3 browsing never creates work requests.

## Verification

`npm test` includes real PostgreSQL migration/RLS tests, the Edge handler boundary, metadata capture, extension request gating, cancellation, session expiry, and service-worker restart recovery. `npm run build:extension` creates the installable artifact. Live AO3 access, your deployed Supabase environment, and store publication require their respective environments.

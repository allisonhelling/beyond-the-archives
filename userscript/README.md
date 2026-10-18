# AO3 Library for iOS Safari / Userscripts

This companion runs in the free [Userscripts app](https://github.com/quoid/userscripts). It adds an inline, compact library panel to AO3 work/chapter pages. It shares the tracker's URL/progress helpers, reading statuses, public-key validation, and atomic database save; it does not require the Chrome extension.

## Deploy and build

Apply migrations through `20261018000200_userscript_devices.sql` to the intended Supabase project (`supabase db push` using your normal linked-project workflow), then deploy the website. No additional Edge Function is required. Local builds do not deploy these changes.

Use the same public project configuration as the website in `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_public_publishable_or_anon_key
EXTENSION_APP_ORIGIN=https://your-library.example.com
```

```sh
npm run build:userscript
```

Output: `userscript/dist/ao3-library.user.js` and a metadata file. Only the public configuration is embedded. For a separate hosted configuration, use `node --env-file=.env.local.hosted --experimental-strip-types scripts/build-userscript.mjs`. A script built for local Supabase cannot reach your Mac's localhost from an iPhone. Build with the hosted project's public settings for actual iOS use.

## Install and connect

1. Install Userscripts, open its app, and select a scripts directory accessible in Files.
2. Copy the generated `ao3-library.user.js` into that directory. Alternatively host it at an HTTPS URL ending in `.user.js`, visit that URL in Safari, and use the Userscripts popup's install prompt. The build does not host the file automatically.
3. Enable Userscripts under Safari extensions in iOS Settings. Allow it on `archiveofourown.org`; do not grant broad access to all websites. If Safari asks for network access, allow only your configured Supabase backend. The script matches HTTPS AO3 work URLs only, skips frames, and sends requests only to that compiled backend. Userscripts' documented metadata does not provide a `@connect` network allowlist; destination restriction is enforced by this script's fixed request URL and Safari permissions.
4. Open the Userscripts Safari popup once to load the new file, then reload an AO3 work.
5. Sign into your library website and open **Settings → iOS Safari userscript**. Name the device and create a code. Copy the full code into **Connect Library** on AO3 within five minutes. Codes are single-use and creating another replaces unused codes. Never paste a password, AO3 credential, or Supabase session token.
6. Refresh devices in Settings to see the paired device. Disconnect there to revoke access remotely, or use **Connection → Disconnect device** on AO3. Local disconnect requires backend confirmation; if offline, revoke from Settings on a connected device. Device authorization expires after 90 days; create another code to reconnect. Website sign-out does not revoke paired devices.

## Reading controls

- Chapter 1 defaults to To Read, a middle chapter to Currently Reading with the preceding chapters completed, and a known final chapter of a complete multi-chapter work to Finished. A one-shot remains To Read when first opened; the latest published chapter of an unfinished work remains Reading. Defaults are editable.
- Current chapter is separate from completed chapters: chapter 4 means three fully read chapters, or four when **This chapter is finished** is checked. Finished status saves all published chapters as read. For chapter URLs, position comes from AO3's chapter selector, never the numeric chapter ID. When position is unavailable or full-work view is ambiguous, enter the current chapter explicitly.
- Saved works show status, completed chapters, −/+, Edit, rating, private notes, and **Mark this chapter finished** when the page identifies the chapter. On the last complete chapter, ✓ completes all chapters and marks Finished. Finished entries offer an open clockwise arrow around a book and **Reread?**, which starts Re-reading at zero completed chapters without changing notes, tags, rating, favorites or collections.
- The editor supports private notes, personal tags (one per line), a 1–5 rating, and membership in existing custom collections. Create new collections in the tracker.
- “Saved” appears only after the backend confirms. Text drafts are preserved in Userscripts storage while typing and across failed requests/reloads, scoped to backend, account and work. Cancel discards the draft. Reconnecting to another account does not display the previous account's draft. Stale edits from another tab/device are rejected; use **Reload saved entry**, review the retained draft, then save. A response lost after saving can produce the same stale-entry prompt: reload to check the saved values first.

## Privacy and updates

The script uses `@inject-into content` and the privileged `GM` storage/network APIs. Device credentials and drafts are never stored in AO3 local/session storage, page attributes or messages. Its closed shadow panel limits exposure of rendered private fields to page scripts. Anyone with access to the browser/device or Userscripts storage may still access saved drafts. Revoking a device prevents backend access; it does not erase its local drafts. The backend stores credential hashes and grants credentials access only to this companion's library operations. It does not grant a Supabase login/session or general database access.

The script reads work title, authors, fandoms, tags, rating, chapter counts and chapter-navigation identifiers. It does not read/upload chapter prose, AO3 passwords, login forms or cookies. Visiting an unsaved work queries its library state but does not save it automatically. Adding a work captures a snapshot in the tracker's existing private automatic metadata layer, so old chapter counts do not become permanent manual overrides as a work grows. Existing metadata overrides, favorites and unrelated fields are preserved. Use the tracker's existing refresh tools for later metadata updates.

The footer always displays the installed version and links to Settings with update instructions. Bump `package.json`'s version before distributing changes, rebuild, and replace the same `.user.js` file in the selected Userscripts directory. Open the Safari popup and reload AO3; verify the footer version. Storage is retained when updating the same script; changing its name or reinstalling may require pairing again. The generated `.meta.js` is available for distribution, but no automatic update URLs are configured. Userscripts documents limitations in its update process, so manual replacement is the supported update path. See [Userscripts metadata and installation documentation](https://github.com/quoid/userscripts#metadata).

Automated tests cover defaults, credential boundaries, ownership, revocation/expiry, atomic saves, stale-write rejection and failure recovery. Actual iOS Safari and the App Store Userscripts runtime still require a device check after deployment.

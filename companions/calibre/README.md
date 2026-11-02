# Calibre Reader Plugin

Send existing EPUB formats from Calibre to **archives unfolded**, independently of organizer connections. Requires Calibre 7+ and the reader version containing **Calibre Transfers**. Books without EPUB formats are skipped; the plugin does not convert formats or remove DRM.

## Build And Install

From the repository root, using Python 3.11+:

```sh
python3 companions/calibre/build.py
```

In Calibre, open **Preferences → Plugins → Load Plugin From File**, select `companions/calibre/dist/archives-unfolded-calibre.zip`, and restart Calibre. If the action is hidden, add **archives unfolded** through **Preferences → Toolbars & Menus**. The package follows Calibre’s [UI plugin guide](https://manual.calibre-ebook.com/creating_plugins.html) and reads books through its [thread-safe database API](https://manual.calibre-ebook.com/db_api.html).

## Pair And Send

1. Open the intended reader library. Sign into the **reader account** and open that account’s library to use cloud delivery. Organizer connection does not select the library.
2. Choose **Calibre Transfers → Pair Calibre**, name the destination, expand **Pairing Configuration**, and choose **Copy Pairing Configuration**. Keep this configuration private: it contains a delivery credential.
3. In Calibre’s **archives unfolded** menu, choose **Pair Reader Destination**, paste the configuration, and save. The plugin remembers the library’s account, device, reader origin, and preferred mode. One active pairing is supported per Calibre configuration and reader library.
4. Choose **Sync Selected Books** or **Sync All Books**. Review the destination name, account, device, and transfer mode before confirming. **Sync All Books** includes the entire current Calibre database, independently of searches or virtual-library filtering. Selected/all-book sync only queues and retries those books; **Retry Queued Transfers** processes the entire unfinished queue, keeping each saved destination. Unchanged, acknowledged EPUBs are skipped. Changed files or mapped metadata are sent again as updates.
5. Keep the reader open to receive and parse files. The reader checks roughly every 15 seconds while visible; **Check for Incoming Books** checks immediately. This action and **Cancel Pending Imports** appear only while Calibre is paired. Calibre shows this pass’s results in **Successful**, **Failed**, **Pending**, and **Skipped** tabs with counts; choose **Retry Queued Transfers** to refresh cloud import results and retry uploads after reconnecting. Local results update when the reader acknowledges receipt.

| Reader Library At Pairing | Automatic Mode |
| --- | --- |
| Signed into reader cloud | Cloud Inbox |
| Guest/local library | Local Reader |
| Cloud account, now offline | Persisted queue for the same Cloud Inbox |

**Cloud Inbox** is also selectable explicitly for a paired account library. **Local Reader** explicitly sends to the paired guest or account library on the same computer. A browser may request local-network permission; some browsers or managed environments block HTTPS-to-loopback connections. If blocked, allow local access or explicitly choose Cloud Inbox for an account library. The plugin binds only `127.0.0.1:47821`; keep Calibre and the paired browser profile open. Only one Calibre bridge can own this port. **Stop Local Reader Bridge** disables it until the plugin restarts or another transfer starts.

Automatic uses the reader-library state captured at pairing, including while offline. Opening a different reader account or switching between guest and account libraries requires an explicit new pairing. Signing into the organizer never changes this state. On another reader device, open the same reader account and sync/download the cloud bookshelf; the original pairing configuration is not required there.

## Retries, Cancellation, And Results

The plugin snapshots each EPUB and its destination before sending, persists them under Calibre’s configuration folder at `plugins/archives-unfolded-queue`, and attempts transient cloud failures up to three times per transfer pass. Restarting Calibre retains undelivered transfers. **Retry Queued Transfers** is the explicit next attempt; the plugin does not upload automatically in the background. Cloud authentication failures remain pinned to the same account.

**Cancel Transfer** stops further work between files and retry waits; an active network request may take up to its 30-second timeout to finish. It does not recall already delivered books or erase the saved queue. The reader’s **Cancel Pending Imports** stops remaining staged imports before commit; use **Retry Import** to resume failed/cancelled books. An invalid EPUB is a per-book error and does not stop the rest of the batch. Missing optional images use text placeholders instead of failing the import; the result reports how many were unavailable. Update the reader and choose **Failed → Retry Import** to retry previously affected books. Missing chapter resources and corrupt EPUB structure still fail. Plugin cancellation also leaves queued local deliveries available to an open reader; stop the bridge to stop local reception.

A cloud **queued** result means delivery succeeded and a reader still needs to parse it. **imported**, **duplicate**, **error**, and **cancelled** are reader results. Successful results remove the plugin’s staged original after acknowledgement; unsuccessful originals stay available for retry. Receipts remain saved. The reader separates Successful, Failed, and Pending results into tabs. The Calibre plugin also groups results by status, keeping missing-EPUB skips separate from successes and failures. Queue files contain private EPUBs and delivery credentials; protect and back up the Calibre configuration as appropriate.

Failures never silently switch libraries or transports. To switch deliberately, select the other mode and sync the desired books again. Existing queue entries keep their original destination. Review all queued destinations in the confirmation dialog. Re-pairing does not rewrite old jobs; revoking their credential will prevent subsequent cloud delivery. Already-uploaded files remain in the account’s private storage.

The shared reader queue verifies file size/hash and uses the existing EPUB parser, exact-file duplicate handling, and history-preserving version mapper. Plugin 1.1.0 sends the stable Calibre book UUID. Calibre updates match that UUID or an existing AO3 work and replace the previous shelf entry/file, including its old cloud copy on sync. Manual reader imports keep their existing version choices. Notes, history, and mapped positions are preserved; uncertain mappings require choosing where to resume. Standalone EPUBs use the stable Calibre UUID when available; older deliveries without one use exact hashes, without fuzzy title matching. Exact downloaded EPUBs skip file retrieval and parsing while applying mapped metadata updates. Identical hash/metadata deliveries already pending or successful for the same paired destination are skipped by the plugin. Bulk imports do not automatically link books to the organizer. Use **Manage EPUB** to link explicitly.

## Optional Metadata Mapping

In **Pair Reader Destination**, the optional JSON maps reader metadata fields to Calibre lookup names:

```json
{"title":"title","authors":"authors","publisher":"publisher","fandoms":"#fandoms","additional_tags":"tags"}
```

Supported reader fields: `title`, `authors`, `publisher`, `language`, `language_code`, `rating`, `summary`, `fandoms`, `additional_tags`, and `series`. Use text fields for scalar values and Calibre multi-value fields for lists. Calibre’s scalar `series` column needs a multi-value custom source to map directly to the reader’s `series` list. Unsupported values are ignored by the reader; unmapped fields come from the EPUB. Summary mappings are plain text. Mapping cannot overwrite book identity, notes, progress, or history. Metadata is limited to 16 KiB per transfer; EPUBs are limited to 50 MiB.

## Revoke Pairing

In the paired reader library, choose **Calibre Transfers → Revoke Pairing**. Cloud revocation requires that account to be signed in and online. Stop the local bridge in Calibre too, then replace the pairing before sending to a different destination. Credentials grant inbox delivery and result lookup only, without access to the account’s cloud reading history or organizer.

## Verification

```sh
python3 -m unittest discover -s companions/calibre/tests -v
python3 companions/calibre/build.py
npm run build --prefix reader
npx vitest run server/reader-inbox.test.ts supabase/tests/reader-calibre.test.ts reader/tests/calibre-import.test.ts
cd reader
npx playwright test tests/browser/calibre.spec.ts
```

For a native worker smoke check after installing into an isolated Calibre configuration, run `calibre-debug companions/calibre/tests/native_smoke.py` with `QT_QPA_PLATFORM=offscreen`. It creates a temporary Calibre library and exercises the real database API and Qt worker without touching a personal library. On macOS the CLI tools are inside `/Applications/calibre.app/Contents/MacOS/`.

The CI matrix runs the Python transport tests and packaging on Windows, macOS, and Linux. Native Calibre/Qt installation and browser loopback permissions still require platform checks: install the ZIP, pair guest and account libraries, send selected/all books, cancel during upload, restart offline, retry without a destination change, and verify duplicates/new versions/history in the reader. CI transport checks do not establish native GUI compatibility. Cloud operation requires the migration and edge function described in the [reader implementation guide](../../reader/docs/IMPLEMENTATION.md#calibre-transfers).

Rebuild and reinstall the plugin ZIP after updating to 1.2.0, then restart Calibre. Older installed versions do not gain duplicate checks or the selected-only queue behavior from a reader update. Version 1.2.0 includes stable Calibre book identity, selection-scoped retries, and grouped results. An initial delivery from an older plugin may need one metadata update to associate its stable Calibre UUID with an already-imported file.

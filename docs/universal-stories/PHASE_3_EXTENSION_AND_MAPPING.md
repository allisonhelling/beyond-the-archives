# Phase 3 — Extension Extraction And Visual Mapping

## Reused Boundaries

The Chrome/Edge MV3 companion uses the existing extension identity, configured organizer origin, capability handshake, and verified Supabase connection. AO3 work capture and scans keep their separate queues and permissions. The generic editor calls the same checked story writer as the web form. The source adapter for AO3 remains the existing on-page bar. Generic public URLs use structured data, bounded semantic or page metadata, and validated saved mapping rules. Adapter detection for additional named sources belongs to later phases.

## Request And Result Contract

`AO3_LIBRARY_CAPABILITIES` revision 1 advertises `generic-site-extraction-v1` and `visual-mapping-v1` from companion 0.8.0 alongside `metadata-retrieval-v1`. Old organizers check for the existing member. New organizers require a correlated, revision-1 capability response for generic work. An unavailable companion leaves the existing manual form available.

`BTA_SITE_REQUEST` accepts `begin` and `read` from a top-level document on the configured organizer origin. The request contains a UUID `requestId`, associated `account`, exact normalized source `url` and `origin`, `operation`, `capability`, `version: 1`, `createdAt` and `expiresAt` (milliseconds), and optional `draftId`. Teach requests also contain the selected `field`. Requests expire after up to 30 minutes. The background records the initiating tab/document and source tab. A result echoes the request with source `tabId`, a result `code`, and optional bounded, typed `observations`. `PERMISSION_REQUIRED` is pending. `OK` is delivered once. `STALE`, `DISCONNECTED`, and `EXTRACTION_FAILED` leave the original draft available.

A web request opens a visible source tab. The user clicks the toolbar icon there to grant temporary `activeTab` permission. No automatic injection follows a web request. The controller checks account, target URL, top-level document identity, and the editor frame identity before acting. Toolbar entry without a web request starts an in-tab editor for the active source. On supported pages, the editor is an extension-origin iframe and the DOM selector runs in the isolated world. Browser restrictions or restrictive frame policies can require manual entry. An app handoff uses an opaque identifier in the URL and retrieves the associated draft from the extension under the same account and tab. Entering or reconnecting from the app keeps the open web form.

Only named, bounded plain-text fields and rule data flow out of the source tab. Script nodes, forms, form values, cookies, credentials and raw HTML are excluded. Recognized credential-like URL parameters and non-public destinations are excluded from generic handoff. URL patterns are confined to a single origin. Generic labels do not acquire AO3 verification or identity.

## Rule And Draft Lifecycle

A story draft and a rule draft are stored separately within the browser's account-scoped checkpoint. Up to 20 recent story checkpoints are retained for seven days. A disconnected draft can be resumed from the same source tab after connecting. The app flow retains its in-memory story form while the source tab is open. A draft transferred from a saved story carries its original edit baseline so subsequent changes are reconciled by the checked writer.

Use Once previews or adds the selected field without creating a saved rule. Exact URL rules drop known tracking parameters and preserve other URL identity parameters. Matching Story Pages uses an explicit path prefix ending at a segment boundary. Site-Wide Defaults match a single origin. Broad saves and broad imports require explicit approval. Scope precedence is exact, longest matching prefix, then site-wide. Reusable rules are evaluated against a second matching page before a newly created broad rule becomes Working. A fallback match or an unexpected value on the original example is Needs Review; no match is Broken. Review Repair shows previous and current values and only updates selectors after an explicit save.

Settings → Imports & Connections → Site Mappings lists the scope, last validation, example and health. Portable JSON revision 1 omits extracted example text and uses fresh rule IDs on import. Saved rules use owner-only storage and optimistic revision checks. The mapping file is the portable backup for reusable rules.

## Persistence And Rollout

Apply the staged Phase 2 Finished-count guard before `20261117000300_site_mappings.sql`. The latter adds an owner-scoped rule table, a checked writer for mapping changes, and an atomic wrapper around the existing story writer. The wrapper stores browser observations under `library_entries.extension_metadata.generic_observations` separately from accepted edits and personal values. Existing source identities, backup formats and AO3 capabilities remain compatible. For concurrent story edits and chapter changes that require review, the in-tab editor preserves the draft and offers Continue in App. The existing web editor handles conflict and progress choices.

Upgrade the database first, then the organizer, then rebuild and reload the existing companion. Rolling back the binaries leaves the additive rows and private observations readable through existing library workflows. No rollout was performed as part of implementation.

## Browser Verification

On installed Chrome and Edge, open a public fiction page with a visible title, byline, and chapter label. Click the toolbar icon and compare the panel with the source. Test Close and Esc after editing, reconnect, and reopen to check the draft. Test field-first and element-first mapping, Pause Selection while expanding a page section, and same-document navigation. Save a story, reopen it, and confirm that fresh observations do not replace its manual fields. Save an exact rule and a broad rule, revisit a second matching page, then remove the primary selector and review the resulting repair. Export and reimport the mapping file and confirm broad-scope approval.

From Add Story, verify preview and Teach Selected Field return to the same edited form. Test the unsupported companion and a frame-blocked source with manual entry. Check native Safari saved work, reading, and manual flows independently. Phase 4 can build bulk review on the bounded observation and mapping contracts.

## Local Verification

Commands use Node 24 through `PATH=/opt/homebrew/opt/node@24/bin:$PATH`.

| Command | Result |
| --- | --- |
| `npm run check` | Passed lint, organizer build, 2,171 tests in 194 files, 45 integration-configuration tests, and the security gate. |
| `npm run db:types:embedded` | Replayed the ordered schema and generated the mapping table and RPC types. |
| `npx vitest run supabase/tests/{foundation,privacy-catalog,release-migrations,site-mappings}.test.ts --maxWorkers=2` | Passed 65 tests, including forced RLS, mapping version checks, owner isolation, and separate observation storage. |
| `npx vitest run src/features/library/StoryForm.test.tsx src/features/imports/site-mapping.test.ts companions/chrome/site-extraction.test.js --maxWorkers=2` | Passed 38 tests, including applying a taught value to an edited web form, selector drift, and portable rule validation. |
| `VITE_SAMPLE_DATA=true npx playwright test tests/e2e/site-editor.spec.ts --project=desktop` | Passed the final installed Chromium fixture, including explicit recovery of a disconnected draft on an already-saved story. |
| `VITE_SAMPLE_DATA=true npx playwright test tests/e2e/site-editor.spec.ts tests/e2e/universal-manual.spec.ts tests/e2e/extension.spec.ts tests/e2e/userscript.spec.ts` | 17 passed, 3 skipped by desktop extension constraints, and 2 Safari userscript fixture failures. The generic editor, both local and hosted AO3 extension fixtures, 12 manual-story tests, and both first-chapter userscript fixtures passed. |
| `VITE_SAMPLE_DATA=true npx playwright test tests/e2e/userscript.spec.ts --project=desktop -g 'keeps chapter controls'` and the same command with `--project=mobile` | Reproduced both failures on a temporary archive of the unchanged base commit, using loopback port 4273. Desktop Private Notes stayed visible after collapse. The mobile selected tag's remove-cap opacity was 1 instead of 0. |
| `git diff --check` and `git diff --cached --check` | Passed. The preexisting Phase 2 index remained staged. |

The persistent Chromium fixture uses a temporary test host grant to drive the same controller that the toolbar calls. Installed toolbar permission prompts, native Safari, blocked frames on real sites, and a real Supabase service remain manual release checks.

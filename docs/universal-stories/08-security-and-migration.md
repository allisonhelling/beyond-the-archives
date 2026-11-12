# Security, Provenance, And Migration

> **Status:** Accepted product requirements; future implementation. The existing architecture is prepared for multi-site support, but the features described here are not necessarily implemented.
> **Source:** the supplied consolidated specification (workspace planning source). [Index](README.md) · [Implementation plan](IMPLEMENTATION_PLAN.md).

**Phase 1 reconciliation:** The [current foundation record](PHASE_1_FOUNDATION.md) audits reviewed `main` at `600ef23`, including hierarchy crossover filtering and Phase 0. It finalizes typed identity/provenance adapters against existing owner-protected data and adds only starter provisioning. General-source persistence and later product features remain unimplemented; the earlier accessible-main reconciliation below is historical evidence, not a statement that the new foundation creates a universal save API.

## 12. Security, Provenance, And Reliability

- **Safe URL fetching:** Restrict protocols, block SSRF/private-network targets, handle redirects safely, enforce size/time limits, and sanitize extracted HTML. Do not treat arbitrary page content as trusted instructions.
- **Extension permissions:** Minimize permissions and explain access; don't assume every tab is injectable.
- **Privacy:** User site mappings, learned rules, manual notes, and personal progress are private/account-scoped by default.
- **Provenance:** Store source URL, original imported URL, extraction method/adapter version, timestamps, field confidence/evidence, and raw tags where practical.
- **Override protection:** Imported refreshes must not silently replace user-edited fields or shared personal metadata.
- **Deduplication:** Use verified source-specific IDs and normalized URLs where justified; avoid merging different stories merely because titles/authors match. Cross-site matching requires confirmation.
- **Partial failure:** Allow saving even if metadata extraction fails, provided required fields (notably published chapter count) satisfy validation. Mark uncertain values rather than fabricating confidence.
- **Mapping maintenance:** Test against representative URLs, surface failures and changed DOM structure, and allow users to revise/disable mappings.
- **Import history:** Preserve meaningful review states, retries, source evidence, and failure reasons.
- **Backups/export:** Include user-owned custom mappings, learned classification rules, source-version associations, source-specific progress, and page-specific mapping drafts as appropriate; do not conflate reconstructible shared tag caches with user data.

## 13. Existing Application Integration And Migration Notes

The current repository documentation and latest accessible `main` history describe a React/TypeScript/Vite/Supabase organizer with a separate `archives unfolded` EPUB reader, Chrome/Edge desktop companion, Safari userscript, private `library_entries`, shared AO3 works, AO3-centered `ao3_work_id` identity, owner-private observations/manual overrides, canonical tag evidence, import history, and editable automatic collections. **The checked-in current documentation still describes AO3-only source support**; the claimed multi-site architecture refactor could be in an uncommitted or different branch and is **not verified** from the accessible `main` snapshot. Do not assume source-independent identities or multi-site saving are already deployed.

**Important newer architecture constraints:**

- **Extension-only AO3 metadata retrieval:** The direct hosted work/series fetch worker has been retired. Website-initiated AO3 work imports, bulk URLs, CSV, series previews, scans, chapter-date checks, and metadata refreshes require an authenticated compatible Chrome/Edge desktop companion (capability `metadata-retrieval-v1`). A future universal extractor should be designed around the companion/browser-capture path, not the retired direct worker. Safari's on-AO3 controls and manual website entry remain narrower alternatives.
- **Source authority:** AO3 canonical tag synonyms require explicit AO3-verified category-correct evidence; similarly spelled tags and non-AO3 labels do not inherit AO3 authority. The new classifier must keep source-qualified evidence and user-defined tag mappings separate from canonical AO3 facts.
- **Already-existing generalized foundations:** The fandom crossover subsystem uses application UUID identities and source-qualified verified/disputed mappings for *fandom hierarchy evidence*. This is not proof that story identity has been generalized. Reuse its provenance/authority patterns where appropriate, not its data structures by assumption.
- **Reader/EPUB integration:** `archives unfolded` has independent local/cloud EPUB identity, anthology members, explicit per-work AO3 matching, chapter identity/position mapping, and organizer progress sync. Multi-site identity and crosspost linking must extend these interfaces without falsely treating an EPUB hash, local section ID, or chapter ordinal as a verified source work/chapter identity.
- **Current chapter semantics:** Existing organizer chapter counts may be nullable/unknown; fully read progress is represented numerically, and verified chapter-link position N means N−1 fully read chapters. The new universal-import product rule requiring a published count before saving is a **new workflow requirement**, not an existing global database invariant. It must be introduced without breaking AO3 bare-identity imports, legacy entries, EPUB recovery, or unknown-count handling unless separately approved.
- **Current collections:** `One Shots` is a user-editable/deletable starter automatic collection, and sample data also contains `Deleted Works`. Seed `Original Works` through the same one-time editable mechanism, respecting user deletion and sample/reset behavior.
- **Existing filters and search:** Fandom Any/All/Custom OR-of-AND groups, tag Any/All, AO3 canonical evidence, crossover classification, source-specific verified ancestry, indexed effective search documents, automatic collection memberships, and revision-based query caches already exist. New source/tag dimensions must participate consistently in the full filter/query/collection/series pipeline.
- **Privacy and migrations:** Existing AO3 work metadata can be shared, while browser observations, manual overrides, library progress, and reader state are account-scoped. Generalizing source identities requires explicit RLS/RPC, export/backup/restore, cache revision, and companion compatibility migrations.

Consequences for implementation:

- Introduce source-independent story identities and source-version records without losing existing AO3 work IDs or user libraries.
- Generalize AO3-only URL validation in save paths and RPCs; retain strict AO3 verification *for AO3 sources* rather than removing validation indiscriminately.
- Update all read/write, deduplication, import, extension, metadata override, collection, search, backup, and story-detail paths that assume one AO3 URL/ID per story.
- Keep account-scoped personal state separate from shared canonical source metadata and verification caches.
- Preserve current AO3 behavior (including browser reading events and status updates) as a regression requirement.
- Review existing automatic collection semantics so Original Works uses the same editable starter-collection mechanism.
- Migrate incrementally with compatibility handling for old AO3-only entries, backups, and existing extension clients.

This is a **future design specification**, not a claim that universal imports, FF.net/Wattpad adapters, custom site mapping, or crosspost linking have been implemented. The architectural refactor reported by the user requires branch/commit verification before implementation estimates or migration instructions are finalized.

## 13A. Repository Reconciliation And Implementation Status (12 November 2026)

| Area | Verified existing state in accessible `main`/documentation | Effect on this proposal |
|---|---|---|
| Supported story sources | AO3 only; no documented FF.net, Wattpad, Tumblr or arbitrary-site integration | All-site support remains proposed |
| Identity | AO3 work IDs and owner-private entries; UUID/source-qualified mapping work exists for **fandom hierarchy**, not demonstrated for stories | Audit the separate refactor branch before replacing identity models |
| Metadata transport | Authenticated Chrome/Edge companion for website-triggered AO3 retrieval; direct hosted retrieval retired | Universal extraction should first target active-tab capture and extension capability negotiation |
| Safari/mobile | Safari on-AO3 companion and manual entry; mobile web lacks desktop automatic/bulk retrieval | Specify a manual fallback and do not promise automatic mobile fetching |
| Tags | Categorized AO3 tags, verified canonical synonyms, user tags, unclassified legacy tags | Keep user mappings, unverified labels and AO3 canonical evidence distinct |
| Chapter tracking | Nullable counts, chapter-read events, verified AO3 chapter mapping, independent EPUB reader sync | New required-count rule applies to new universal save flow unless deliberately expanded |
| Crossovers | Verified AO3 fandom ancestry and cached classifications | Not equivalent to crossposted-work linking |
| Collections | Editable automatic rules; One Shots starter, Deleted Works sample | Original Works can reuse established semantics |
| Reader | Independent EPUB bookshelf/cloud, anthology per-work mapping, AO3-linked sync | Multi-source linking must not corrupt existing AO3 or EPUB identity |
| Deployment | Ordered SQL migrations, Edge Functions, companion builds and separate frontend deploys | Changes must include migration, compatibility and rollout checks |

**Evidence and verification boundary:** Reviewed `PROJECT_OVERVIEW.md`, both available `IMPLEMENTATION.md` snapshots, and the latest accessible GitHub `main` commit history (through `082701d`). The repository documentation says no additional fiction platform is supported. No source-independent **story** refactor was established by the available documents or recent `main` commits. This does **not** disprove work in a local checkout, unpublished branch, or newer commit. If that is where the refactor lives, compare its schema, types, RPCs, import parsers and companion code with this document and replace the provisional assumptions above.

**Implementation acceptance additions:**

1. Existing AO3 works retain identity, manual overrides, reading history, bookmarks, Wayback links, series membership, canonical tags, and exports after migration.
2. A user without a desktop companion can still manually save/edit stories under supported manual workflows; universal auto-extraction must not imply the retired hosted worker is available.
3. Generic-source tags never acquire verified AO3 canonical status merely because their spelling matches.
4. A new arbitrary-site story cannot overwrite an AO3 work or reader anthology member based solely on title/author or matching chapter number.
5. Source identity, preferred source, and linked progress survive JSON backup/restore and remain account-isolated.
6. The new universal-import chapter-count requirement is explicitly scoped and tested against existing unknown-count AO3/EPUB entries.

## Cross-Layer Compatibility Gate

Before changing shared messages, error handling, or normalized work fields, apply the versioning, capability negotiation, source-error evidence rules, and fixture tests in [09 — Compatibility Contracts](09-compatibility-contracts.md). Phase 0 establishes the baseline; subsequent phases extend it without breaking existing AO3 or reader flows.

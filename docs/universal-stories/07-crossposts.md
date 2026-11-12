# Crossposts And Chapter Correspondence

> **Status:** Accepted product requirements; future implementation. The existing architecture is prepared for multi-site support, but the features described here are not necessarily implemented.
> **Source:** the supplied consolidated specification (workspace planning source). [Index](README.md) · [Implementation plan](IMPLEMENTATION_PLAN.md).

## Crosspost-Specific Reading Rules (From The Accepted Specification)

### 9.2 Linking And Merging

- Suggest possible crossposts using supported evidence, but **require user confirmation** before linking.
- When linking existing library entries, show a side-by-side reconciliation preview.
- Preserve all source metadata and both reading histories; let users choose preferred display values and reconcile personal fields.
- Present linked versions as **one story tile** and **one shared details page**.
- Offer a source selector/tabs in details to switch summaries, tags, chapters, update dates, and reading links, plus an **All Source Metadata** comparison view.
- Allow unlinking later without destroying either source record.
- Do not destructively merge everything or silently select one source as authoritative for all fields.

### 9.3 Shared Versus Per-Version Data

| Shared story/personal | Source-specific |
|---|---|
| Collections, favorites, personal rating | Original title, author, summary, raw/categorized source tags |
| Personal notes and personal tags (optional source-specific notes later) | Source/canonical URL, site identity, published/updated dates |
| Overall reading status | Published/planned chapter counts and publication status |
| Preferred tile/display version | Chapter identities, chapter URLs, per-source reading progress |
| Explicit crosspost links | Extraction evidence and refresh state |

### 9.4 Crosspost Equivalence, Correspondence, And Conflict Resolution

Distinguish **possible crosspost** (title/author/summary similarity), **user-confirmed same logical story**, and **verified equivalent content** (trusted explicit references plus validated chapter correspondence or strong content-level evidence). Matching titles, authors, summaries, or counts alone never prove identity or content equivalence. Reciprocal author-supplied crosspost links support identity but do not prove every chapter matches. Never merge or overwrite histories automatically; linking remains user-confirmed and reversible.

Provide a **Compare Versions** dialog with source chapters side by side, titles/URLs, mapping confidence, and user confirmation. Support **one-to-one**, **one-to-many**, **many-to-one**, **unmatched/source-exclusive**, and **unknown** correspondence. For grouped correspondence, sync a target chapter as read only when **all** mapped source content has been completed. Do not synchronize by raw chapter number, and do not infer correspondence from matching counts alone. Conflicts offer **Keep Separate**, **Use This Version's Progress**, and **Mark Corresponding Chapters Read**; the last requires sufficiently verified correspondence. The default is independent progress. Keep chapter-read history and source version identity intact even when the user chooses to reconcile progress.

A shared completion prompt is nonblocking and appears only when linked versions have differing progress and equivalence or completion needs a user decision; remember a dismissal for the relevant version state. Confirmed complete and content-equivalent versions may update the overall story completion without requiring rereading each version, but per-source chapter progress changes only under explicit verified synchronization/mapping preferences.

### 9.4 Source Indicators On Tiles

The current **tile colors and book-spine footer are fixed**; customization is not a requirement and should not be assumed. Preserve the existing visual design rather than changing the entire tile background to represent origin.

Preferred direction: a **compact source badge/icon** on the tile (e.g., AO3 or FF.net) and a stacked-source/`+N` indicator for crossposts. Clicking it opens a source switcher with links, chapter progress, and primary-source selection. A narrow colored stripe or **segmented book-spine footer** may be used as a supplementary visual cue, but **never rely on color alone**. Keep a source identity in data even for single-source stories; a crossposted story cannot be accurately represented by only one `origin` enum.

**Open decision:** Exact final tile treatment (badge alone, badge + stripe, badge + segmented footer), source color palette, and visual placement. The badge/icon approach is the leading recommendation, not a confirmed pixel-level design.

### 10.3 Crosspost Progress Modes

**Default: Independent progress** for newly linked crossposts. Other modes:

- **Synchronized:** User confirms one-to-one chapter equivalence; updating one source updates corresponding progress on linked versions.
- **Mapped:** Later advanced support for explicit cross-site chapter correspondences when chapters differ in count/order/splitting.

Do **not** assume AO3 chapter 12 equals FF.net chapter 12. Switching sources may offer to use another source's chapter position but must not silently overwrite independent history. Overall story status is separate from per-source position; the user need not reread an equivalent crosspost to count the story as completed.

### 10.4 Finishing The Last Published Chapter In The Browser

**Preserve existing automatic reading-status behavior** for a single-source story. For linked crossposts:

1. Mark the **current source version** caught up when the last *published* chapter is marked read.
2. Distinguish **Caught Up** (read latest available) from **Completed** (finished a work known to be complete). Caught Up can be a derived indicator while the overall status remains Reading; it need not be a new top-level status.
3. If linked versions are **confirmed equivalent**, update overall story completion automatically when the user finishes the completed work, without an interruption. Sync other versions' chapter progress only when explicit synchronization/mapping is enabled.
4. If equivalence or completion is **uncertain**, ask **once** whether finishing this version should mark the shared story Completed; offer to remember the preference. Keep the prompt non-blocking and avoid repeatedly asking.
5. If versions are known to differ, update only the current source automatically and ask before declaring the overall story Completed.
6. Respect deliberate manual statuses such as DNF; do not silently override them.
7. When new chapters are published after a story was marked Completed, **do not automatically revert Completed to Reading**. Instead surface `Completed · 1 new chapter available` or similar, without treating an already-read crosspost chapter as definitely new content.
8. Never blindly recalculate overall status from chapter counts on every metadata refresh. Use well-defined user/reading events and preserve manual overrides.

**Accepted completion-evidence rule:** Finishing all known published chapters means **Finished** only when publication is confirmed complete by trusted source evidence or explicitly marked complete by the user. Verified or manually supplied *ongoing* publication status yields **Waiting for Updates**; unknown publication status yields **Caught Up / completion unconfirmed** without inventing author completion. Preserve the existing application's seven stored reading statuses; Caught Up can be a derived indicator, not a new persisted status. An explicit user Finished override can coexist with a mismatch flag. For linked crossposts, the one-time completion prompt is needed only when linked versions have differing progress, correspondence/completion is uncertain, and no equivalent prompt has already been dismissed for that version state. Do not ask repeatedly. The exact copy may be refined during UI implementation.



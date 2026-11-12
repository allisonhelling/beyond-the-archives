# Story Architecture And Identity

> **Status:** Accepted product requirements; future implementation. The existing architecture is prepared for multi-site support, but the features described here are not necessarily implemented.
> **Source:** the supplied consolidated specification (workspace planning source). [Index](README.md) · [Implementation plan](IMPLEMENTATION_PLAN.md).

## 9. Story Identity, Source Versions, And Crossposting

### 9.1 Core Data Model

A **Story** is the shared library-level identity; it can have **one or more Source Versions**. Each source version stores its own site, stable source identity when available, canonical/source URL, original imported URL, author/title/summary as published there, categorized/raw tags, published and planned chapter counts, publication status, chapter index, timestamps, extraction provenance, and source-specific progress.

A shared story stores user-facing personal organization such as collections, favorite status, personal rating, shared notes/tags, overall reading status, and **preferred display/primary source**. Preserve source-specific originals even if the user selects one version's metadata for the tile/details default.

Use source-independent internal IDs rather than making an AO3 work ID the universal primary identity. Preserve AO3 IDs and existing AO3 relationships during migration. Treat cross-site identity matching as a suggestion, not automatic proof. Keep explicit crosspost associations and reversible linking/unlinking.

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

## 11. Naming And User-Facing Language

Use **Story** as the default UI noun: Add Story, Story Details, story tile, linked story versions, Save Story. Existing database names such as `works` can remain internal.

Retain **Original Work** as the fandom/category label and **Original Works** as the starter automatic collection, because this is established AO3-style terminology and is broad enough to cover more than prose fiction. Using that one established category name alongside general “stories” is acceptable and not considered inconsistent.

Add the **Original Work** fandom/category and a starter **Original Works** automatic collection following the existing editable/deletable starter-collection pattern (such as One Shots). Recognize reasonable label variants/aliases like `Original Work` and `Original Works` when matching. Users should be able to modify or delete the starter collection.

## Cross-Layer Compatibility Gate

Before changing shared messages, error handling, or normalized work fields, apply the versioning, capability negotiation, source-error evidence rules, and fixture tests in [09 — Compatibility Contracts](09-compatibility-contracts.md). Phase 0 establishes the baseline; subsequent phases extend it without breaking existing AO3 or reader flows.

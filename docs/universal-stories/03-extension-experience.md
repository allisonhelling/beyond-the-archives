# Extension Experience And Handoff

> **Status:** Accepted product requirements; future implementation. The existing architecture is prepared for multi-site support, but the features described here are not necessarily implemented.
> **Source:** the supplied consolidated specification (workspace planning source). [Index](README.md) · [Implementation plan](IMPLEMENTATION_PLAN.md).

## 3. In-Tab Chrome/Edge Extension: Primary Save/Edit Experience

### 3.1 Entry Behavior

Clicking the extension icon on a random/unsupported site should open an **in-tab right-side panel** on the *current webpage*, not navigate to a different page or rely on a small temporary browser-action popup as the primary editor. The underlying webpage remains visible.

The panel:

- Presents **Save this page as a story** for an unsaved page, or the current saved story and editing controls if already saved.
- Immediately attempts to parse the current page and **shows the exact extracted values** (not merely detection indicators).
- Allows every extracted field to be edited manually and missing fields to be entered from scratch.
- Includes title, author(s), fandom(s), summary, categorized tags, published chapter count, optional planned chapter count, story/source URLs and other available metadata.
- Includes **personal information**: reading status, chapter progress, personal rating, notes, collections, personal tags, and applicable existing private fields.
- Offers **Map Page Elements** to enter explicit visual mapping mode.
- Preserves current edits when toggling mapping on/off.
- When editing an already-saved story, distinguishes fresh source metadata from saved personal overrides; does not silently overwrite them.

Use a content-script-injected interface (ideally isolated via Shadow DOM), with the existing extension/background messaging and authenticated backend where appropriate. Account for permission and browser-restricted pages.

### 3.2 Published Chapter Count And Manual Provenance

For **ordinary new single-story universal saves**, a published chapter count is required; it may be extracted, visually mapped, or manually supplied. The accepted range is **1–100,000 inclusive**. Provide a **Manually entered chapter count** checkbox when entering/correcting the value. A separately labeled estimate/provisional value may be supplied when the user is unsure, but it must not masquerade as source-verified. Published count and planned count are separate: `12/30` means 12 published and 30 planned. Unread progress is **0/N**, and the next reading action targets chapter 1. Enforce validation in the UI and persistence layer.

**Exceptions:** Existing/legacy AO3 and EPUB records may have nullable unknown totals; bulk imports with missing totals save unknown-count records and defer count entry to the resumable review queue. Unknown is not zero. Edits that increase a total beyond read progress or decrease it below progress follow the confirmation/history safeguards in §10.6; never silently clamp or invent reading progress.

### 3.3 Mapping Mode Interaction

Mapping is **explicitly toggled** from the story panel. It should resemble Inspect Element but use metadata categories instead of raw HTML/CSS.

- Hover highlights the underlying live webpage element.
- Clicking selects an element without following its link or triggering its normal action while selection is active.
- **Field-first:** choose a field (e.g., Author), then click the element.
- **Element-first:** click an element, then choose the metadata category from the panel/context menu.
- The mapping panel displays automatically suggested mappings **and their actual extracted values immediately**.
- Selecting a suggested mapping highlights the associated element; clicking a mapped element previews the extracted result.
- Support repeated fields (multiple tags, authors, fandoms), parent/child element navigation, and selecting a container/list rather than only one text node.
- Support value cleanup/transforms such as stripping `Written by:` and parsing chapter counts.
- Mapping mode exits when explicitly toggled off, when the panel closes, or on save/cancel of the relevant workflow. Unsaved story edits must not be discarded just because mapping mode ends.
- Provide a lightweight **Pause selection** action/shortcut to expand collapsed page sections or use page controls without requiring a prominent separate Browse Mode.
- Keep the panel collapsible/resizable where feasible so it does not hide the content being mapped.

### 3.4 One-Page Mapping Versus Reusable Mapping

**Default:** A mapping created while importing a story applies only to that page/story. It must **not** silently become a site-wide mapping.

Offer an explicit action such as **Create a Custom Site Mapping from this configuration**. A reusable mapping should include domain and story-URL patterns, example URLs, field extraction rules, and optional transformations. Test against a second representative URL before describing the mapping as verified.

Maintain distinct drafts:

- **Story draft:** Reviewed metadata, manually edited values, personal information, intended save state.
- **Mapping draft:** DOM-based extraction rules, target fields, examples, test results, and scope.

Mapping changes should not silently overwrite a manually edited story value. Canceling a mapping should not erase personal ratings or reading progress.

**Accepted mapping persistence contract:** A mapping defaults to **Use Once**, without creating a persistent rule automatically. The user may explicitly select **Save for This Exact URL**, **Save for Matching Story Pages**, or **Save Site-wide Defaults**. Saved rules are account-private and sync across devices where supported; local drafts may survive an interrupted browser session. Exact-URL scope ignores irrelevant query parameters but preserves identity-bearing parameters. Matching-page scope is bounded by a validated URL pattern; site-wide defaults can be overridden by more specific page-type rules. A saved page-specific rule may be associated with the story for later refreshes, but only when the user explicitly chooses to save it. Keep story metadata edits and mapping rules independent.

Mappings have versioned, portable JSON export/import containing URL scopes, selectors, field transforms, fallback selectors, rule versions, and optional sanitized test cases. Do not export cookies, credentials, or unnecessary page content. Validate imported rules before enabling them. Track mapping health as **Working**, **Needs Review**, or **Broken**; when selectors fail or values look suspicious, propose replacements and show before/after values. Never silently rewrite a user-confirmed mapping. Stable semantic fallback selectors may be tried, but must pass field-type and page-structure validation.

### 3.5 Teach-From-Correction

When a user manually fills or corrects a field such as Title or Author, offer **Teach Beyond the Archives where to find this field**. This activates mapping mode with that field already selected. Distinguish **extraction correction** (which DOM element to read) from **metadata correction** (what value the user prefers to store).

### 3.6 Browser Implementation Constraints

- Use extension content scripts and standard browser APIs (`scripting`, tab messaging, extension storage) to work on the **rendered live DOM**.
- Prevent normal navigation/actions during element selection, but provide a pause/exit route.
- Prefer stable attributes and semantic/relative element relationships; avoid relying solely on brittle positional CSS selectors such as `nth-child(...)`.
- Save generated extraction strategies internally; normal users never need to type selectors.
- Respect browser restrictions: internal pages, inaccessible cross-origin iframes, closed shadow roots, permissions, and some authenticated/dynamic content may limit extraction.
- Do not claim that every webpage is inspectable. Explain limitations and fall back to manual entry.
- Test mappings against multiple pages and surface mapping-health warnings if a site redesign breaks extraction.

### 3.7 Web-App / Extension Handoff Protocol And Fallback

Extend the existing authenticated companion connection and capability negotiation rather than creating a separate ad-hoc channel. Add capabilities such as `visual-mapping-v1` and `generic-site-extraction-v1` alongside the existing metadata retrieval capability. Web-app requests carry unique request ID, source URL, capability, expiry, and account association; the extension background coordinator opens/targets the source tab and communicates with a permission-gated content script for DOM selection and extraction. Validate message origins, account ownership, field payloads, and allowed target URLs; never forward credentials or cookies. Keep drafts recoverable if popup/tab closes, and require user activation or browser-approved site permission for injection.

When the extension is **not installed**, offer manual entry and explain why automatic extraction is unavailable. When **installed but disconnected**, preserve the request and offer reconnection. When **connected but unable to inspect the page**, preserve the draft and allow manual entry or a limited safe extraction preview if available. Do not promise arbitrary-site DOM access from the hosted web app or reactivate the retired direct hosted retrieval worker.

## Cross-Layer Compatibility Gate

Before changing shared messages, error handling, or normalized work fields, apply the versioning, capability negotiation, source-error evidence rules, and fixture tests in [09 — Compatibility Contracts](09-compatibility-contracts.md). Phase 0 establishes the baseline; subsequent phases extend it without breaking existing AO3 or reader flows.

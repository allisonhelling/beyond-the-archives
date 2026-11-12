# Universal Story Imports

> **Status:** Accepted product requirements; future implementation. The existing architecture is prepared for multi-site support, but the features described here are not necessarily implemented.
> **Source:** the supplied consolidated specification (workspace planning source). [Index](README.md) · [Implementation plan](IMPLEMENTATION_PLAN.md).

## 4. Web-App URL Import And Bulk Import

### 4.1 Single Unknown URL

Pasting an unknown website URL into the app as a story should immediately attempt extraction and open an **editable preview showing exact gathered data**. The user can correct all fields and enter personal information. For an ordinary new single-story universal save, require a published chapter count in the range **1–100,000**, with an explicit **Manually entered chapter count** checkbox when the user supplies it. This requirement does not retroactively invalidate existing AO3/EPUB records with unknown counts; bulk imports have a separate nonblocking unresolved-count workflow.

The preview offers **Map Page Elements**. If the extension is installed/authorized, open the actual source page in a browser tab and hand off to the in-tab extension mapping workflow, prepopulated with extraction suggestions and current draft values. The app cannot assume it can inspect arbitrary third-party DOMs directly or activate an unavailable extension. Preserve the draft across the handoff. Without the extension, allow manual editing; a sanitized fetched snapshot may be an optional limited fallback.

**Do not require mapping for one-off imports.** Review is mandatory by default for the first import from an unknown site; an established tested mapping can support a quick-save/skip-review preference. ML being enabled or disabled does **not** change whether the user can review or map.

### 4.2 Bulk URL Modes

Provide two explicit bulk import modes:

1. **Recognized Stories:** Import only URLs matching supported or user-saved **story URL patterns**, not merely any URL on a recognized domain.
2. **All Links as Story Candidates:** Treat every pasted URL as a candidate, attempt extraction, and surface failures for review rather than silently discarding them.

User-created Custom Sites can count as recognized once their URL rules are saved. Present a preflight summary for recognized, unrecognized, duplicate, invalid, and extraction-failed links. Allow review/edit where needed; avoid overwhelming the user with mandatory mapping for every URL. Retain existing import history/retry/background-worker behavior as appropriate.

**Accepted bulk-review contract:** Never block an entire bulk import solely because some published chapter counts are unknown. Save those records with a nullable/unknown count (never zero), attempt supported retrieval or saved mappings, and collect unresolved records in a **nonblocking, resumable review queue**. Default to **25 stories per page**, with **10/25/50** options. Users can edit counts individually, mark them manually entered, defer reviews, and filter the queue to stories with reading progress. Preserve draft edits, batch identity, and import history. Unknown count is distinct from an estimated or provisional count; do not invent a published total.

## Cross-Layer Compatibility Gate

Before changing shared messages, error handling, or normalized work fields, apply the versioning, capability negotiation, source-error evidence rules, and fixture tests in [09 — Compatibility Contracts](09-compatibility-contracts.md). Phase 0 establishes the baseline; subsequent phases extend it without breaking existing AO3 or reader flows.

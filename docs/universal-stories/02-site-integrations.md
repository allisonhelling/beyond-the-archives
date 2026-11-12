# Site Integrations And Mapping

> **Status:** Accepted product requirements; future implementation. The existing architecture is prepared for multi-site support, but the features described here are not necessarily implemented.
> **Source:** the supplied consolidated specification (workspace planning source). [Index](README.md) · [Implementation plan](IMPLEMENTATION_PLAN.md).

## 2. Integration Tiers And Capability Model

### 2.1 Integration Tiers

| Tier | Description | Expected behavior |
|---|---|---|
| **Fully supported** | Developer-maintained adapters, initially AO3; planned FanFiction.net and possibly Wattpad | Reliable site-aware metadata, tag handling, story URL recognition, and advanced chapter support as implemented |
| **Custom site** | User-configured URL patterns and visual extraction rules | Reusable metadata/tag extraction; eventually reusable chapter-index and chapter-link extraction |
| **Other website** | Any URL not covered by the above | Best-effort metadata extraction, editable review, manual entry, manual chapter tracking, optional one-page mapping |

Tier labels should not be used as rigid capability gates. Store independent capabilities such as `metadata_extraction`, `categorized_tags`, `chapter_index`, `chapter_link_resolution`, `source_refresh`, and `stable_chapter_ids`.

### 2.2 Extraction Sequence

1. Recognize URL and determine whether a trusted built-in or saved custom adapter applies.
2. Apply source-specific extraction when available.
3. Attempt generic structured metadata: page title, Open Graph, JSON-LD/schema.org, conventional meta tags, semantic DOM, and other conservative heuristics.
4. Apply deterministic field/tag inference and previously saved user corrections.
5. Optionally run browser-local ML for unresolved or ambiguous **tag classification**; ML is not required for site detection or mapping.
6. Display actual extracted values, their source/evidence where useful, and editable fields.
7. Save the reviewed story and its source provenance; do not overwrite user edits with future refreshes.

When extraction fails, keep the original URL and present an editable form rather than blocking the user. Metadata-only extraction is the default; do not assume a need to copy or host full story text.

## 5. Custom Sites Management And Visual Mapping Builder

### 5.1 Navigation

Use **Settings → Imports & Connections → Site Mappings** as the permanent home for creating, reviewing, testing, editing, enabling/disabling, and deleting custom-site mappings. Entry points should also appear in the extension panel, single-story import preview, and bulk import. Do **not** put the configuration exclusively in Mass Import or create a required top-level navigation section. A self-contained mapping manager may move to a top-level route later only if mapping management becomes a substantial frequent workflow; this is not a current requirement.

### 5.2 Setup Flow

1. Name the site and supply a domain and example story URL.
2. Suggest appropriate story-URL patterns; let users refine the scope.
3. Open the **actual page** with the extension's visual mapping overlay; avoid a fabricated mockup as the primary source of DOM mappings.
4. Prepopulate suggestions from existing extraction heuristics and show exact values.
5. Let users select elements in either order (field-first or element-first).
6. Configure repeated values, field transforms, optional fields, URL identity/deduplication rules, and any relevant site-specific tag terminology.
7. Test on at least one additional example story, highlighting successes, omissions, and conflicting results.
8. Save reusable mapping explicitly; make it available to later imports and refreshes.

Separate **terminology mapping** (`Ships` means Relationships) from **extraction mapping** (where/how to find those relationships on the page). A future visual selector builder can expose advanced technical rules without requiring them in the basic experience.

## 7. AO3-Derived / AO3-Compatible Sites

Some sites reuse AO3's open-source software or markup. Detect compatibility through **deterministic structural checks and representative test imports**, **not an ML model**.

Check independently for:

- AO3-style metadata markup and work identity patterns.
- Explicit Fandom/Relationship/Character/Freeform tag groupings.
- Chapter lists, navigation patterns, and stable chapter identifiers.
- Canonical/synonym relationships, if actually exposed and verifiable.

Label features as detected, verified, partially compatible, or unsupported. Reuse a shared **AO3-compatible extraction adapter** for verified structural features, with site-specific overrides. Never infer that a fork shares AO3's current canonical tag vocabulary or wrangling database simply because it shares code. Store site-specific tag identity/equivalence unless verified otherwise. Users can override incorrect adapter detection.

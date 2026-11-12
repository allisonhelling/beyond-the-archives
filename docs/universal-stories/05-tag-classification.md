# Tag Classification And Optional ML

> **Status:** Accepted product requirements; future implementation. The existing architecture is prepared for multi-site support, but the features described here are not necessarily implemented.
> **Source:** the supplied consolidated specification (workspace planning source). [Index](README.md) · [Implementation plan](IMPLEMENTATION_PLAN.md).

## 6. Tag Extraction, Classification, Review, And Learning

### 6.1 Tag Categories And Raw Preservation

Support Fandoms, Characters, Relationships, Additional Tags, and **Uncategorized/Unknown** when evidence is insufficient. Keep raw source tags and original source-declared categories, even if the user chooses different personal categories. Personal tags remain distinct from source story tags.

Every unknown-site import preview must allow tags to be edited and moved between categories, preferably by **drag-and-drop** and also by an accessible dropdown or equivalent keyboard-friendly control. Users may rename, add, remove, or reclassify tags. A tag correction is different from correcting the element from which a tag was extracted.

### 6.2 Deterministic Categorization (Works With ML Off)

Priority/evidence pipeline:

1. Applicable **explicit user-confirmed classification rules**.
2. **Explicit source-site category** when trustworthy (e.g., a labeled Characters section).
3. Verified **site-specific conventions/adapters**.
4. **Canonical tag evidence**, including known category/verified synonym information where legitimately available.
5. **Structural/text heuristics**, such as AO3-style `/` for romantic/sexual relationships and `&` for platonic relationships, only in contexts where those conventions apply.
6. Optional browser-local ML for unresolved or ambiguous cases.
7. Leave **Unknown** when confidence is insufficient.

These are evidence priorities, not permission to ignore conflicting evidence. User rules override classification *for that user* without rewriting shared canonical metadata. Source-declared category may disagree with a personal rule; show the disagreement in the inspector.

Examples: `A/B` and `A & B` may suggest Relationships on AO3-compatible sites; `Alternate Universe - Modern Setting` may suggest Additional Tags; a known fandom title or character name may be recognized from verified categorized vocabulary. Slashes/ampersands alone are not universal proof. Never require a tag to already exist in the user's own library to classify it.

**Canonical caution:** AO3-verified synonyms/canonical tags should not be extrapolated to unrelated websites or to AO3-derived sites with separate tag databases. Preserve the current application's verified-vs-unverified distinction; do not treat similar-looking tags as confirmed aliases.

### 6.3 Remember Exact Corrections Without Training ML

When a user manually moves a tag to another category, offer **Remember my correction for future imports**. The system stores an exact normalized tag rule, with category, scope, provenance, and timestamps. Future matching tags are classified automatically within that scope even with ML disabled.

Support scopes:

- **This story only** (one-off change; no reusable rule).
- **This site and fandom** (most specific).
- **This fandom across sites**.
- **This site across fandoms** (good default for unfamiliar-site imports).
- **Everywhere** (explicit broad opt-in).

Do not automatically treat a renamed tag as a canonical synonym; a rename can be only a display preference. Removing a tag from one import does not imply a global ban. A correction must not automatically rewrite previously saved stories; offer a separate confirmed bulk-apply operation if needed.

### 6.4 Scope Resolution And Ambiguity

Use the following **accepted default precedence** for exact normalized tag classification: (1) user-confirmed story-only correction; (2) user site+fandom rule; (3) user site-only rule; (4) user fandom-only rule; (5) global user rule; (6) trustworthy source-declared category; (7) verified adapter/canonical evidence where applicable; (8) deterministic structural heuristics; (9) optional local ML; otherwise Unknown. Explicit user rules override source declarations for that user's classification, but original source category and AO3-verified canonical evidence remain intact and inspectable. A user may explicitly raise a fandom rule over a site rule through a **rule-priority override**. Do not silently use last-edited or newest rule as a tie-breaker.

At equal effective priority, or when multiple applicable fandom rules conflict, mark the tag **ambiguous / needs review**, preserve original evidence, and let the user make a story-only decision or add a more specific rule. Classification is derived and reversible, not a destructive rewrite of raw tags. Show the winning rule and any conflicts in Tag Explorer.

### 6.5 Settings: Tags & Classification

Create **Settings → Tags & Classification** with:

- **Tag Explorer:** Search/select a tag and see current category, applicable scope, raw/source category, verified canonical evidence (where available), structural rules, optional ML result/confidence, conflicts, and explanation of the chosen result.
- **My Classification Rules:** Search, inspect, edit, enable/disable, delete, export, or reset user-confirmed rules and their scopes.
- A concise default explanation, e.g. “Classified as Character because of your saved rule,” with expandable **Why this classification?** evidence.
- Clear indication when the source site disagrees with a user override.
- Version/provenance information for automatic classifier decisions where practical.

Expose priority overrides only when needed; do not require every user to manage a numeric global priority table. Make rules understandable and conflicts visible.

## 8. Optional Browser-Local Machine Learning

### 8.1 Product Decision

ML is **optional, off by default**, and should preferably run **in the user's browser**. It is not required for general extraction, site compatibility detection, saved correction learning, or ordinary deterministic tag categorization.

Its principal proposed use is classifying ambiguous/unresolved tags into Fandom, Character, Relationship, Additional Tag, or Unknown, using limited context such as tag text, source site, known fandoms, and source section. It should be allowed to abstain.

### 8.2 Inference Versus Training

- **Normal use: inference only**, on a pretrained, versioned model.
- **Training:** offline during model development and occasional updates, using appropriately licensed/public, verified, manually labeled, or synthetic data.
- **Personal corrections:** apply immediately as private deterministic rules; do **not** retrain the browser model for each correction.
- Future voluntary contributions of corrections to improve a shared model require separate explicit opt-in.

Start by evaluating a small **character n-gram/linear classifier** or similarly lightweight classifier before trying a transformer. Illustrative size bands: simple linear classifier under ~1–10 MB; small neural classifier ~1–20 MB; compact transformer ~15–100 MB; these are estimates, not performance guarantees. A large language model is unnecessary for this task. Run inference in a Web Worker and lazy-load/cache model assets where practical. Package extension executable code in compliance with browser extension policies.

### 8.3 Privacy

A model being self-developed or open source does **not** alone determine privacy; execution location and logging matter.

- Browser-local inference should not transmit tags, reading history, private notes, account identifiers, or story text to an inference provider.
- Do not silently collect training data from personal corrections.
- Keep user rules private by default, and provide clear deletion/export controls.
- If hosted inference is ever added, make it a separate explicit opt-in with transparent disclosure of what leaves the device and retention/logging policies.
- Avoid unnecessary raw URL/tag logging; URLs may include sensitive tokens.

Evaluate whether ML materially reduces **manual corrections per import**, not merely whether benchmark accuracy improves. Track per-category precision/recall, abstention, latency, memory, download size, and cold-start performance. Do not ship ML just because it is possible.

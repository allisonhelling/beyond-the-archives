# Reading Progress, Chapter Counts, And Status

> **Status:** Accepted product requirements; future implementation. The existing architecture is prepared for multi-site support, but the features described here are not necessarily implemented.
> **Source:** the supplied consolidated specification (workspace planning source). [Index](README.md) · [Implementation plan](IMPLEMENTATION_PLAN.md).

## 10. Reading Progress And Chapter Navigation

### 10.1 Universal Basic Tracking

**Every story** supports manually editable published chapter count and current progress, even when the source cannot be parsed or mapped. The maximum published count is **100,000**; positive known totals must be between 1 and 100,000. Offer a **Manually entered chapter count** checkbox in manual count entry and review. Unread stories display **0 / published total**; their **Read Ch. #** action points to **chapter 1**, consistent with current behavior. Unknown totals remain nullable for existing/legacy records and deferred bulk reviews, not zero. Keep reading status independent of the existence of chapter-specific URLs. Planned chapter count and publication status are distinct fields.

**Field-level provenance:** For chapter count and publication status, store value, origin (verified source, automatic extraction/custom mapping, or manual user entry), verification/confidence, last observation/confirmation, and explicit override state. A manually entered value may be accurate; manual provenance is not automatically equivalent to low confidence. Count confidence and publication-status confidence must be separately inspectable.

Chapter-link capabilities progress through levels:

1. **Manual only:** `Read Story` opens the saved imported/story URL; progress is changed in the app.
2. **Saved last/current chapter URL:** `Continue Reading` opens the explicitly saved chapter URL even without a general site mapping.
3. **Mapped chapter URLs:** `Read Ch. N` resolves the requested chapter via verified custom rules.
4. **Full integration:** Site-aware chapter index, stable identities, chapter link resolution, and updates as new chapters appear.

Never label a button `Read Ch. N` if it only opens the story's initial page. Preserve the original imported link and allow users to save their current chapter URL via the extension.

### 10.2 Custom-Site Dynamic Chapter Support

Eventually extend visual mapping to:

- Select a table of contents/chapter list and identify repeated chapter entries.
- Extract chapter title, order, stable identity, and URL.
- Identify next/previous chapter controls on a chapter page.
- Test URL templates only when patterns are demonstrably reliable.
- Support manually saved individual chapter URLs if no index exists.
- Fall back to manual progress when no reliable chapter links can be found.

Stable chapter identity is preferable to chapter number: inserting or reordering chapters should not incorrectly shift a user's reading position. Store and validate chapter identity separately from displayed ordinal where possible.

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

**Accepted completion-evidence rule:** Finishing all known published chapters means **Finished** when publication is confirmed complete by trusted source evidence or explicitly marked complete by the user, or when the user has manually declared it Abandoned or Deleted. This terminal rule applies to every source (user clarification, 13 November 2026); observed unavailability alone is not a manual declaration. Verified or manually supplied *ongoing* publication status yields **Waiting for Updates**; unknown publication status yields **Caught Up / completion unconfirmed** without inventing author completion. Preserve the existing application's seven stored reading statuses; Caught Up can be a derived indicator, not a new persisted status. An explicit user Finished override can coexist with a mismatch flag. For linked crossposts, the one-time completion prompt is needed only when linked versions have differing progress, correspondence/completion is uncertain, and no equivalent prompt has already been dismissed for that version state. Do not ask repeatedly. The exact copy may be refined during UI implementation.

### 10.5 Metadata Confidence And Status Presentation

Keep **reading state**, **publication state**, and **metadata provenance/confidence** independent. Do not create separate Finished/Waiting statuses for manually counted stories. Preserve the current status icon, and add an optional compact **pencil** for manually supplied metadata or **question mark** for unknown/unconfirmed evidence, with explanatory hover/focus text. Do not change the meaning of the Finished icon simply because the count was entered manually. The precise source badge/stripe/spine visual design remains undecided.

Add separate filters for **Reading state** (existing statuses plus derived caught-up conditions where useful) and **Metadata confidence** (**Any**, **Source-verified**, **Automatically extracted**, **Manually supplied**, **Unknown**), with field-aware filtering because chapter count and publication status can have different provenance. Add **Needs Completion Verification** for unknown publication completion. A count alone never proves a work complete. For example: 20/20 with verified complete publication → Finished; 20/20 with manually declared complete publication → Finished; 20/20 with ongoing publication → Waiting for Updates; 20/20 with unknown publication → Caught Up, completion unconfirmed. Do not erase explicit manual completion decisions when later metadata differs; surface review.

### 10.6 Editing Chapter Totals: Status Conflicts, Reductions, And History

Chapter-count edits must never silently invent read chapters, silently reduce read progress, or silently revoke an **explicitly chosen Finished** status. Track whether a status was **automatically derived** or **explicitly chosen** by the user. Apply the same rules in website editors, extension, and bulk review. Preserve reading-history events separately from current numeric progress.

**Increasing the total** (e.g. **20/20 Finished → total 25**): Do not automatically mark chapters 21–25 read. If Finished was explicitly chosen, ask how to proceed with three choices: **Keep 20 chapters read** (default; 20/25 and Reading, or appropriate non-caught-up state), **I've read all 25 chapters** (25/25 and Finished, with explicit user confirmation), or **Keep Finished as a manual override** (20/25 Finished with a visible mismatch indicator). If the status was derived rather than explicitly chosen, recalculation may occur without a prompt while preserving the read count; an automatically caught-up ongoing work may return from Waiting for Updates to Reading when new chapters are recorded. An ordinary Reading work below the total updates its denominator without a prompt. Do not blindly revert previously explicit Finished statuses merely because a source refresh detects new chapters; instead flag new content or request review.

**Decreasing the total without conflicting progress** (e.g. **15/20 → 15/18**): Save without a destructive warning; preserve the read count and existing manual status, subject to ordinary explicitly derived status transitions. If the new total equals progress, use normal publication-aware caught-up/finished rules.

**Decreasing the total below recorded progress** (e.g. **20/20 → 20/15**): Before saving, show a **blocking confirmation/review** that identifies the old total, new total, current chapters read, and how many chapters of *current progress* would be removed. Offer **Review chapter progress before saving** (preferred/default), **Reduce progress to 15/15** (explicitly confirmed, retaining Finished only if justified by publication status or user override), and **Cancel / keep existing count**. No implicit clamping. Review any chapter identities, chapter links, reread pass, and imported chapter records that exceed the new range.

**Historical records:** Reducing current progress does **not** automatically delete chapter-read events or reading history. Preserve out-of-range events as historical/unresolved and flag them for review. If the user explicitly elects to delete invalid historical records, warn separately that this permanently removes recorded chapter-reading history, provide Undo where feasible, and protect against concurrent edits. Distinguish the warning **“Your current reading progress will be reduced”** from **“This will permanently remove recorded chapter-reading history.”** Reread history is retained when totals change. A new total must not reassign chapter identities solely by ordinal.

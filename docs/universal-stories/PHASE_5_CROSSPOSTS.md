# Phase 5 Crossposts And Version-Aware Reading

The connected organizer can link, compare, switch, and unlink saved versions. The original library entry remains the source identity and continues to supply its URL, publication evidence, progress, history, and original organization settings. Linking confirms a separate set of personal settings for the story.

## Identity, Search, And Ownership

- The user selects a preferred display source from the comparison. Possible matches use title and author or outbound links in saved source summaries, with manual lookup by title or URL. Reciprocal links in those summaries are displayed as possible-match evidence. The user confirms a link after reviewing both versions.
- A link requires two owned entries in the same account. Existing groups can add an unlinked version. Two already linked groups require a separate unlink review. Stable group identity is independent of entry IDs.
- The existing library query collapses matched sources into one tile per group and uses the preferred source when it matches the active filters. Navigation counts use the same group identity. Search and collections use shared personal fields on every linked source after reconciliation. Source-specific filters still evaluate source metadata and can select the matching version.
- Unlinking keeps the underlying records. Removing a version follows the usual source removal and Undo semantics. Undo restores the original source independently. Unlinking or removing down to a single version dissolves the group and discards its shared settings. The remaining source resumes its own settings.
- Compare Versions reuses the existing dialog, source metadata, and chapter-link adapters. The review shows original values by version and lets the owner copy them into an editable draft. Adding a version starts with the existing shared settings. An already-linked group without shared settings retains its source settings until the user reconciles it in Compare Versions.

## Reading And Correspondence

- Progress remains independent by default. Chapter groups are bound to a pair of linked sources. They use source-qualified stable chapter IDs from the existing verified chapter indexes and a signature of each index and published count.
- The owner can confirm one-to-one, one-to-many, and many-to-one matches, or record source-exclusive or unknown groups. Confirmation means the owner explicitly compared the content. Titles and ordinal similarity alone never confirm a match. Overlapping groups on a pair are rejected. Changed indexes require re-review.
- A preview shows the proposed target position. An explicit transfer advances only the contiguous unread target prefix supported by complete confirmed source groups. Existing reading events are retained, and the operation supplies no chapter-read events or word counts. Keep Separate preserves source progress.
- Shared completion has its own status. Trusted or manually confirmed publication completion and full current chapter coverage can derive shared Finished. A nonblocking review is available for divergent, caught-up versions with current correspondence evidence. Dismissals are keyed to source progress and publication state. An explicitly chosen shared Finished status survives new source chapters.
- Saved verified chapter IDs are required on both sides for transfer. Generic versions without a saved index can still link, compare metadata, and track progress independently. Link discovery beyond captured summaries and broader chapter-title/index capture remain open. The existing reader and companion continue using their source-specific identities.

## Migration And Rollout

Apply `20261118000100_crosspost_stories.sql`, `20261118000200_crosspost_chapter_groups.sql`, and `20261118000300_crosspost_organization.sql` in order before releasing the organizer UI. Group columns are nullable and require no production-wide backfill. Owner checks, checked edits, and private tables enforce isolation. Checked edits with an organizer organization baseline update the shared fields. Legacy companion and reader writes still use their source contracts.

Linked histories export backup v3. The restore engine remaps source IDs in chapter groups and collection IDs in shared settings. Owner-local group IDs are retained. Old backups remain readable by the updated organizer. Keep the updated restore tool available if rolling the organizer back after v3 backups have been exported. Leave additive database structures in place when rolling back the web client. Hosted rollout and production-scale query timing require separate verification.

## Manual QA

1. Save two sources with different titles, chapter counts, notes, and progress. Find the alternate from **Compare Versions**, review both, choose shared settings, link them, switch to the alternate, and change the preferred source.
2. Confirm the library displays one result for the group. Search for the alternate title, open a shared collection, and edit a shared field from the alternate. Confirm both versions reflect the edit.
3. With two verified chapter indexes, compare a split or merged group. Check that preview leaves the target alone and that an explicit transfer advances only after the whole source group is read.
4. Dismiss a divergent completion review and reopen the details. Change progress or publication evidence and verify the review appears only for the new eligible state.
5. Export and preview a version 3 backup. Unlink or remove a version, and check the remaining source’s progress and history. Verify that an older AO3-only backup still previews.
6. Repeat the comparison on a narrow viewport. Confirm focus stays within the dialog and source navigation opens the intended version.

## Open Items For The Next Review

Open items include author-link capture beyond saved summaries, generic chapter indexes and titles, mixed-version hosted testing, and grouped facet and reading-section counts. Final tile source-indicator design remains open. Review these gaps before marking the Phase 5 acceptance gate complete or starting Phase 6.

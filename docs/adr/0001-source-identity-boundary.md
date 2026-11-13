# ADR 0001: Separate Application And Source Identity

Status: Accepted; the Phase 2 addendum implements private single-source persistence. Multi-version associations remain deferred.

## Context

`works.id` and entry/association FKs already use UUIDs. `works.ao3_work_id` is globally unique bigint; save/restore, jobs, reader, companion and backup paths use AO3-native numbers under several names. Deleted bookmarks may have no native work identity. See inventory I01–I06 and I16–I19 in [source assumptions](../architecture/source-assumptions.md).

## Decision

Retain all existing keys and AO3 runtime behavior. Define future source identity as `(platform, nativeWorkId: string)` separately from work UUID, entry UUID, EPUB hash and bookmark reference. Treat Wayback as AO3 acquisition. Do not merge cross-posts by name. Document contracts without an unused runtime adapter registry, new tables or generated type edits. Defer column-vs-relation storage choice until the first additional provider's verified requirements.

## Consequences

Current AO3 files/clients stay valid. Another provider cannot use existing AO3-number payloads safely. Before admitting it, inventory-backed migrations must preserve FKs and nullable deleted identities, update trusted saves/restores and source-qualified uniqueness, version protocols and test backups/queues/reader/history. No claim of multi-source persistence support follows from these design types.

## Revisit When

A first additional provider is selected for a vertical slice, or an immediately used contract removes demonstrated coupling. Never loosen the frontend URL allowlist ahead of trusted storage support.

## Phase 2 Storage Addendum

The universal manual vertical slice now uses the existing private entry UUID as its single source-version identity, with an owner-private `source_url` candidate and empty work UUID stub. Existing numeric AO3 identities and FKs are retained. Submitted URL, normalized unverified candidate, independently verified canonical URL, private metadata/provenance and reading state remain distinct. Generic sources never enter AO3 alias/hierarchy authority through spelling. Account backups containing them use version 2; current readers retain version 1 support. This resolves the column-versus-relation question only for the current one-source workflow. Crosspost associations and multi-version identity remain Phase 5 work. See [Phase 2 delivery](../universal-stories/PHASE_2_MANUAL_STORIES_PROGRESS.md).

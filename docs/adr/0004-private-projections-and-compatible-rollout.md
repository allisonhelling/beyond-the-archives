# ADR 0004: Reuse Private Projections And Version External Changes Deliberately

Status: Accepted; concrete migrations/protocol extensions deferred.

## Context

Indexed `library_search_documents` feeds private page/count/navigation results and compact series/catalog/facet projections. Revisions and bounded caches already protect queries. Backups, reader associations, pending jobs and AO3 companion messages encode old identity semantics; account restore and administrator restore have different shared-metadata privileges.

## Decision

Reuse the existing document/membership/revision pipeline. Do not add per-row hierarchy fetches, a second cache family or source-specific UI/query architecture. Evidence changes must invalidate every affected owner-effective status and dependent membership/count/series result. Keep forced RLS, caller-derived ownership, service-only shared writes, checked edits and lease fencing. Preserve old serialization readers; version changed meanings and deploy compatible readers before new writers. Record rollback and test gates in the [compatibility matrix](../architecture/source-compatibility.md).

## Consequences

Phase A needs no production abstraction or schema/protocol edit. Future classifier/identity changes require generated projector review, batch/fan-out tests, SQL performance evidence, real service checks and coordinated SQL/Edge/worker/frontend/companion rollout. Old clients must not interpret a new source's number as AO3. Additive rollback cannot discard already-written evidence or identities. No hosted operation is authorized or performed by this ADR.

## Revisit When

A feature adds persisted classification or another source, or measurements show the current projections cannot satisfy a concrete requirement. Reassess from SQL plans and actual fixtures rather than inventing a universal provider framework.

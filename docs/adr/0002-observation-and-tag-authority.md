# ADR 0002: Preserve Observation States And Tag Authority

Status: Accepted (contract); runtime matcher changes deferred to Phase B.

## Context

`AutomaticMetadata` preserves absent fields; effective `Metadata` adds display defaults. Manual overrides and private browser/archive observations differ from shared direct observations. `ao3_tag_resolutions` keys owner/category/name with AO3 authority implicit. `tagAliasIndex` and SQL `library_tag_aliases` differ on missing canonical-root snapshots. Future Any/All/Custom expressions must share current matching semantics across SQL/local/series/collections.

## Decision

Define known, known-empty, unavailable and unknown at the normalization boundary without a speculative database state redesign. Preserve raw source observations, category, method/time, authority and override precedence. An identical provider label confers no AO3 verification; canonical identity and related hierarchy are distinct. Personal tags stay private and separate. The matcher consumes normalized app categories with authority-scoped evidence, never provider HTML. Use one expression contract and shared implementations at each runtime boundary; require parity fixtures across SQL and TypeScript.

## Consequences

No universal tag ontology or new provider ingestion is created. Current empty arrays are not retroactively proof of empty source data. Before the planned matcher merge, define verified-root completeness, legacy URL/preference conversion and cache normalization; test canonical exact aliases versus raw substring behavior and unknown verification failures. Types in [source contracts](../architecture/source-contracts.md) are design notation, not deployed payloads.

## Revisit When

Implementing the planned tag-expression feature or normalizing the first additional source. Persist additional evidence only where a real consumer needs it.

# 09 — Compatibility Contracts, Source Errors, And Cross-Layer Tests

**Status:** Accepted pre-implementation architectural safeguards (12 November 2026). This document specifies desired behavior and test coverage; it does **not** assert that the repository already implements these contracts. Inspect current code, migrations, and deployed protocols before selecting concrete schemas.

**Phase 0 implementation:** The [current baseline](PHASE_0_BASELINE.md) records actual boundaries, schema-1 capability negotiation, known legacy decoders, source-error mappings, the cross-layer fixture manifest, rollout and remaining gaps. The requirements below also cover later features; unchecked future scenarios are not represented as working functionality. Existing retrieval, reader, Safari, SQL and backup envelopes are preserved through narrow adapters rather than replaced with the illustrative envelope below.

**Phase 1 implementation:** The [foundation record](PHASE_1_FOUNDATION.md) defines the used source-identity/provenance adapter and Original Works starter. Work JSON v1 adds an optional `source_version` snapshot with separate `contractVersion:1`; `work`, CSV, account backup v1, RPC/companion/reader envelopes and numeric AO3 IDs remain unchanged. The same Phase 0 SQL fixtures now compare source keys/provenance after restore; additional fixtures exercise namespace collisions, nullable counts, protected manual precedence, populated migration, starter ownership/deletion and older backups. Non-AO3 persistence and manual-count/crosspost workflows are still deferred, not passing fixture claims.

## Purpose And Boundaries

Beyond the Archives has independently deployed components: organizer web app, archives unfolded EPUB reader, Chrome/Edge companion, Safari userscript, Supabase Edge Functions, any still-active worker services, and the database. The architecture is already prepared for future multi-site support. This specification adds **incremental compatibility protections**, not a platform rewrite or a revival of the retired hosted AO3 metadata worker.

Objectives:
1. Make communication contracts explicit, versioned, validated, and negotiated by capability.
2. Normalize source failures without confusing transient unavailability with confirmed deletion.
3. Test that a normalized work retains its meaning across extraction/import, persistence, search, export/restore, and reader association.

## 1. Inventory And Compatibility Matrix

Before editing code, record each live boundary, direction, existing payload shape, authorization mechanism, version signal, and upgrade/rollback path. Include: web ↔ companion/background/content script; Safari userscript ↔ organizer; organizer ↔ Supabase RPC/Edge Functions/database; organizer ↔ EPUB reader and reader association; import/export ↔ restore; background jobs/workers only if currently active. Mark unknowns as **to verify**, not implemented facts.

For each boundary, maintain a matrix of **producer version / consumer version / capability / contract revision / result / fallback**. Cover older companion + newer organizer, newer companion + older organizer, old Safari script, older reader, partially upgraded database/Edge Functions, and restore of an older backup. Use actual supported version windows discovered from code; do not invent minimum versions.

## 2. Versioned Payload Contracts

- Separate **contract schema version** (meaning and structure of a payload) from **component release version** and **feature capability** (whether an operation is supported).
- Define typed, runtime-validated request and response envelopes at the actual trust boundaries. A possible *illustrative* shape, not a mandatory existing API:

```json
{
  "contractVersion": 1,
  "requestId": "opaque-request-id",
  "operation": "extract-metadata",
  "capability": "metadata-retrieval-v1",
  "payload": { "url": "https://example.org/story/123" }
}
```

- Responses should correlate to `requestId`, identify their schema version, and return either a validated result or a structured failure. Do not log raw page contents, authentication tokens, cookies, or private story data in diagnostics.
- Treat a **breaking semantic or structural change** as a new contract revision. Additive optional fields can be tolerated only under a documented compatibility policy; never assume unknown fields mean support for an unknown feature.
- Negotiate capabilities before invoking an operation. Preserve existing `metadata-retrieval-v1` behavior; proposed `generic-site-extraction-v1` and `visual-mapping-v1` are future capabilities until actually implemented.
- Reject unsupported major contract versions or required capabilities with an actionable `CONTRACT_UNSUPPORTED` result. Do not guess how to interpret mismatched payloads.
- Define behavior for absent version fields from legacy components, unknown optional fields, missing required fields, invalid enums, duplicate/stale requests, expired handoffs, and concurrent upgrades. Legacy interpretation must be **explicitly scoped to known legacy payloads**.
- Version persisted interchange formats separately from live messaging contracts when their evolution differs. Define migration/restore paths for supported backup versions.
- Validate identity, origin, authorization, account ownership, and payload shape server-side; capability advertisement is **not** permission to access a site or account.

### Suggested Capability Handshake (Illustrative)

```json
{
  "contractVersion": 1,
  "capabilities": ["metadata-retrieval-v1"],
  "componentVersion": "example-only"
}
```

The receiving side selects an intersection of **recognized and authorized** capabilities. Never auto-enable unrecognized capabilities. Keep capability names stable or introduce a new suffixed version when behavior changes incompatibly.

## 3. Source-Neutral Error Taxonomy

Define a shared error record with: stable `code`, affected `operation`, source identifier when known, `retryable` or retry guidance, safe user-facing recovery action, optional retry-after, optional HTTP/status diagnostic, and **evidence level** for removal claims. Source-specific guidance remains available without leaking private response bodies.

| Code | Meaning | Recovery policy |
| --- | --- | --- |
| `RATE_LIMITED` | Source throttles requests | Honor retry-after/backoff; do not hammer the source |
| `AUTH_REQUIRED` | Login is required | Offer source login or manual entry; never collect credentials |
| `ACCESS_DENIED` | Authenticated but forbidden or private | Explain access restriction; retain existing metadata |
| `NOT_FOUND` | URL/page not found; deletion **unconfirmed** | Verify URL or retry; do not mark permanently deleted |
| `CONTENT_REMOVED` | Reliable source evidence of removal | Explain evidence, preserve saved data, offer review |
| `UNSUPPORTED_SOURCE` | No extraction adapter or compatible mapping | Manual entry or teach mapping |
| `UNSUPPORTED_METADATA` | A particular field cannot be determined | Editable field fallback; keep unknown distinct from zero |
| `EXTRACTION_FAILED` | Parsing/mapping failed | Retry, inspect, or repair mapping |
| `NETWORK_ERROR` | Connection, timeout, or transport failure | Retry when appropriate |
| `CONTRACT_UNSUPPORTED` | Incompatible component/schema/capability | Update/reconnect or manual fallback |

Use a deterministic mapping from source-specific signals to these codes; retain safe source-specific diagnostics separately. HTTP 404, redirects, missing selectors, or an empty result **alone** do not establish `CONTENT_REMOVED`. Distinguish user-cancelled operations from source errors in the UI; add a `CANCELLED` code only if the current implementation needs one. Never overwrite a known work with blank metadata merely because extraction failed. Errors must be handled consistently in extension, manual-entry, single import, bulk review, and background retries.

### Example Failure Envelope (Illustrative)

```json
{
  "contractVersion": 1,
  "requestId": "opaque-request-id",
  "error": {
    "code": "AUTH_REQUIRED",
    "operation": "extract-metadata",
    "retryable": false,
    "recoveryAction": "OPEN_SOURCE_LOGIN"
  }
}
```

Define allowable recovery-action identifiers against existing UI conventions; examples are not requirements to create new global UI infrastructure.

## 4. Cross-Layer Contract Fixture Suite

Store **synthetic or appropriately sanitized** normalized-work fixtures with explicit expected outputs, ownership, and invariants. Use existing test frameworks and fixture locations when available. At minimum cover:

1. AO3 work with existing IDs, source-qualified fandom/tag evidence, series and collections.
2. Original Work with automatic starter collection behavior.
3. Legacy AO3/EPUB entry with unknown chapter count (`null`/unknown, never `0`).
4. New manual story with required published total, checkbox provenance, and 100,000 upper bound.
5. Planned-versus-published chapter totals (e.g., 12/30) and distinct publication status.
6. Unread `0/N`, Read Chapter 1, and reading-status derivation.
7. Explicitly Finished `20/20` edited to `20/25`: user decision required; read count not invented.
8. `20/20` corrected to `20/15`: destructive progress reduction blocked until confirmation; history preserved by default.
9. New chapters observed after manual Finished; no silent revocation of manual status.
10. Two user-linked source versions with independent progress and different chapter groupings; no number-based sync.
11. Private/login-required, rate-limited, network-failed, missing, and **confirmed** removed pages; no false deletion.
12. Old and new companion capability negotiation; unsupported contract; manual fallback.
13. Reader-associated EPUB with existing chapter events and stable association after restore.
14. Account A and account B fixtures for RLS and isolation of mappings, drafts, progress, and crossposts.

### Test Path And Assertions

For each relevant fixture, assert: **input/extraction → normalization → import validation → persistence/readback → search/indexed representation → export → restore → reader association**, as supported by current components. Test at actual layer boundaries, not merely by calling the same normalizer repeatedly. Where a layer cannot run in CI, use an explicit contract-level adapter test and list the missing end-to-end coverage.

Assertions must verify identity stability, source-specific metadata, chapter-count unknowns, status origin, manual override precedence, provenance, tags, progress/history preservation, ownership/RLS, and round-trip fidelity. Allow intentional non-semantic differences (timestamps, ordering) via documented normalization, not by ignoring meaningful fields.

Add negative tests for invalid schema versions, missing required fields, unauthorized source access, mismatched account/request ID, stale responses, unknown capabilities, and invalid error payloads. Prefer deterministic fixtures; no dependence on live AO3 or third-party rate limits in CI.

## 5. Rollout, Observability, And Rollback

- Add validators and telemetry before enforcing stricter contracts where possible; do not collect secrets or page text.
- Deploy additive consumers before producers of new fields/capabilities; verify compatibility matrix for mixed-version states.
- Gate new operations on negotiated capabilities; preserve current AO3/manual fallback.
- Record anonymized failure counts by error code, contract version, and boundary to detect regressions without exposing private work content.
- Document downgrade/rollback behavior, migration reversibility, and what older clients see if they encounter a new capability.
- Avoid production deployment or destructive migration without explicit approval.

## 6. Phase 0 Deliverables And Acceptance Criteria

- [x] Inventory of live component boundaries and **observed** contracts, with uncertainty labeled.
- [x] Versioning/capability policy and mixed-version compatibility matrix.
- [x] Typed, validated contract definitions or narrowly scoped adapter plan consistent with existing code.
- [x] Source-neutral error codes, evidence rules, retry/recovery mapping, and safe diagnostics.
- [x] Fixture manifest, baseline cross-layer tests, and CI command(s) with real results.
- [x] Rollout/rollback strategy, unsupported-version UI behavior, and documented gaps.
- [x] Explicit confirmation that current AO3, Safari, reader, exports, and manual entry remain intact within the local automated baseline. Native Safari and hosted release verification remain open; see the baseline's validation record.

**Exit criteria:** Existing supported flows continue to work; incompatible requests fail safely; unavailability is not mistaken for deletion; baseline normalized-work fixtures preserve their meaning across tested layers. Phase 0 can be implemented incrementally and should not block on future site adapters or undecided ML/source-indicator design.

## Dependencies And Cross-References

- [Architecture](01-story-architecture.md), [Site integrations](02-site-integrations.md), [Extension](03-extension-experience.md), [Imports](04-imports.md), [Reading progress](06-reading-progress.md), [Crossposts](07-crossposts.md), [Security and migration](08-security-and-migration.md).
- [Implementation plan](IMPLEMENTATION_PLAN.md).
- Actual repository source, migration history, tests, `PROJECT_OVERVIEW.md`, and `IMPLEMENTATION.md` remain authoritative for **implemented** behavior.

# Beyond The Archives — Universal Story Tracking

**Status:** Accepted future-feature specification, organized on 12 November 2026. The project's architecture has already been prepared for future multi-site support; that does **not** mean the proposed site integrations, mapping interface, or crosspost features are already implemented. Build on the existing foundations, with a compatibility audit rather than assuming a wholesale refactor is required.

## Purpose

Support stories from any URL with manual tracking, richer site-aware extraction where available, optional visual mappings, deterministic tag classification, and confirmed crosspost linking, while preserving AO3 and archives unfolded behavior.

## Documents

- [Story Architecture and Identity](01-story-architecture.md)
- [Site Integrations and Mapping](02-site-integrations.md)
- [Extension Experience and Handoff](03-extension-experience.md)
- [Universal Story Imports](04-imports.md)
- [Tag Classification and Optional ML](05-tag-classification.md)
- [Reading Progress, Chapter Counts, and Status](06-reading-progress.md)
- [Crossposts and Chapter Correspondence](07-crossposts.md)
- [Security, Provenance, and Migration](08-security-and-migration.md)
- [Compatibility Contracts, Source Errors, and Cross-Layer Tests](09-compatibility-contracts.md) — pre-implementation baseline
- [Implementation plan](IMPLEMENTATION_PLAN.md) — Phase 0 plus six implementation phases, dependencies, tasks, and exit criteria
- The original consolidated reference and Codex prompts remain in the supplied workspace planning folder; the topical specifications here retain their behavioral requirements.

## Git Branches

Use one branch per phase (`phase/00-compatibility-contracts` through `phase/06-hardening-site-support`). See the [implementation plan](IMPLEMENTATION_PLAN.md#git-branch-strategy) for all seven exact branch names and safe branching/merge order.

## Pre-Implementation Safeguards

- Version contract schemas independently of component releases and negotiate recognized capabilities before new operations.
- Normalize source errors and distinguish transient missing pages from evidence-backed removal.
- Use cross-layer fixtures as regression gates for import, persistence, search, export/restore, and reader association.
- Treat proposed wire payload examples as illustrative until checked against the actual repository.

## Settled Decisions

- Published chapter ceiling is **100,000**; provide a checkbox for manually entered chapter totals.
- Unread stories show **0/N** and the next chapter action points to chapter 1.
- Increasing total never silently increases read progress; manually chosen Finished requires an explicit decision when the new total creates a mismatch.
- Decreasing total never silently reduces progress. If new total is below read progress, block save pending explicit review; preserve historical chapter events by default.
- Temporary mapping is the default; saved exact-URL, URL-pattern, and site-wide rules are opt-in, private, validated, versioned, and exportable.
- Site-only tag rules outrank fandom-only rules by default, with explicit priority overrides and ambiguity review.
- Bulk imports can retain unknown chapter counts for nonblocking, resumable review (25/page by default; 10/25/50).
- Extension handoff builds on the existing authenticated desktop companion; manual entry remains the fallback.
- Crossposts require user-confirmed, reversible linking; chapter progress is independent unless correspondence and user intent justify sync.
- Manage site mappings under **Settings → Imports & Connections → Site Mappings** with contextual entry points.
- Keep reading status, publication status, and **field-level metadata provenance/confidence** distinct.

## Open Decisions

- Final source-version indicator (badge, stripe, segmented spine, or combination).
- Optional browser-local ML: model, corpus, evaluation, and whether it materially improves classification.
- Exact engineering schemas, evidence thresholds, protocol payloads, and UI details are implementation decisions, not already approved specifics.

## Existing Vs Planned

The [Phase 0 Baseline](PHASE_0_BASELINE.md) records the implemented compatibility safeguards and actual test coverage. It does not mark the universal story features below as implemented.

The [Phase 1 Foundation](PHASE_1_FOUNDATION.md) adds the typed source/provenance adapter and editable Original Works starter while preserving existing AO3 storage and protocols. Non-AO3 persistence, universal manual entry and crosspost linking remain later-phase features.

The existing application is AO3-focused, uses a Chrome/Edge companion for website-initiated AO3 retrieval, has private reading history and chapter progress, and maintains a separate EPUB reader. The architecture is **prepared** for multi-site work; do not conflate source-qualified AO3 fandom hierarchy with universal story identity. Do not restore retired direct hosted AO3 retrieval.

## Working With These Specs

Each feature file retains the original consolidated specification sections as written, with overlapping crosspost requirements gathered in one additional guide. Check the implementation plan for order, then use the feature file for behavioral detail. The consolidated reference retains acceptance scenarios and resolves any gaps caused by this topical split.

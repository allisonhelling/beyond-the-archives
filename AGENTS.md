# Engineering Standards

- Inspect the architecture, existing implementations, dependencies, styles, and consumers before changing code.
- Reuse first, extend second, and create new functionality only when necessary. Search for an existing solution before adding one.
- Avoid duplicated logic, components, markup, CSS, and parallel implementations. Prefer shared components and small configurable variants when behavior actually overlaps.
- Use the existing styling system, shared classes, and design tokens. Update original rules instead of appending conflicting overrides; preserve responsive, focus, and disabled states.
- Use title case for all authored section and subsection headings, page and dialog titles, control titles, button labels (including pending states), and documentation headings. Apply this consistently to the app and both Chrome/Edge and Safari companions, including shared controls and accessible action names. Preserve explicitly all-caps text, acronyms, intentional brand styling, and user-provided or imported work titles, series names, collection names, and tags. Keep descriptive sentences in sentence case. Update affected tests whenever labels change; do not rely on CSS to mask incorrectly cased source text.
- Make the smallest complete change. Preserve existing behavior, public contracts, design, and architecture. Do not refactor unrelated code or overwrite user changes.
- Avoid speculative abstractions, unnecessary wrappers, and new dependencies when existing solutions suffice.
- Migrate all relevant consumers and confirm shared components and styles are used before removing redundant code.
- Review the final diff for duplication and regressions. Run relevant tests, lint, type checks, and builds; report only validation actually performed and disclose any remaining risks.

## Documentation Responsibilities

- Keep `README.md` focused on people running or using the application: prerequisites, all local run instructions, major features, important usage limits, troubleshooting needed to run locally, and the project layout. Exclude implementation history, SQL/RPC details, internal design decisions, deployment procedures, and validation logs.
- Maintain `docs/IMPLEMENTATION.md` for implementation and operations: architecture conventions, technical feature behavior, migration/deployment dependencies, hosted setup, verification commands, and implementation decisions. Link to existing focused guides such as backups, DNF cleanup, performance, and companion installation instead of duplicating them.
- Maintain `docs/PROJECT_OVERVIEW.md` as the current detailed project specification: high-level purpose and workflows, supported scope, exact behavioral/data contracts, architecture, important limits, and source references. Distinguish implemented functionality from placeholders and plans.
- For each feature or behavior change, review all three documents and update every affected description in the same change. Update companion or focused guides when their instructions change. Keep commands, limits, labels, defaults, and migration requirements consistent with the code; remove superseded claims rather than appending contradictory notes.
- Keep one authoritative location for detailed procedures and specifications, using relative links elsewhere. Preserve useful implementation information when moving it out of the README. Historical phase reports describe their original scope and must not be presented as proof of current deployment or verification.

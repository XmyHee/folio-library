# Folio maintenance plan

Date: 2026-10-13
Status: maintenance roadmap; completed changes require the separate validation/release record.
Scope: existing local-first EPUB/PDF workflows and automatic MD-to-PDF intake; no additional product features or backend.

## Current evidence

- App composes hooks, feature commands and presentation components; it still contains substantial workspace UI and command-port wiring.
- The library renders at most 40 books or 40 complete duplicate groups per page. Filtering, deduplication and export planning still process full relevant collections.
- State ownership is documented in architecture.md; useLibraryState owns persistence, useTaskState owns shared task exclusion. Multiple hooks do not by themselves imply duplicate persisted state.
- Automated verification already covers pipeline, metadata, cover embedding, persistence, commands, React hook lifecycles, Markdown PDFs and ZIP bytes. Browser file pickers/downloads require separate checks.

## Maintenance sequence

1. Correct current reliability defects before structural changes: permanent clear, atomic deletion/failure preservation, obsolete undo cleanup, preview/draft release, bounded large-file work, export memory protection and render-error fallback. Keep disk originals and templates/preferences intact.
2. Reduce App's remaining presentation composition through cohesive Import/Library/Export/Detail containers. Preserve the existing state owners, task lock and public command APIs. Introduce scoped Context only where it demonstrably removes repeated wiring; do not create a second store or rewrite persistence merely to reduce props. Store migration requires its own behavior comparison and rollback plan.
3. Profile the current full-library pipeline and repeated import/export with realistic sizes. Move proven CPU-heavy pure operations to a worker with versioned inputs and stale-result protection. Do not add virtualization for an already bounded 40-row list unless rendering measurements show a need; duplicate groups can still be unusually large and merit measurement.
4. Verify narrow layouts, touch targets, accessible names, focus return and keyboard review. Choose a sheet only if it improves the existing detail flow without hiding editing actions. Keep durable failures near affected files/tasks; transient messages must not replace readable error records.
5. Retain behavioral tests and add focused real-browser acceptance for repeat imports, automatic MD conversion, partial failures, storage reload, clear confirmation, cover embedding and ZIP download. A new test framework is optional tooling, not a missing requirement or a prerequisite to maintenance.

## Release gates

- Type check, relevant regression suites and production build pass; no source-location assertions.
- Clear succeeds only after the database transaction commits; a failed deletion preserves active records. Reload does not revive cleared files; a later import contains only its new records.
- Oversized workloads fail with actionable messages before full allocation wherever possible. A webpage cannot guarantee survival of browser/OS process termination or every malformed document.
- Browser checks and remaining automation limitations are reported separately from unit/integration results.
- Deploy only the validated, scoped changes and verify the resulting live resources. Preserve historical validation reports.

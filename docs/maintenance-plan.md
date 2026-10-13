# Folio maintenance plan

Date: 2026-10-13
Status: maintenance roadmap; completed changes require the separate validation/release record.
Scope: existing local-first EPUB/PDF workflows and automatic MD-to-PDF intake; no additional product features or backend.

## Current evidence

- App mounts the store and lifecycle adapters, derives current scopes and connects Import/Rules/Library/Export/Detail containers. Command-port wiring now lives in commands/workbench and useFeatureCommands.
- The library renders at most 40 books or 40 complete duplicate groups per page. Filtering, deduplication and export planning still process full relevant collections.
- State ownership is documented in architecture.md. Shared state now lives in one per-workbench Zustand instance; useLibraryState remains the sole persistence adapter and task lifecycle uses the same store-scoped exclusion/cancellation resources.
- Automated verification already covers pipeline, metadata, cover embedding, persistence, commands, React hook lifecycles, Markdown PDFs and ZIP bytes. Browser file pickers/downloads require separate checks.

## Maintenance sequence

1. Correct current reliability defects before structural changes: permanent clear, atomic deletion/failure preservation, obsolete undo cleanup, preview/draft release, bounded large-file work, export memory protection and render-error fallback. Keep disk originals and templates/preferences intact.
2. Maintain the cohesive containers and unified Zustand store introduced at the user's request. Preserve the task lock, persistence lifecycle and public command behavior; do not add a second store or rewrite persistence merely to reduce props. The migration comparison and rollback boundary are recorded below.
3. Profile the current full-library pipeline and repeated import/export with realistic sizes. Move proven CPU-heavy pure operations to a worker with versioned inputs and stale-result protection. Do not add virtualization for an already bounded 40-row list unless rendering measurements show a need; duplicate groups can still be unusually large and merit measurement.
4. Verify narrow layouts, touch targets, accessible names, focus return and keyboard review. Choose a sheet only if it improves the existing detail flow without hiding editing actions. Keep durable failures near affected files/tasks; transient messages must not replace readable error records.
5. Retain behavioral tests and add focused real-browser acceptance for repeat imports, automatic MD conversion, partial failures, storage reload, clear confirmation, cover embedding and ZIP download. A new test framework is optional tooling, not a missing requirement or a prerequisite to maintenance.

## Zustand migration comparison and rollback

The migration moves shared state from separate useState owners into one provider-scoped vanilla store. Files/Blobs stay in existing IndexedDB storage, pipeline results remain derived, and viewport/drag/theme display state stays local. Narrow subscriptions isolate progress consumers. Context subscriptions live outside the Provider component's hot-refresh boundary.

| Behavior retained | Regression evidence |
| --- | --- |
| Later imports append without dropping reviewed records | check-store.cjs STORE-01 and existing append tests |
| Cancellation retains the shared lock until the operation settles | STORE-02 plus feature-command cancellation tests |
| Pending/failed restoration authorizes no writes or import | STORE-03 plus persistence lifecycle tests |
| Failed clear preserves the library, receipt, selection, drafts and active preview URLs | STORE-04 plus atomic storage/deletion tests |
| CSV/export use the latest filter and checked scope; failed ZIP retains its earlier receipt | Store composition tests and export/package tests |

Rollback proposal: if release acceptance exposes a regression, revert this migration commit and redeploy the last pre-migration revision `04a6071858fe30a4642e61e27ea2243ba85b8a97`. Do not clear browser storage or downgrade the database. Both revisions use database v2 and LibrarySnapshot v1; this migration introduces no persistence schema change. Preserve current exports and report any unverified rollback condition rather than treating a code revert as a data restoration. Rollback has not been executed.

## Release gates

- Type check, relevant regression suites and production build pass; no source-location assertions.
- Clear succeeds only after the database transaction commits; a failed deletion preserves active records. Reload does not revive cleared files; a later import contains only its new records.
- Oversized workloads fail with actionable messages before full allocation wherever possible. A webpage cannot guarantee survival of browser/OS process termination or every malformed document.
- Browser checks and remaining automation limitations are reported separately from unit/integration results.
- Deploy only the validated, scoped changes and verify the resulting live resources. Preserve historical validation reports.

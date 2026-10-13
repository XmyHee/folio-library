# Folio module ownership

Status: implementation notes for the second refactoring stage. These notes describe current ownership; they do not change file formats or metadata-resolution rules.

## Dependency direction

`App → components / hooks / commands → lib`

- `components/`: render props and emit user actions. Do not open IndexedDB, parse books, or own a second library copy.
- `hooks/`: own React state and resource lifetimes. Hooks do not import App or presentation components.
- `lib/`: parsing, metadata resolution, naming, deduplication, storage, export and pure selectors. Library modules do not import hooks or components.
- `commands/`: application actions grouped into import, catalog, library, metadata, covers and export. Each factory accepts an explicit typed context getter and injectable services. Context is read when an action starts; asynchronous work keeps that invocation's inputs. Shared task refs remain owned by useTaskState. Hook imports here are type-only and do not invoke hooks or introduce runtime React dependencies.
- `App.tsx`: composes hooks, components and feature commands; retains workspace display state and preview selectors. Business command bodies live in commands, not App.

## State and resource owners

| Module | Owns | Rules for callers |
| --- | --- | --- |
| `useLibraryState` | Source books, persisted settings, export receipt, restore gate, save queue and template debounce | Change books/settings through returned setters. Never save a second snapshot from another hook. Wait for restoration before edits. |
| `useBookDetails` | Selected/pending IDs, tab-local drafts, dirty navigation and unload guard | Read the selected record from the current derived library. Drafts do not change export data until a book command applies them. The updater ref is a compatibility bridge for existing commands, not a second persisted book record. |
| `useTaskState` | Task flags, progress, shared operation lock, abort controller, batch-cover cancellation and CSV cooldown | Command handlers acquire the shared lock before work and release it in `finally`. Cancellation requests do not unlock an unfinished operation. Do not create a parallel controller in a feature hook. |
| `useLibraryView` | Search, filters, checked IDs, batch scope, view and pagination | Use the returned scope for actions. Do not independently reconstruct filtered or selected book sets in components. Derived lists are never persisted. |
| `useFileIntake` | Picker refs, window drag listeners and overlay | The current import callback is used after directory reads. Do not add a second global drop listener. Disposal prevents a late directory read from starting an import. |
| `lib/book-assets` | Shared preview URL release function | Release obsolete preview URLs only; preserve original File/Blob content. Permanent clear releases active preview URLs only after the deletion transaction commits. |
| `lib/storage` | IndexedDB schema, migration, atomic metadata/blob writes and stale-tab detection | Database v2 and LibrarySnapshot v1 are unchanged. Failure must remain visible; a failed restore must not authorize overwriting stored data. |

The source books are the persistent truth. `runPipeline` derives display books and proposed names. Selection stores identity; it must not retain a stale `DerivedBook` as another source of truth. View state is transient, and detail drafts are scoped to the browser tab.

## Verification and remaining work

- `check-phase-two.cjs` exercises the public hook APIs with React Testing Library and jsdom. It covers restoration gating/failure, serialized writes/retry, template debounce, abandoned-load URL cleanup, permanent-clear queue and failure, drafts/navigation/unload cleanup, StrictMode, task cancellation, selection/pagination and late drop callbacks.
- Existing metadata, cover, append, review, storage and export assertions remain in the suite. The views test already calls the exported selector.
- Four legacy action tests (append, manual metadata, re-identification and phase-one permanent clear) now call exported command factories. Clear tests follow the updated permanent-deletion requirement; other behavior assertions are retained; none reads App source or evaluates extracted functions.
- `check-feature-commands.cjs` covers cross-feature import/export exclusion, cancellation without early unlock, partial imports, failed-export receipt preservation, export blockers, CSV readiness/cooldown, latest catalog scope, catalog merging and review/cover guards. The CSV command also enforces the existing disabled-button conditions when invoked directly.
- The batch cancellation test now calls `createBookBatchParser` in `lib/book-batch`, with the same bounded-concurrency and partial-result assertions. `parse.ts` composes this public parser with the real format parser and cover services.
- PDF preview ordering/size checks now exercise `readPdfFrontMatter`, including a 100 MiB record, metadata failure with retained preview, and preview failure with retained metadata. Tests no longer inspect parser source positions.
- jsdom checks DOM and React behavior, not browser layout, real file-picker permissions, canvas rendering or download completion. Those require separate browser checks.
- Markdown conversion enters the existing import command before the PDF workflow. Preserve a single task lock, metadata/source provenance and current export boundaries.

## Adding a feature

1. Put file-format and transformation logic in `lib`, with explicit input/output types and observable failures.
2. Let a feature command coordinate that logic with the existing shared task owner and source book state.
3. Add only necessary controls to existing components. Keep UI-only state out of persistence.
4. Test behavior through exported APIs. Do not introduce new tests that depend on App source positions or function text.

## Markdown import

The existing import command passes Markdown files through lib/import-batch before normal PDF workflows. lib/markdown separates settings, YAML/CSS parsing, selected image assets, PDF node construction, pagination, worker rendering and import/reconversion. The worker owns CPU layout and is terminated on cancellation. Fresh layout passes avoid mutation of repeated table headers when preventing orphan headings. Source Markdown and selected assets are retained in the existing assets store and exported under Originals; source identity is independent of generated PDF bytes. commands/markdown preserves manual metadata, review and chosen covers on reconversion. The UI exposes only automatic intake; print controls and the reconversion action have been removed. Imports use default settings plus explicit document YAML, without legacy browser preferences.

## Stability maintenance (2026-10-13)

Clear is serialized through useLibraryState: wait for earlier saves, commit an empty library and delete assets atomically, then reset React state and release preview URLs. The command holds the shared operation lock until completion. Failed deletion leaves the active books and drafts available. Legacy undo-only records are discarded during load after active-record validation. No undo state or timeout remains. Settings and note templates are retained.

Exports reuse the source buffer for cover embedding and unchanged hashes. Preflight counts package copies (including retained Markdown/images); a 256 MiB content limit also applies to prepared output before committing entries to the ZIP. Large-book batches parse serially. The limits reduce memory pressure; they are not a device-independent crash guarantee. check-stability.cjs covers the resource boundaries without allocating oversized fixtures.

AppErrorBoundary wraps the composed application. React render failures show a reload action without deleting browser storage; worker failures and browser/OS process crashes are outside this boundary.

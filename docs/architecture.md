# Folio module ownership

Status: implementation notes, updated for the incremental Zustand migration (2026-10-13). These notes describe current ownership; they do not change file formats or metadata-resolution rules.

## Dependency direction

`App → containers → components`, `containers / hooks → state`, and `hooks → commands → lib`.

- `state/`: one Zustand vanilla store per mounted workbench, supplied by FolioStoreProvider. Library, task, view, detail and workspace fields share that instance. Typed setters support functional updates against current state. Selectors cache derived pipelines/scopes; derived books are not written back into the source library.
- `containers/`: compose intake/task feedback, rules, browsing, export and detail presentation. Subscribe to needed shared fields through shallow selectors. Props carry derived scopes and command/lifecycle callbacks, not a second store, task lock or persistence copy.
- `components/`: render props and emit user actions. Do not open IndexedDB, parse books, or own a second library copy.
- `hooks/`: adapt the shared store to resource lifetimes: restoration, serialized saves, template debounce, cancellation cleanup, draft/session protection and view effects. Local viewport, drag and theme state remain local. Hooks do not import App or presentation components.
- `lib/`: parsing, metadata resolution, naming, deduplication, storage, export and pure selectors. Library modules do not import hooks or components.
- `commands/`: actions grouped into import, catalog, library, metadata, covers and export. `createWorkbenchCommands` composes these factories with the canonical store and injectable services. Context, filters, checked scope and export plan are read when an action starts; asynchronous work keeps that invocation's inputs. Shared task refs belong to the store's runtime resource object. Hook imports here are type-only and do not invoke hooks or introduce runtime React dependencies.
- `App.tsx`: mounts the provider and lifecycle adapters, derives the source pipeline and current browsing scope, and connects containers. Export preview composition lives in ExportContainer; command dependency composition lives in useFeatureCommands / commands/workbench.

## State and resource owners

| Module | Owns | Rules for callers |
| --- | --- | --- |
| `state/folio-store` | Canonical books/settings, task flags/progress, search/filters/selection, detail fields/ID, export UI; per-instance runtime resources | A new provider gets a fresh instance. No singleton, localStorage persist middleware, duplicate library or database schema change. Files, Maps, Sets, promises and controllers must not be JSON-serialized. |
| `useLibraryState` | Restore/save/delete lifecycle, using the store's restore gate, save queue and debounce state | The only persistence adapter. Publish restoration atomically. Wait for restoration before edits. Never save a second snapshot from another hook. |
| `useBookDetails` | Draft/session lifecycle, dirty navigation and unload guard, using store IDs/fields/resources | Resolve selected ID from the current derived library. Drafts do not change export data until applied. The updater ref is a compatibility bridge, not another persisted book. |
| `useTaskLifecycle` / `useTaskState` | Cancellation cleanup and CSV cooldown; read task state and runtime resources from the shared store | Mount lifecycle once at the root. Command handlers acquire the shared lock before work and release it in `finally`. Cancellation requests do not unlock unfinished operations. ImportContainer subscribes to progress directly. |
| `useLibraryView` / `state/selectors` | Derive scopes from canonical source/view inputs; reset pagination and prune obsolete checked IDs | UI and commands use the same deriveLibraryView function. Commands read latest scopes at invocation. Progress/draft changes do not invalidate pipeline caches. Derived lists are never persisted. |
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
- `check-store.cjs` uses the real Zustand instance, lifecycle hooks and createWorkbenchCommands. STORE-01 checks consecutive imports; STORE-02 holds the cross-feature lock until cancelled parsing settles; STORE-03 verifies pending/failed restoration writes nothing; STORE-04 verifies failed clear retains books, receipt, checked IDs, drafts and active URLs, then permits a successful retry. Additional assertions cover provider isolation, latest CSV/export scopes, failed-export receipts and 100 progress updates with zero extra library-only subscriber renders.
- Markdown conversion enters the existing import command before the PDF workflow. Preserve a single task lock, metadata/source provenance and current export boundaries.

## Adding a feature

1. Put file-format and transformation logic in `lib`, with explicit input/output types and observable failures.
2. Let a feature command coordinate that logic with the existing shared task owner and source book state.
3. Add only necessary controls to existing components. Keep UI-only state out of persistence.
4. Test behavior through exported APIs. Do not introduce new tests that depend on App source positions or function text.
5. Put shared state in the existing store with narrow subscriptions; keep local display state local. Use command ports for I/O. Do not mount a second persistence/task lifecycle in a container.

## Markdown import

The existing import command passes Markdown files through lib/import-batch before normal PDF workflows. lib/markdown separates settings, YAML/CSS parsing, selected image assets, PDF node construction, pagination, worker rendering and import/reconversion. The worker owns CPU layout and is terminated on cancellation. Fresh layout passes avoid mutation of repeated table headers when preventing orphan headings. Source Markdown and selected assets are retained in the existing assets store and exported under Originals; source identity is independent of generated PDF bytes. commands/markdown preserves manual metadata, review and chosen covers on reconversion. The UI exposes only automatic intake; print controls and the reconversion action have been removed. Imports use default settings plus explicit document YAML, without legacy browser preferences.

## Stability maintenance (2026-10-13)

Clear is serialized through useLibraryState: wait for earlier saves, commit an empty library and delete assets atomically, then reset React state and release preview URLs. The command holds the shared operation lock until completion. Failed deletion leaves the active books and drafts available. Legacy undo-only records are discarded during load after active-record validation. No undo state or timeout remains. Settings and note templates are retained.

Exports reuse the source buffer for cover embedding and unchanged hashes. Preflight counts package copies (including retained Markdown/images); a 256 MiB content limit also applies to prepared output before committing entries to the ZIP. Large-book batches parse serially. The limits reduce memory pressure; they are not a device-independent crash guarantee. check-stability.cjs covers the resource boundaries without allocating oversized fixtures.

AppErrorBoundary wraps the composed application. React render failures show a reload action without deleting browser storage; worker failures and browser/OS process crashes are outside this boundary.

## Incremental containers and task feedback (2026-10-13)

ImportContainer composes ImportArea with TaskProgress in the existing sticky top bar. RulesContainer owns rules/action presentation; LibraryContainer owns filtering, batch scope, pagination, cover-review presentation and results. The subsequent store migration adds ExportContainer and DetailContainer. App composes lifecycle adapters and containers; shared state comes from Zustand rather than independent useState copies.

TaskProgress reads the existing task flags and callbacks. File preparation reports completed files, ZIP generation reports its own percentage, and unknown-duration work keeps an animated activity overlay. Import file counts are not time estimates. Markdown emits read/layout/render/generated-PDF-read stages through the batch callback. Online lookup does not reuse a completed import percentage. Feedback disappears on the existing finally cleanup, including failure or cancellation. Reduced-motion users receive static activity feedback and text. No timers simulate progress.

The sticky bar contains CSV, export review and task feedback. File/folder intake remains in the central explanatory panel. ImportArea receives existing export callbacks; RulesContainer retains rules and explicit clear access. ExportReviewPanel focuses and scrolls its heading on mount, so a top-bar action reaches the actual review rather than merely revealing a distant panel. Hidden picker inputs remain mounted when the library is empty or populated.

Home copy follows observed behavior: online-source statistics include both Google Books and Open Library; naming and duplicate counts describe proposals rather than filesystem changes. Duplicate-group actions say “设为保留”, matching their existing override callback. Empty intake uses the original large dashed frame, populated intake stays compact. Export template details are collapsed by default. Parsing failure notices cover Markdown conversion and format failures as well as metadata errors.

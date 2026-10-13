import { createExportCommands } from "./export";
import { createCoversCommands } from "./covers";
import { createMetadataCommands } from "./metadata";
import { createLibraryCommands } from "./library";
import { createCatalogCommands } from "./catalog";
import { createImportCommands } from "./import";
import { createFolioSelectors } from "../state/selectors";
import { createExportPlan } from "../lib/export-plan";
import { savedDetailDraft } from "../lib/detail-draft";
import type { FolioStore } from "../state/folio-store";
import type { useLibraryState } from "../hooks/useLibraryState";
import type { useBookDetails } from "../hooks/useBookDetails";

export interface WorkbenchPorts {
  clearLibrary: ReturnType<typeof useLibraryState>["clearLibrary"];
  details: Pick<ReturnType<typeof useBookDetails>, "setSelected" | "clearDetailDrafts" | "persistDraft">;
}
export interface WorkbenchServices {
  parseEpubBatch: typeof import("../lib/parse").parseEpubBatch;
  parseBook: typeof import("../lib/parse").parseBook;
  lookupIsbnBatch: typeof import("../lib/openlibrary").lookupIsbnBatch;
  primaryIsbn: typeof import("../lib/normalize").primaryIsbn;
  runPipeline: typeof import("../lib/pipeline").runPipeline;
  reviewKey: typeof import("../lib/review").reviewKey;
  refreshTitleCover: typeof import("../lib/document-cover").refreshTitleCover;
  titleCoverForBook: typeof import("../lib/document-cover").titleCoverForBook;
  coverColors: typeof import("../lib/document-cover").coverColors;
  generateCoverBatch: typeof import("../lib/cover-workflow").generateCoverBatch;
  downloadCsv: typeof import("../lib/export").downloadCsv;
  downloadLibraryZip: typeof import("../lib/export").downloadLibraryZip;
  URL: typeof URL;
}

/** Shared, testable composition boundary. Read canonical values/scopes at invocation.
 * Factories retain their existing lock, cancellation and failure semantics.
 */
export function createWorkbenchCommands(store: FolioStore, getPorts: () => WorkbenchPorts, services: WorkbenchServices) {
  const selectors = createFolioSelectors();
  function context() {
    const state = store.getState(), ports = getPorts(), view = selectors.view(state);
    const failedIds = new Set(state.exportReport?.records.filter(record => record.status === "failed").map(record => record.id));
    const exportBooks = state.exportScope === "selected" ? view.selectedBooks : state.exportScope === "filtered" ? view.viewBooks
      : state.exportScope === "failed" ? selectors.pipeline(state).books.filter(book => failedIds.has(book.id)) : selectors.pipeline(state).books;
    const currentDraft = { title: state.metadataTitleDraft, authors: state.metadataAuthorsDraft, coverTitle: state.coverTitleDraft, coverAuthor: state.coverAuthorDraft };
    const selected = selectors.pipeline(state).books.find(book => book.id === state.selectedId);
    const metadataDirty = !!selected && (currentDraft.title !== savedDetailDraft(selected).title || currentDraft.authors !== savedDetailDraft(selected).authors);
    return {
      ...state, ...state.runtime, ...view, ...services, clearLibrary: ports.clearLibrary,
      setSelected: ports.details.setSelected, clearDetailDrafts: ports.details.clearDetailDrafts,
      persistDraft: ports.details.persistDraft, currentDraft, metadataDirty, savedDetailDraft,
      exportBooks,
      get exportPlan() { return createExportPlan(exportBooks, state); },
    };
  }
  return {
    ...createImportCommands(context), ...createCatalogCommands(context), ...createLibraryCommands(context),
    ...createMetadataCommands(context), ...createCoversCommands(context), ...createExportCommands(context),
  };
}

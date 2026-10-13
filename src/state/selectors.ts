import { runPipeline } from "../lib/pipeline";
import { matchesCoverFilter, needsCoverGeneration } from "../lib/cover-workflow";
import { isReviewed, needsReview, reviewReasons } from "../lib/review";
import { currentViewBooks, viewSummary } from "../lib/view-scope";
import type { PipelineResult } from "../lib/types";
import type { FolioState, ViewState } from "./folio-store";

export function deriveLibraryView(pipeline: PipelineResult, state: ViewState) {
  const { query, coverFilter, informationFilter, reviewFilter, tab, checkedIds, batchScope, page } = state;
  const q = query.trim().toLowerCase();
  const filtered = pipeline.books.filter(book => matchesCoverFilter(book, coverFilter)
    && (informationFilter === "all" || (informationFilter === "issues" ? reviewReasons(book).length > 0 : reviewReasons(book).length === 0))
    && (reviewFilter === "all" || (reviewFilter === "pending" ? needsReview(book) : isReviewed(book)))
    && (!q || [book.rawTitle, book.originalName, book.proposedName, book.displayAuthor, book.publisher].join(" ").toLowerCase().includes(q)));
  const { renameBooks, duplicateBooks, visibleGroups } = viewSummary(filtered, pipeline.books, pipeline.groups);
  const viewBooks = currentViewBooks(filtered, pipeline.books, pipeline.groups, tab);
  const selectedBooks = pipeline.books.filter(book => checkedIds.has(book.id));
  const batchBooks = batchScope === "selected" ? selectedBooks : viewBooks;
  const coverCandidates = batchBooks.filter(needsCoverGeneration);
  const pageSize = 40;
  const pageCount = Math.max(1, Math.ceil((tab === "dedupe" ? visibleGroups.length : viewBooks.length) / pageSize));
  const currentPage = Math.min(page, pageCount);
  return { pageSize, filtered, renameBooks, duplicateBooks, visibleGroups, viewBooks, selectedBooks,
    batchBooks, coverCandidates, pageCount, currentPage,
    pageBooks: viewBooks.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    pageGroups: visibleGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize) };
}

/** Per-workbench memoization. Progress/draft updates never rebuild the library pipeline. */
export function createFolioSelectors() {
  let pipelineInputs: unknown[] = [];
  let pipeline: PipelineResult;
  let viewInputs: unknown[] = [];
  let view: ReturnType<typeof deriveLibraryView>;
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  function selectPipeline(state: FolioState) {
    const inputs = [state.books, state.namingMode, state.keepOverrides, state.useOnlineMeta, state.olByIsbn];
    if (!same(inputs, pipelineInputs)) {
      pipeline = runPipeline(state.books, state.namingMode, state.keepOverrides, { online: state.useOnlineMeta, olByIsbn: state.olByIsbn });
      pipelineInputs = inputs;
    }
    return pipeline;
  }
  function selectView(state: FolioState) {
    const p = selectPipeline(state);
    const inputs = [p, state.query, state.coverFilter, state.informationFilter, state.reviewFilter, state.tab, state.checkedIds, state.batchScope, state.page];
    if (!same(inputs, viewInputs)) { view = deriveLibraryView(p, state); viewInputs = inputs; }
    return view;
  }
  return { pipeline: selectPipeline, view: selectView };
}

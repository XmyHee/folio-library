import { useMemo } from "react";
import { useFolioSelector } from "../state/folio-context";
import { ExportReviewPanel } from "../components/ExportReviewPanel";
import { ExportResultPanel } from "../components/ExportResultPanel";
import { createExportPlan } from "../lib/export-plan";
import { renderBookNote } from "../lib/notes";
import type { PipelineResult, DerivedBook } from "../lib/types";

interface Props {
  pipeline: PipelineResult; viewBooks: DerivedBook[]; selectedBooks: DerivedBook[];
  onExport: () => void;
}
export function ExportContainer({pipeline, viewBooks, selectedBooks, onExport}: Props) {
  const state = useFolioSelector(s => ({
    showExportReview: s.showExportReview, setShowExportReview: s.setShowExportReview,
    exportScope: s.exportScope, setExportScope: s.setExportScope,
    excludePending: s.excludePending, setExcludePending: s.setExcludePending,
    exporting: s.exporting, busy: s.busy, storageReady: s.storageReady,
    includeDuplicates: s.includeDuplicates, setIncludeDuplicates: s.setIncludeDuplicates,
    includeNotes: s.includeNotes, setIncludeNotes: s.setIncludeNotes,
    noteTemplate: s.noteTemplate, setNoteTemplate: s.setNoteTemplate,
    exportReport: s.exportReport, notePreviewId: s.notePreviewId, setNotePreviewId: s.setNotePreviewId,
    setError: s.setError,
  }));
  const { exportReport, exportScope, excludePending, includeDuplicates, includeNotes, noteTemplate, notePreviewId } = state;
  const failedIds = useMemo(() => new Set(exportReport?.records.filter(record => record.status === "failed").map(record => record.id)), [exportReport]);
  const exportBooks = useMemo(() => exportScope === "selected" ? selectedBooks : exportScope === "filtered" ? viewBooks
    : exportScope === "failed" ? pipeline.books.filter(book => failedIds.has(book.id)) : pipeline.books,
  [exportScope, selectedBooks, viewBooks, pipeline, failedIds]);
  const exportPlan = useMemo(() => createExportPlan(exportBooks, { includeDuplicates, includeNotes, noteTemplate, excludePending }),
    [exportBooks, includeDuplicates, includeNotes, noteTemplate, excludePending]);
  const previewEntry = exportPlan.entries.find(entry => entry.book.id === notePreviewId && entry.notePath) || exportPlan.entries.find(entry => entry.notePath);
  let notePreview = "没有符合当前范围的笔记。";
  if (previewEntry?.path) {
    try { notePreview = renderBookNote(previewEntry.book, noteTemplate, previewEntry.path, previewEntry.notePath); }
    catch (error) { notePreview = String(error); }
  }
  return <>
    {state.showExportReview ? <ExportReviewPanel {...state} exportPlan={exportPlan} previewEntry={previewEntry}
      selectedCount={selectedBooks.length} hasFailures={!!failedIds.size} notePreview={notePreview}
      onExport={onExport} onClose={() => state.setShowExportReview(false)} /> : null}
    {exportReport ? <ExportResultPanel exportReport={exportReport} exporting={state.exporting} busy={state.busy}
      onRetry={() => { state.setExportScope("failed"); state.setExcludePending(false); state.setShowExportReview(true); }} /> : null}
  </>;
}

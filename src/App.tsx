import { createExportCommands } from "./commands/export";
import { createCoversCommands } from "./commands/covers";
import { createMetadataCommands } from "./commands/metadata";
import { createLibraryCommands } from "./commands/library";
import { createCatalogCommands } from "./commands/catalog";
import { createImportCommands } from "./commands/import";
import { useLibraryView } from "./hooks/useLibraryView";
import { useFileIntake } from "./hooks/useFileIntake";
import { useLibraryState } from "./hooks/useLibraryState";
import { useBookDetails } from "./hooks/useBookDetails";
import { useTaskState } from "./hooks/useTaskState";
import { LibraryContainer } from "./containers/LibraryContainer";
import { RulesContainer } from "./containers/RulesContainer";
import { BookDetailsPanel } from "./components/BookDetailsPanel";
import { ImportContainer } from "./containers/ImportContainer";
import { LibraryStats } from "./components/LibraryStats";
import { ExportReviewPanel } from "./components/ExportReviewPanel";
import { ExportResultPanel } from "./components/ExportResultPanel";
import { generateCoverBatch } from "./lib/cover-workflow";
import { refreshTitleCover } from "./lib/document-cover";
import { titleCoverForBook, coverColors } from "./lib/document-cover";
import { reviewNeighbors } from "./lib/view-scope";
import { savedDetailDraft } from "./lib/detail-draft";
import { useEffect, useMemo, useState } from "react";
import { downloadCsv, downloadLibraryZip } from "./lib/export";
import type { ExportProgress } from "./lib/export";
import { createExportPlan } from "./lib/export-plan";
import { renderBookNote } from "./lib/notes";
import { parseEpubBatch, parseBook } from "./lib/parse";
import { lookupIsbnBatch } from "./lib/openlibrary";
import { primaryIsbn } from "./lib/normalize";
import { runPipeline } from "./lib/pipeline";
import { reviewKey } from "./lib/review";

export default function App() {
  const {
    lookupResults, setLookupResults, lookupSummary, setLookupSummary,
    olProgress, setOlProgress, busy, setBusy,
    progress, setProgress, error, setError,
    coverBatchRunning, setCoverBatchRunning, coverBatchResult, setCoverBatchResult,
    exporting, setExporting, csvDownloading, setCsvDownloading,
    csvDownloadLock, cancelCoverBatch, taskController, importingRef,
    cancelTask, cancelCovers,
  } = useTaskState();
  const {
    books, setBooks, namingMode, setNamingMode,
    useOnlineMeta, setUseOnlineMeta, includeDuplicates, setIncludeDuplicates,
    includeNotes, setIncludeNotes, noteTemplate, setNoteTemplate,
    exportReport, setExportReport, keepOverrides, setKeepOverrides,
    olByIsbn, setOlByIsbn, clearLibrary,
    storageReady, storageStatus, setSaveRetry,
  } = useLibraryState(busy);
  const pipeline = useMemo(
    () => runPipeline(books, namingMode, keepOverrides, { online: useOnlineMeta, olByIsbn }),
    [books, namingMode, keepOverrides, useOnlineMeta, olByIsbn],
  );

  const {
    selected, setSelected, metadataTitleDraft, setMetadataTitleDraft,
    metadataAuthorsDraft, setMetadataAuthorsDraft, coverTitleDraft, setCoverTitleDraft,
    coverAuthorDraft, setCoverAuthorDraft, showDraftPrompt, setShowDraftPrompt,
    detailPosition, openDetails, closeDetails, finishDetail,
    currentDraft, draftDirty, metadataDirty, persistDraft,
    updateDetailDraft, clearDetailDrafts,
  } = useBookDetails(pipeline.books, busy, exporting, setError);

  const [showExportReview, setShowExportReview] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "filtered" | "failed" | "selected">("all");
  const [excludePending, setExcludePending] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [notePreviewId, setNotePreviewId] = useState("");
  const [showCoverBatchReview, setShowCoverBatchReview] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [narrowScreen, setNarrowScreen] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => { const media = window.matchMedia("(max-width: 900px)"); const update = () => setNarrowScreen(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const libraryView = useLibraryView(pipeline);
  const {
    setQuery, setCoverFilter,
    setInformationFilter, setReviewFilter,
    setTab, setCheckedIds,
    setBatchScope, setPage,
    viewBooks, selectedBooks, batchBooks,
    coverCandidates,
  } = libraryView;
  const neighbors = reviewNeighbors(viewBooks, selected?.id, detailPosition.current);
  const selectedIndex = neighbors.index;
  useEffect(() => { if (selectedIndex >= 0) detailPosition.current = selectedIndex; }, [selectedIndex]);
  const failedIds = useMemo(() => new Set(exportReport?.records.filter(record => record.status === "failed").map(record => record.id)), [exportReport]);
  const exportBooks = useMemo(() => exportScope === "selected" ? selectedBooks : exportScope === "filtered" ? viewBooks : exportScope === "failed" ? pipeline.books.filter(book => failedIds.has(book.id)) : pipeline.books, [exportScope, selectedBooks, viewBooks, pipeline, failedIds]);
  const exportPlan = useMemo(() => createExportPlan(exportBooks, { includeDuplicates, includeNotes, noteTemplate, excludePending }), [exportBooks, includeDuplicates, includeNotes, noteTemplate, excludePending]);
  const previewEntry = exportPlan.entries.find(entry => entry.book.id === notePreviewId && entry.notePath) || exportPlan.entries.find(entry => entry.notePath);
  let notePreview = "没有符合当前范围的笔记。";
  if (previewEntry?.path) {
    try { notePreview = renderBookNote(previewEntry.book, noteTemplate, previewEntry.path, previewEntry.notePath); }
    catch (error) { notePreview = String(error); }
  }

  const { ingest } = createImportCommands(() => ({
    storageReady, importingRef, setError, setBusy, setOlProgress, setProgress, taskController,
    parseEpubBatch, useOnlineMeta, primaryIsbn, lookupIsbnBatch, setLookupResults, setOlByIsbn,
    setBooks, setQuery, setSelected, setTab,
  }));
  const { retryCatalog } = createCatalogCommands(() => ({
    busy, exporting, importingRef, storageReady, useOnlineMeta, viewBooks, primaryIsbn,
    setLookupSummary, setBusy, setError, taskController, lookupIsbnBatch, setOlProgress,
    setLookupResults, setOlByIsbn,
  }));
  const { clearAll } = createLibraryCommands(() => ({
    storageReady, importingRef, exporting, busy, clearLibrary, setBusy,
    setSelected, clearDetailDrafts, setCheckedIds, setBatchScope, setPage, setQuery, setCoverFilter, setReviewFilter,
    setInformationFilter, setTab, setError, setLookupResults, setLookupSummary, setCoverBatchResult,
    setExportScope, setShowExportReview, setShowCoverBatchReview, setShowClearConfirm,
  }));
  const { saveReviewedMetadata, confirmMetadataReview } = createMetadataCommands(() => ({
    busy, exporting, storageReady, metadataTitleDraft, setError, metadataAuthorsDraft, books,
    runPipeline, namingMode, keepOverrides, useOnlineMeta, olByIsbn, savedDetailDraft,
    coverTitleDraft, coverAuthorDraft, persistDraft, setBooks, setSelected,
    setMetadataTitleDraft, setMetadataAuthorsDraft, setCoverTitleDraft, setCoverAuthorDraft,
    metadataDirty, reviewKey,
  }));
  const { regenerateDocumentCover, chooseTitleCover, generateMissingCovers, useOriginalCover } = createCoversCommands(() => ({
    importingRef, storageReady, setBusy, setError, parseBook, runPipeline, namingMode,
    useOnlineMeta, olByIsbn, books, refreshTitleCover, URL, keepOverrides, setBooks, setSelected,
    setCoverTitleDraft, setCoverAuthorDraft, coverColors, coverTitleDraft, coverAuthorDraft,
    titleCoverForBook, persistDraft, currentDraft, exporting, coverCandidates,
    setShowCoverBatchReview, cancelCoverBatch, setCoverBatchRunning, setCoverBatchResult,
    generateCoverBatch, setProgress,
  }));
  const { handleExport, exportCsv } = createExportCommands(() => ({
    exportPlan, importingRef, storageReady, setExporting, setError, setExportProgress,
    exportBooks, taskController, downloadLibraryZip, includeDuplicates, includeNotes,
    noteTemplate, excludePending, setExportReport, setShowExportReview, csvDownloadLock, busy,
    exporting, setCsvDownloading, downloadCsv, batchBooks,
  }));


  const { over, fileRef, folderRef } = useFileIntake(storageReady, importingRef, ingest, setError);

  return (
    <div className={`app ${selected ? "detail-open" : ""}`}>
      <div inert={selected && narrowScreen ? true : undefined}>
      {over ? <div className="drop-overlay" aria-hidden="true">松开即可追加书籍 · 已有书籍会保留</div> : null}
      <ImportContainer exportProgress={exportProgress} bookCount={books.length} busy={busy} exporting={exporting} storageReady={storageReady}
        olProgress={olProgress} progress={progress} coverBatchRunning={coverBatchRunning}
        canCancel={!!taskController.current} storageStatus={storageStatus}
        fileRef={fileRef} folderRef={folderRef} ingest={ingest}
        onCancel={() => { cancelTask(); setError("正在停止任务，等待当前步骤结束…"); }}
        onRetrySave={() => setSaveRetry(v => v + 1)} csvDownloading={csvDownloading} exportCsv={exportCsv}
        onReviewExport={() => { setExportScope("filtered"); setShowExportReview(true); }} />
      {lookupSummary ? <p role="status" className="hint">{lookupSummary}</p> : null}
      {Object.values(lookupResults).some(result => result.status === "failed" || result.status === "timeout") ? <p className="hint">部分在线查询未完成，可在整理规则中重试。</p> : null}
      {showClearConfirm ? <section className="panel" role="alertdialog" aria-label="确认清空书库"><p>清空当前 {books.length} 本书籍？将删除此浏览器中的书籍、封面和整理记录，不保留撤销副本。磁盘原文件不受影响。</p><div className="actions"><button className="btn btn-secondary" disabled={busy || exporting} onClick={() => void clearAll()}>确认清空</button><button className="btn btn-ghost" disabled={busy || exporting} onClick={() => setShowClearConfirm(false)}>取消</button></div></section> : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      <RulesContainer bookCount={books.length} namingMode={namingMode} setNamingMode={setNamingMode}
        useOnlineMeta={useOnlineMeta} setUseOnlineMeta={setUseOnlineMeta} busy={busy} exporting={exporting}
        storageReady={storageReady} retryCatalog={retryCatalog} onClear={() => setShowClearConfirm(true)} />
      {pipeline.stats.total > 0 ? (
        <>
          <LibraryStats stats={pipeline.stats} />
          {showExportReview ? <ExportReviewPanel exporting={exporting} busy={busy} storageReady={storageReady}
            exportScope={exportScope} selectedCount={selectedBooks.length} hasFailures={!!failedIds.size}
            excludePending={excludePending} includeDuplicates={includeDuplicates} includeNotes={includeNotes}
            exportPlan={exportPlan} noteTemplate={noteTemplate} previewEntry={previewEntry} notePreview={notePreview}
            setExportScope={setExportScope} setExcludePending={setExcludePending}
            setIncludeDuplicates={setIncludeDuplicates} setIncludeNotes={setIncludeNotes}
            setNoteTemplate={setNoteTemplate} setNotePreviewId={setNotePreviewId} setError={setError}
            onExport={() => void handleExport()} onClose={() => setShowExportReview(false)} /> : null}

          {exportReport ? <ExportResultPanel exportReport={exportReport} exporting={exporting} busy={busy}
            onRetry={() => { setExportScope("failed"); setExcludePending(false); setShowExportReview(true); }} /> : null}
          <LibraryContainer view={libraryView} pipeline={pipeline} busy={busy} exporting={exporting}
            storageReady={storageReady} coverBatchRunning={coverBatchRunning} coverBatchResult={coverBatchResult}
            showCoverBatchReview={showCoverBatchReview} setShowCoverBatchReview={setShowCoverBatchReview}
            cancelCovers={cancelCovers} generateMissingCovers={generateMissingCovers}
            openDetails={openDetails} setKeepOverrides={setKeepOverrides} />
        </>
      ) : !busy ? (
        <div className="steps">
          <div className="step">
            <div className="n">01</div>
            <h3>导入</h3>
            <p>读取书籍信息，MD 自动转为 PDF。</p>
          </div>
          <div className="step">
            <div className="n">02</div>
            <h3>核对</h3>
            <p>校正书名与作者，确认命名和重复项。</p>
          </div>
          <div className="step">
            <div className="n">03</div>
            <h3>导出</h3>
            <p>检查范围，导出书籍、笔记与结果记录。</p>
          </div>
        </div>
      ) : null}

      </div>
      {selected ? <BookDetailsPanel
        selected={selected}
        narrowScreen={narrowScreen}
        closeDetails={closeDetails}
        busy={busy}
        exporting={exporting}
        neighbors={neighbors}
        openDetails={openDetails}
        selectedIndex={selectedIndex}
        viewBookCount={viewBooks.length}
        showDraftPrompt={showDraftPrompt}
        saveReviewedMetadata={saveReviewedMetadata}
        finishDetail={finishDetail}
        persistDraft={persistDraft}
        setShowDraftPrompt={setShowDraftPrompt}
        draftDirty={draftDirty}
        storageReady={storageReady}
        regenerateDocumentCover={regenerateDocumentCover}
        metadataTitleDraft={metadataTitleDraft}
        metadataAuthorsDraft={metadataAuthorsDraft}
        updateDetailDraft={updateDetailDraft}
        metadataDirty={metadataDirty}
        confirmMetadataReview={confirmMetadataReview}
        coverTitleDraft={coverTitleDraft}
        coverAuthorDraft={coverAuthorDraft}
        chooseTitleCover={chooseTitleCover}
        useOriginalCover={useOriginalCover}
        lookupResults={lookupResults}
        olByIsbn={olByIsbn}
      /> : null}
    </div>
  );
}

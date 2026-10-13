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
import { LibraryResults } from "./components/LibraryResults";
import { BookDetailsPanel } from "./components/BookDetailsPanel";
import { ImportArea } from "./components/ImportArea";
import { LibraryStats } from "./components/LibraryStats";
import { ExportReviewPanel } from "./components/ExportReviewPanel";
import { ExportResultPanel } from "./components/ExportResultPanel";
import { generateCoverBatch } from "./lib/cover-workflow";
import type { CoverFilter } from "./lib/cover-workflow";
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
import { reviewKey, isReviewed, needsReview } from "./lib/review";

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
  const {
    query, setQuery, coverFilter, setCoverFilter,
    informationFilter, setInformationFilter, reviewFilter, setReviewFilter,
    tab, setTab, checkedIds, setCheckedIds,
    batchScope, setBatchScope, pageSize, setPage,
    toggleBook, filtered, renameBooks, duplicateBooks,
    visibleGroups, viewBooks, selectedBooks, batchBooks,
    coverCandidates, pageCount, currentPage, pageBooks,
    pageGroups,
  } = useLibraryView(pipeline);
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

  const ratio =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={`app ${selected ? "detail-open" : ""}`}>
      <div inert={selected && narrowScreen ? true : undefined}>
      {over ? <div className="drop-overlay" aria-hidden="true">松开即可追加书籍 · 已有书籍会保留</div> : null}
      <ImportArea bookCount={books.length} busy={busy} exporting={exporting} storageReady={storageReady}
        olProgress={olProgress} progress={progress} coverBatchRunning={coverBatchRunning}
        canCancel={!!taskController.current} storageStatus={storageStatus} over={over}
        fileRef={fileRef} folderRef={folderRef} ingest={ingest}
        onCancel={() => { cancelTask(); setError("正在停止任务，等待当前步骤结束…"); }}
        onRetrySave={() => setSaveRetry(v => v + 1)} onClear={() => setShowClearConfirm(true)} />
      {busy && progress ? (
        <div className="progress">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--muted)" }}>正在读取内部元数据</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="bar" style={{ marginTop: "0.5rem" }}>
            <div style={{ width: `${ratio}%` }} />
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--faint)" }}>
            {progress.current}
          </p>
        </div>
      ) : null}

      {olProgress ? <p role="status">{olProgress}</p> : null}
      {lookupSummary ? <p role="status" className="hint">{lookupSummary}</p> : null}
      {Object.values(lookupResults).some(result => result.status === "failed" || result.status === "timeout") ? <p className="hint">部分查询失败或超时，可在整理规则中重试；已有书目不会清空。</p> : null}
      {showClearConfirm ? <section className="panel" role="alertdialog" aria-label="确认清空书库"><p>清空当前 {books.length} 本书籍？将删除此浏览器中的书籍、封面和整理记录，不保留撤销副本。磁盘原文件不受影响。</p><div className="actions"><button className="btn btn-secondary" disabled={busy || exporting} onClick={() => void clearAll()}>确认清空</button><button className="btn btn-ghost" disabled={busy || exporting} onClick={() => setShowClearConfirm(false)}>取消</button></div></section> : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

          <section className="toolbar" aria-label="整理规则与导出">
            <div className="section-heading"><h2>整理规则</h2><p>CSV 与批量封面可切换当前结果或勾选项；导出前单独确认范围。</p></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
              <div className="seg">
                <button
                  type="button"
                  className={namingMode === 1 ? "active" : ""}
                  onClick={() => setNamingMode(1)}
                >
                  纯书名
                </button>
                <button
                  type="button"
                  className={namingMode === 2 ? "active" : ""}
                  onClick={() => setNamingMode(2)}
                >
                  附丛书名
                </button>
              </div>
              <label className="toggle" title="按 ISBN 查询在线书目，不上传书籍文件">
                <input
                  type="checkbox"
                  checked={useOnlineMeta}
                  disabled={busy || exporting || !storageReady}
                  onChange={(e) => setUseOnlineMeta(e.target.checked)}
                />
                联网补全书目（ISBN）
              </label>
              {books.length ? <button type="button" className="btn btn-ghost" disabled={busy || exporting || !storageReady || !useOnlineMeta} onClick={() => void retryCatalog()}>补全 / 重试当前列表</button> : null}
            </div>
            {books.length ? <div className="actions" style={{ marginTop: 0, justifyContent: "flex-start" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={csvDownloading || busy || exporting || !storageReady}
                onClick={exportCsv}
              >
                {csvDownloading ? "已发起下载" : "导出 CSV"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={exporting || busy || !storageReady}
                onClick={() => { setExportScope("filtered"); setShowExportReview(true); }}
              >
                {exporting ? "打包中…" : "检查并导出书库与笔记"}
              </button>
            </div> : null}
          </section>

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
          {exportProgress ? <p role="status">导出进度 {exportProgress.done} / {exportProgress.total}：{exportProgress.current}{exportProgress.zipPercent !== undefined ? ` ${Math.round(exportProgress.zipPercent)}%` : ""}</p> : null}
          {exportReport ? <ExportResultPanel exportReport={exportReport} exporting={exporting} busy={busy}
            onRetry={() => { setExportScope("failed"); setExcludePending(false); setShowExportReview(true); }} /> : null}
          <section className="library-controls" aria-label="书库搜索与筛选">
          <div className="section-heading"><h2>浏览与审核</h2><p>搜索、审核状态和封面条件共同作用于下方列表。</p></div>
          <label className="search-label" htmlFor="library-search">搜索书库</label>
          <input
            id="library-search"
            type="search"
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索书名、作者或文件名"
          />

          <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <label>封面筛选 <select value={coverFilter} onChange={event => setCoverFilter(event.target.value as CoverFilter)}>
              <option value="all">全部</option><option value="missing">使用原文首页 / 无封面预览</option><option value="generated">使用生成封面</option><option value="papers">论文候选</option>
            </select></label>
            <button className="btn btn-secondary" disabled={busy || exporting || !storageReady || !coverCandidates.length} onClick={() => setShowCoverBatchReview(true)}>批量生成封面（{coverCandidates.length} 本）</button>
            {coverBatchRunning ? <button className="btn btn-ghost" onClick={cancelCovers}>处理完当前文件后停止</button> : null}
          </div>
          <p className="hint">PDF 默认保留原文首页；EPUB 保留原书封面。只有选择生成后才新增封面，不改动原页。当前批量范围 {batchBooks.length} 本。</p>
          {showCoverBatchReview ? <section className="panel" aria-label="批量封面范围" style={{ padding: "1rem" }}>
            <p>将为所选范围中的 {coverCandidates.length} 本保留书籍新增封面，原页面完整保留。PDF 首页可能已含封面，请核对下面的范围。</p>
            <ul style={{ maxHeight: "180px", overflow: "auto" }}>{coverCandidates.map(book => <li key={book.id}>{book.resolvedTitle || book.rawTitle || book.originalName} · {book.originalName}</li>)}</ul>
            <div className="actions"><button className="btn btn-primary" disabled={busy || exporting || !storageReady || !coverCandidates.length} onClick={() => void generateMissingCovers()}>生成这 {coverCandidates.length} 本</button><button className="btn btn-ghost" onClick={() => setShowCoverBatchReview(false)}>收起</button></div>
          </section> : null}
          {coverBatchResult ? <p role="status" className="hint">{coverBatchResult}</p> : null}

          <label>信息状态 <select aria-label="信息状态" value={informationFilter} onChange={event => setInformationFilter(event.target.value as typeof informationFilter)}><option value="all">全部信息状态</option><option value="issues">待补全 / 有异常</option><option value="complete">无已知异常</option></select></label>
          <div className="tabs" aria-label="书籍视图">
            <label>审核筛选 <select aria-label="审核筛选" value={reviewFilter} onChange={event => setReviewFilter(event.target.value as typeof reviewFilter)}><option value="all">全部审核状态</option><option value="pending">待审核（{pipeline.books.filter(needsReview).length} 本）</option><option value="reviewed">已人工审核（{pipeline.books.filter(isReviewed).length} 本）</option></select></label>
            <button
              type="button"
              className={tab === "audit" ? "active" : ""}
              aria-pressed={tab === "audit"}
              onClick={() => setTab("audit")}
            >
              全部书籍 {pipeline.stats.total} 本
            </button>
            <button
              type="button"
              className={tab === "rename" ? "active" : ""}
              aria-pressed={tab === "rename"}
              onClick={() => setTab("rename")}
            >
              待命名 {pipeline.stats.willRename} 本
            </button>
            <button
              type="button"
              className={tab === "dedupe" ? "active" : ""}
              aria-pressed={tab === "dedupe"}
              onClick={() => setTab("dedupe")}
            >
              去重 {duplicateBooks.length} 本 · {pipeline.stats.duplicateGroups} 组
            </button>
          </div>

          <p className="view-summary" role="status">
            {tab === "audit" ? `全部 ${pipeline.stats.total} 本，当前显示 ${filtered.length} 本`
              : tab === "rename" ? `待命名 ${pipeline.stats.willRename} / ${pipeline.stats.total} 本，当前显示 ${renameBooks.length} 本；仅列出保留书籍中建议文件名有变化的项目`
              : `重复候选 ${duplicateBooks.length} / ${pipeline.stats.total} 本，共 ${pipeline.groups.length} 组，当前显示 ${visibleGroups.length} 组；每组完整展示，方便比较`}
          </p>
          {query || coverFilter !== "all" || reviewFilter !== "all" || informationFilter !== "all" ? <div className="filter-summary"><span>当前条件：{informationFilter === "issues" ? "信息待补全 / 有异常 · " : informationFilter === "complete" ? "无已知异常 · " : ""}{query ? `搜索「${query}」 · ` : ""}{reviewFilter === "pending" ? "待审核" : reviewFilter === "reviewed" ? "已人工审核" : "全部审核状态"} · {coverFilter === "missing" ? "原文首页 / 无封面预览" : coverFilter === "generated" ? "生成封面" : coverFilter === "papers" ? "论文候选" : "全部封面"}</span><button type="button" className="btn btn-ghost" onClick={() => { setQuery(""); setCoverFilter("all"); setReviewFilter("all"); setInformationFilter("all"); }}>清除筛选</button></div> : null}
          </section>
          <section className="selection-bar" aria-label="批量范围">
            <span>已勾选 {selectedBooks.length} 本</span>
            <button className="btn btn-ghost" onClick={() => setCheckedIds(previous => new Set([...previous, ...viewBooks.map(book => book.id)]))}>选择当前结果（{viewBooks.length}）</button>
            <button className="btn btn-ghost" onClick={() => setCheckedIds(new Set(pipeline.books.map(book => book.id)))}>选择全库（{books.length}）</button>
            <button className="btn btn-ghost" onClick={() => setCheckedIds(new Set())}>取消勾选</button>
            <label>批量封面 / CSV <select aria-label="批量封面和 CSV 范围" value={batchScope} onChange={event => setBatchScope(event.target.value as typeof batchScope)} disabled={busy || exporting}><option value="view">当前结果（{viewBooks.length}）</option><option value="selected">勾选书籍（{selectedBooks.length}）</option></select></label>
          </section>
          <nav className="pagination" aria-label="结果分页"><button className="btn btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</button><span>第 {currentPage} / {pageCount} 页 · 每页最多 {pageSize} {tab === "dedupe" ? "组" : "本"}</span><button className="btn btn-secondary" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>
          <LibraryResults tab={tab}
            filtered={filtered}
            pageBooks={pageBooks}
            renameBooks={renameBooks}
            allBooks={pipeline.books}
            visibleGroups={visibleGroups}
            pageGroups={pageGroups}
            checkedIds={checkedIds}
            toggleBook={toggleBook}
            openDetails={openDetails}
            setKeepOverrides={setKeepOverrides} />
          {pageCount > 1 ? <nav className="pagination" aria-label="列表末尾分页"><button className="btn btn-secondary" disabled={currentPage <= 1} onClick={() => { setPage(currentPage - 1); document.querySelector('[aria-label="结果分页"]')?.scrollIntoView({ block: "start" }); }}>上一页</button><span>第 {currentPage} / {pageCount} 页</span><button className="btn btn-secondary" disabled={currentPage >= pageCount} onClick={() => { setPage(currentPage + 1); document.querySelector('[aria-label="结果分页"]')?.scrollIntoView({ block: "start" }); }}>下一页</button></nav> : null}
          {pipeline.stats.failed > 0 ? (
            <p style={{ fontSize: "0.75rem", color: "var(--warn)", marginTop: "1rem" }}>
              {pipeline.stats.failed}{" "}
              本无法可靠读取内部元数据，仍会按文件名参与命名，但不作为可靠书目。
            </p>
          ) : null}
        </>
      ) : !busy ? (
        <div className="steps">
          <div className="step">
            <div className="n">01</div>
            <h3>审计</h3>
            <p>自动识别 EPUB / PDF，读取内部元数据；缺失字段回退到文件名，失败保留原因。</p>
          </div>
          <div className="step">
            <div className="n">02</div>
            <h3>命名</h3>
            <p>模式1：清洗书名；模式2：有丛书元数据则附加（丛书名）。</p>
          </div>
          <div className="step">
            <div className="n">03</div>
            <h3>去重</h3>
            <p>SHA-256 → ISBN → 精确书名作者 → 模糊书名；按质量分保留最优。</p>
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

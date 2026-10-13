import { useEffect, useMemo, useState } from "react";
import { useFeatureCommands } from "./hooks/useFeatureCommands";
import { useLibraryView } from "./hooks/useLibraryView";
import { useFileIntake } from "./hooks/useFileIntake";
import { useLibraryState } from "./hooks/useLibraryState";
import { useBookDetails } from "./hooks/useBookDetails";
import { useTaskLifecycle } from "./hooks/useTaskState";
import { LibraryContainer } from "./containers/LibraryContainer";
import { RulesContainer } from "./containers/RulesContainer";
import { ImportContainer } from "./containers/ImportContainer";
import { ExportContainer } from "./containers/ExportContainer";
import { DetailContainer } from "./containers/DetailContainer";
import { LibraryStats } from "./components/LibraryStats";
import { FolioStoreProvider } from "./state/FolioStoreProvider";
import { useFolioSelector } from "./state/folio-context";
import { reviewNeighbors } from "./lib/view-scope";
import { runPipeline } from "./lib/pipeline";

export default function App() {
  return <FolioStoreProvider><Workbench /></FolioStoreProvider>;
}

function Workbench() {
  const { importingRef, cancelTask, cancelCovers } = useTaskLifecycle();
  const { busy, exporting, error, setError, lookupSummary, lookupResults,
    showClearConfirm, setShowClearConfirm, setExportScope, setShowExportReview } = useFolioSelector(s => ({
    busy: s.busy, exporting: s.exporting, error: s.error, setError: s.setError,
    lookupSummary: s.lookupSummary, lookupResults: s.lookupResults,
    showClearConfirm: s.showClearConfirm, setShowClearConfirm: s.setShowClearConfirm,
    setExportScope: s.setExportScope, setShowExportReview: s.setShowExportReview,
  }));
  const { books, namingMode, useOnlineMeta, keepOverrides, olByIsbn,
    clearLibrary, storageReady, setSaveRetry } = useLibraryState(busy);
  const pipeline = useMemo(
    () => runPipeline(books, namingMode, keepOverrides, { online: useOnlineMeta, olByIsbn }),
    [books, namingMode, keepOverrides, useOnlineMeta, olByIsbn],
  );
  const details = useBookDetails(pipeline.books, busy, exporting, setError);
  const { selected, detailPosition, openDetails } = details;
  const [narrowScreen, setNarrowScreen] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setNarrowScreen(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const libraryView = useLibraryView(pipeline);
  const { viewBooks, selectedBooks } = libraryView;
  const neighbors = reviewNeighbors(viewBooks, selected?.id, detailPosition.current);
  useEffect(() => { if (neighbors.index >= 0) detailPosition.current = neighbors.index; }, [neighbors.index]);
  const commands = useFeatureCommands(clearLibrary, details);
  const { ingest, retryCatalog, clearAll, generateMissingCovers, handleExport, exportCsv } = commands;
  const { over, fileRef, folderRef } = useFileIntake(storageReady, importingRef, ingest, setError);

  return <div className={`app ${selected ? "detail-open" : ""}`}>
    <div inert={selected && narrowScreen ? true : undefined}>
      {over ? <div className="drop-overlay" aria-hidden="true">松开即可追加书籍 · 已有书籍会保留</div> : null}
      <ImportContainer fileRef={fileRef} folderRef={folderRef} ingest={ingest}
        onCancel={() => { cancelTask(); setError("正在停止任务，等待当前步骤结束…"); }}
        onRetrySave={() => setSaveRetry(v => v + 1)} exportCsv={exportCsv}
        onReviewExport={() => { setExportScope("filtered"); setShowExportReview(true); }} />
      {lookupSummary ? <p role="status" className="hint">{lookupSummary}</p> : null}
      {Object.values(lookupResults).some(result => result.status === "failed" || result.status === "timeout") ? <p className="hint">部分在线查询未完成，可在整理规则中重试。</p> : null}
      {showClearConfirm ? <section className="panel" role="alertdialog" aria-label="确认清空书库"><p>清空当前 {books.length} 本书籍？将删除此浏览器中的书籍、封面和整理记录，不保留撤销副本。磁盘原文件不受影响。</p><div className="actions"><button className="btn btn-secondary" disabled={busy || exporting} onClick={() => void clearAll()}>确认清空</button><button className="btn btn-ghost" disabled={busy || exporting} onClick={() => setShowClearConfirm(false)}>取消</button></div></section> : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <RulesContainer retryCatalog={retryCatalog} onClear={() => setShowClearConfirm(true)} />
      {pipeline.stats.total > 0 ? <>
        <LibraryStats stats={pipeline.stats} />
        <ExportContainer pipeline={pipeline} viewBooks={viewBooks} selectedBooks={selectedBooks} onExport={() => void handleExport()} />
        <LibraryContainer view={libraryView} pipeline={pipeline} cancelCovers={cancelCovers}
          generateMissingCovers={generateMissingCovers} openDetails={openDetails} />
      </> : !busy ? <div className="steps">
        <div className="step"><div className="n">01</div><h3>导入</h3><p>读取书籍信息，MD 自动转为 PDF。</p></div>
        <div className="step"><div className="n">02</div><h3>核对</h3><p>校正书名与作者，确认命名和重复项。</p></div>
        <div className="step"><div className="n">03</div><h3>导出</h3><p>检查范围，导出书籍、笔记与结果记录。</p></div>
      </div> : null}
    </div>
    <DetailContainer details={details} commands={commands} narrowScreen={narrowScreen} neighbors={neighbors} viewBookCount={viewBooks.length} />
  </div>;
}

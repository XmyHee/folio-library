import { memo } from "react";
import { useFolioSelector } from "../state/folio-context";
import type { useLibraryView } from "../hooks/useLibraryView";
import type { useBookDetails } from "../hooks/useBookDetails";
import type { PipelineResult } from "../lib/types";
import type { CoverFilter } from "../lib/cover-workflow";
import { isReviewed, needsReview } from "../lib/review";
import { LibraryResults } from "../components/LibraryResults";
interface Props {
  view: ReturnType<typeof useLibraryView>; pipeline: PipelineResult;
  cancelCovers: () => void; generateMissingCovers: () => Promise<void>;
  openDetails: ReturnType<typeof useBookDetails>["openDetails"];
}
export const LibraryContainer = memo(function LibraryContainer({view, pipeline, cancelCovers,
  generateMissingCovers, openDetails}: Props) {
  const { busy, exporting, storageReady, coverBatchRunning, coverBatchResult,
    showCoverBatchReview, setShowCoverBatchReview, setKeepOverrides } = useFolioSelector(s => ({
    busy: s.busy, exporting: s.exporting, storageReady: s.storageReady,
    coverBatchRunning: s.coverBatchRunning, coverBatchResult: s.coverBatchResult,
    showCoverBatchReview: s.showCoverBatchReview, setShowCoverBatchReview: s.setShowCoverBatchReview,
    setKeepOverrides: s.setKeepOverrides,
  }));
  const {query, setQuery, coverFilter, setCoverFilter, informationFilter, setInformationFilter, reviewFilter, setReviewFilter, tab, setTab, checkedIds, setCheckedIds, batchScope, setBatchScope, pageSize, setPage, toggleBook, filtered, renameBooks, duplicateBooks, visibleGroups, viewBooks, selectedBooks, batchBooks, coverCandidates, pageCount, currentPage, pageBooks, pageGroups} = view;
  return (<>
  <section className="library-controls" aria-label="书库搜索与筛选">
  <div className="section-heading"><h2>浏览与审核</h2></div>
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
  <p className="hint">封面生成后在导出时写入，原文件不变。当前批量范围 {batchBooks.length} 本。</p>
  {showCoverBatchReview ? <section className="panel" aria-label="批量封面范围" style={{ padding: "1rem" }}>
    <p>为以下 {coverCandidates.length} 本生成封面。PDF 原页面保留；请先确认首页是否已有封面。</p>
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
      : tab === "rename" ? `待命名 ${pipeline.stats.willRename} / ${pipeline.stats.total} 本，当前显示 ${renameBooks.length} 本；仅列出保留项`
      : `重复候选 ${duplicateBooks.length} 本，共 ${pipeline.groups.length} 组；当前显示 ${visibleGroups.length} 个完整组`}
  </p>
  {query || coverFilter !== "all" || reviewFilter !== "all" || informationFilter !== "all" ? <div className="filter-summary"><span>当前条件：{informationFilter === "issues" ? "信息待补全 / 有异常 · " : informationFilter === "complete" ? "无已知异常 · " : ""}{query ? `搜索「${query}」 · ` : ""}{reviewFilter === "pending" ? "待审核" : reviewFilter === "reviewed" ? "已人工审核" : "全部审核状态"} · {coverFilter === "missing" ? "原文首页 / 无封面预览" : coverFilter === "generated" ? "生成封面" : coverFilter === "papers" ? "论文候选" : "全部封面"}</span><button type="button" className="btn btn-ghost" onClick={() => { setQuery(""); setCoverFilter("all"); setReviewFilter("all"); setInformationFilter("all"); }}>清除筛选</button></div> : null}
  </section>
  <section className="selection-bar" aria-label="批量范围">
    <span>已勾选 {selectedBooks.length} 本</span>
    <button className="btn btn-ghost" onClick={() => setCheckedIds(previous => new Set([...previous, ...viewBooks.map(book => book.id)]))}>选择当前结果（{viewBooks.length}）</button>
    <button className="btn btn-ghost" onClick={() => setCheckedIds(new Set(pipeline.books.map(book => book.id)))}>选择全库（{pipeline.books.length}）</button>
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
      本文件处理失败，请打开详情查看原因；建议书目仅供核对。
    </p>
  ) : null}
  </>);
});

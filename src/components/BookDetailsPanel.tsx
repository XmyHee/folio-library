import type { DerivedBook } from "../lib/types";
import type { LookupResult, OpenLibraryHit } from "../lib/openlibrary";
import type { DetailDraft } from "../lib/detail-draft";
import type { reviewNeighbors } from "../lib/view-scope";
import { coverUrlFor, coverColors } from "../lib/document-cover";
import { isReviewed, reviewReasons } from "../lib/review";
import { formatBytes } from "../lib/files";
import { ROLE_LABEL } from "./book-presentation";
interface Props {
  selected:DerivedBook; narrowScreen:boolean; busy:boolean; exporting:boolean; storageReady:boolean;
  closeDetails:()=>void; neighbors:ReturnType<typeof reviewNeighbors>; openDetails:(book:DerivedBook)=>void;
  selectedIndex:number; viewBookCount:number; showDraftPrompt:boolean;
  saveReviewedMetadata:(book:DerivedBook, reset?:boolean)=>boolean; finishDetail:()=>void;
  persistDraft:(book:DerivedBook)=>void; setShowDraftPrompt:(value:boolean)=>void;
  draftDirty:boolean; metadataDirty:boolean;
  reconvertMarkdown:(book:DerivedBook)=>Promise<void>;
  regenerateDocumentCover:(book:DerivedBook)=>Promise<void>;
  metadataTitleDraft:string; metadataAuthorsDraft:string; coverTitleDraft:string; coverAuthorDraft:string;
  updateDetailDraft:(field:keyof DetailDraft, value:string)=>void;
  confirmMetadataReview:(book:DerivedBook, undo?:boolean)=>void;
  chooseTitleCover:(book:DerivedBook, color?:string)=>Promise<void>; useOriginalCover:(book:DerivedBook)=>void;
  lookupResults:Record<string, LookupResult>; olByIsbn:Map<string,OpenLibraryHit>;
}

export function BookDetailsPanel({selected, narrowScreen, closeDetails, busy, exporting, neighbors, openDetails, selectedIndex, viewBookCount, showDraftPrompt, saveReviewedMetadata, finishDetail, persistDraft, setShowDraftPrompt, draftDirty, storageReady, regenerateDocumentCover, reconvertMarkdown, metadataTitleDraft, metadataAuthorsDraft, updateDetailDraft, metadataDirty, confirmMetadataReview, coverTitleDraft, coverAuthorDraft, chooseTitleCover, useOriginalCover, lookupResults, olByIsbn}:Props) {
  return (
<div
          className="dialog-backdrop"
          onClick={closeDetails}
          onKeyDown={(e) => e.key === "Escape" && closeDetails()}
          role="presentation"
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal={narrowScreen}
            aria-labelledby="detail-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={event => {
              if (!narrowScreen || event.key !== "Tab") return;
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary')).filter(element => element.getClientRects().length);
              const first = controls[0], last = controls[controls.length - 1];
              if (event.shiftKey && (document.activeElement === first || document.activeElement?.id === "detail-title")) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}
          >
            <button type="button" className="dialog-close" onClick={closeDetails}>
              ×
            </button>
              <h2 id="detail-title" tabIndex={-1}>书籍详情</h2>
              <nav className="actions" aria-label="连续审核"><button className="btn btn-secondary" disabled={busy || exporting || !neighbors.previous} onClick={() => openDetails(neighbors.previous!)}>上一本</button><span>{selectedIndex < 0 ? "已不在当前结果" : `${selectedIndex + 1} / ${viewBookCount}`}</span><button className="btn btn-secondary" disabled={busy || exporting || !neighbors.next} onClick={() => openDetails(neighbors.next!)}>下一本</button></nav>
              {showDraftPrompt ? <section className="panel" role="alertdialog" aria-label="未保存修改"><p>当前修改尚未应用。草稿保留在此标签页，不参与导出。</p><div className="actions"><button className="btn btn-secondary" onClick={() => { if (saveReviewedMetadata(selected)) finishDetail(); }}>保存书目并继续</button><button className="btn btn-secondary" onClick={finishDetail}>保留草稿并继续</button><button className="btn btn-ghost" onClick={() => { persistDraft(selected); finishDetail(); }}>放弃修改并继续</button><button className="btn btn-ghost" onClick={() => setShowDraftPrompt(false)}>继续编辑</button></div></section> : null}
              {draftDirty ? <p className="hint" role="status">有未应用修改 · 草稿已保留，保存书目或生成封面后生效。</p> : null}
            <div className="detail-overview">
              <div className="cover" style={{ width: "5rem", height: "7.5rem" }}>
                {coverUrlFor(selected) ? <img src={coverUrlFor(selected)} alt="" /> : selected.kind === "pdf" ? "PDF 首页不可用" : selected.kind === "epub" ? "EPUB 无封面" : "无预览"}
              </div>
              <div>
                <div style={{ fontFamily: "var(--display)", fontSize: "1.1rem", fontWeight: 500 }}>
                  {selected.rawTitle || "【缺失书名】"}
                </div>
                <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                  {selected.displayAuthor}
                </div>
                <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <span className={`badge ${ROLE_LABEL[selected.role].cls}`}>
                    {ROLE_LABEL[selected.role].text}
                  </span>
                  {selected.hasZlibTag ? <span className="badge badge-warn">z-library</span> : null}
                  {selected.status === "error" ? (
                    <span className="badge badge-drop">解析失败</span>
                  ) : null}
                </div>
              </div>
            </div>
            {!selected.markdownSource && (selected.kind === "pdf" || selected.kind === "epub") ? <button className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={() => void regenerateDocumentCover(selected)}>重新识别书目与封面</button> : null}
            <section className="detail-section" aria-label="人工校正书目">
              <strong>人工校正书目{selected.manualMetadata ? " · 已保存" : ""}</strong>
              <p className="hint">审核：{isReviewed(selected) ? "已人工审核" : "未人工审核"} · 信息：{reviewReasons(selected).join("；") || "无已知异常"}</p>
              <div className="detail-fields">
              <label>书名<textarea className="search" rows={3} value={metadataTitleDraft} disabled={busy || exporting} onChange={event => updateDetailDraft("title", event.target.value)} /></label>
              <label>作者（每行一位）<textarea className="search" rows={3} value={metadataAuthorsDraft} disabled={busy || exporting} onChange={event => updateDetailDraft("authors", event.target.value)} /></label>
              </div>
              <div className="actions"><button className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={() => saveReviewedMetadata(selected)}>保存书名与作者</button><button className="btn btn-ghost" disabled={busy || exporting || !storageReady || !selected.manualMetadata} onClick={() => saveReviewedMetadata(selected, true)}>恢复自动识别结果</button></div>
              <p className="hint">保存后更新命名与去重；已有生成封面需重新生成。</p>
              <div className="actions"><button className="btn btn-secondary" disabled={busy || exporting || !storageReady || isReviewed(selected) || metadataDirty} onClick={() => confirmMetadataReview(selected)}>确认已审核</button><button className="btn btn-ghost" disabled={busy || exporting || !storageReady || !isReviewed(selected)} onClick={() => confirmMetadataReview(selected, true)}>撤销审核</button></div>
              <p className="hint">请先保存再确认。确认不消除错误；书目变化后需重新审核。</p>
            </section>
            {selected.kind === "pdf" || selected.kind === "epub" ? <details className="detail-section"><summary>封面设置</summary>
            <div className="detail-fields">
            {selected.kind === "pdf" || selected.kind === "epub" ? <div className="detail-cover-fields">
              <label>封面标题<textarea className="search" style={{ width: "100%", boxSizing: "border-box" }} rows={3} disabled={busy || exporting} value={coverTitleDraft} onChange={event => updateDetailDraft("coverTitle", event.target.value)} /></label>
              <label>封面作者<textarea className="search" style={{ width: "100%", boxSizing: "border-box" }} rows={2} disabled={busy || exporting} value={coverAuthorDraft} onChange={event => updateDetailDraft("coverAuthor", event.target.value)} /></label>
              <p className="hint">仅用于封面，生成后生效。</p>

            </div> : null}
            </div>
            {selected.kind === "pdf" || selected.kind === "epub" ? <div className="actions">
              <button className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={() => void chooseTitleCover(selected)}>生成标题作者封面</button>
              <button className="btn btn-ghost" disabled={busy || exporting || !storageReady} onClick={() => useOriginalCover(selected)}>{selected.kind === "pdf" || selected.coverIsFirstPage ? "使用原文首页" : "恢复原文件封面"}</button>
            </div> : null}
            <div className="detail-color-row"><label>配色并生成 <select disabled={busy || exporting || !storageReady} value={selected.coverColor ?? coverColors[0]} onChange={event => void chooseTitleCover(selected, event.target.value)}>{coverColors.map((color, index) => <option key={color} value={color}>{["海蓝", "酒红", "墨绿", "紫灰", "棕金", "深灰"][index]}</option>)}</select></label>
            <button className="btn btn-ghost" disabled={busy || exporting || !storageReady} onClick={() => void chooseTitleCover(selected, coverColors[crypto.getRandomValues(new Uint32Array(1))[0]! % coverColors.length])}>随机配色并生成</button>
            </div>
            <p className="hint">导出时嵌入生成封面，保留正文与 Originals 原文件；选择原封面 / 首页可恢复。</p>
            </details> : null}
              {selected.markdownSource ? <section className="detail-section" aria-label="Markdown 转换"><strong>Markdown → PDF</strong><p className="hint">原件与图片已保留。使用当前排版重新转换，保留人工校正、审核和选定封面；文件内 YAML 排版优先。</p><button className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={()=>void reconvertMarkdown(selected)}>重新转换 PDF</button></section> : null}
              <section className="detail-section" aria-label="文件信息"><strong>文件信息</strong><dl className="dl">
              <dt>实际格式</dt><dd>{selected.markdownSource && selected.status === "error" ? "Markdown（未转为 PDF）" : selected.kind?.toUpperCase() || "未知"}</dd>
              {selected.markdownSource && selected.error ? <><dt>转换失败</dt><dd role="alert">{selected.error}</dd></> : null}
              <dt>联网状态</dt><dd>{!selected.isbn ? "无 ISBN" : lookupResults[selected.isbn.replace(/[^0-9Xx]/g, "").toUpperCase()] ? { found: "已匹配", not_found: "未找到书目", failed: "查询失败，可重试", timeout: "查询超时，可重试" }[lookupResults[selected.isbn.replace(/[^0-9Xx]/g, "").toUpperCase()]!.status] : olByIsbn.has(selected.isbn.replace(/[^0-9Xx]/g, "").toUpperCase()) ? "已缓存书目" : "未查询"}</dd>
              <dt>原始文件名</dt><dd>{selected.originalName}</dd>
              <dt>建议文件名</dt><dd>{selected.proposedName}</dd>
              <dt>识别提示</dt><dd>{selected.warnings?.join("；") || "无"}</dd>
            </dl></section>
            <details className="detail-section"><summary>更多书目与识别信息</summary>
            <dl className="dl">
              <dt>封面来源</dt><dd>{selected.coverPreference === "title" ? "标题作者生成封面" : selected.kind === "pdf" || selected.coverIsFirstPage ? "原文首页（EPUB 为重排预览）" : "原书封面"}</dd>
              {selected.bookPageMetadata ? <><dt>题名页书名</dt><dd>{selected.bookPageMetadata.title}</dd><dt>题名页作者</dt><dd>{selected.bookPageMetadata.authors.join(" · ") || "未可靠提取"}</dd><dt>识别依据</dt><dd>前页 / 前章节第 {selected.bookPageMetadata.page} 项：{[...selected.bookPageMetadata.titleEvidence, ...selected.bookPageMetadata.authorEvidence].join(" / ")}</dd></> : null}
              {selected.paperMetadata ? <><dt>首页识别标题</dt><dd>{selected.paperMetadata.title || "—"}</dd><dt>首页识别作者</dt><dd>{selected.paperMetadata.authors.join(" · ") || "未可靠提取"}</dd><dt>首页识别依据</dt><dd>{[...selected.paperMetadata.titleEvidence, ...selected.paperMetadata.authorEvidence].join(" / ")}</dd></> : null}
              <dt>论文识别依据</dt><dd>{selected.paperReasons?.join("；") || "未建立论文判断"}</dd>
              <dt>书目来源</dt><dd>{selected.manualMetadata ? "人工校正" : "自动识别"}</dd>
              <dt>作者</dt>
              <dd>{selected.resolvedAuthors?.join(" · ") || "—"}</dd>
              <dt>出版社</dt>
              <dd>{selected.publisher || "—"}</dd>
              <dt>语言</dt>
              <dd>{selected.language || "—"}</dd>
              <dt>标识符</dt>
              <dd>{selected.identifiers.join(" · ") || "—"}</dd>
              <dt>日期</dt>
              <dd>{selected.date || "—"}</dd>
              <dt>丛书</dt>
              <dd>{selected.series || "—"}</dd>
              <dt>体积</dt>
              <dd>{formatBytes(selected.size)}</dd>
              <dt>SHA-256</dt>
              <dd className="mono">{selected.hash}</dd>
              {selected.error ? (
                <>
                  <dt>错误</dt>
                  <dd>{selected.error}</dd>
                </>
              ) : null}
            </dl>
            {selected.description ? (
              <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "var(--muted)" }}>
                {selected.description}
              </p>
            ) : null}
            </details>
          </div>
        </div>
  );
}

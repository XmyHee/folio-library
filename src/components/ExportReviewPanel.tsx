import { useEffect, useRef } from "react";
import { formatBytes } from "../lib/files";
import { prepareNoteTemplate, noteVariables } from "../lib/notes";
import { defaultNoteTemplate } from "../lib/note-template";
import type { createExportPlan } from "../lib/export-plan";
type Scope = "all" | "filtered" | "failed" | "selected";
type Plan = ReturnType<typeof createExportPlan>;
interface Props {
  exporting:boolean; busy:boolean; storageReady:boolean; exportScope:Scope;
  selectedCount:number; hasFailures:boolean; excludePending:boolean; includeDuplicates:boolean; includeNotes:boolean;
  exportPlan:Plan; noteTemplate:string; previewEntry:Plan["entries"][number] | undefined; notePreview:string;
  setExportScope:(value:Scope)=>void; setExcludePending:(value:boolean)=>void;
  setIncludeDuplicates:(value:boolean)=>void; setIncludeNotes:(value:boolean)=>void;
  setNoteTemplate:(value:string)=>void; setNotePreviewId:(value:string)=>void; setError:(value:string)=>void;
  onExport:()=>void; onClose:()=>void;
}
export function ExportReviewPanel({exporting,busy,storageReady,exportScope,selectedCount,hasFailures,excludePending,includeDuplicates,includeNotes,exportPlan,noteTemplate,previewEntry,notePreview,setExportScope,setExcludePending,setIncludeDuplicates,setIncludeNotes,setNoteTemplate,setNotePreviewId,setError,onExport,onClose}: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: "center" }); }, []);
  return (
<section className="panel" aria-label="导出前检查" style={{ padding: "1rem", marginBlock: "1rem" }}>
            <h3 ref={heading} tabIndex={-1}>导出前检查</h3>
            <p className="hint">每包包含说明、结果 CSV、Library 与 Originals；同一本书与笔记、原件保持在一起。多包下载时，请允许浏览器下载多个文件。</p>
            <label>导出范围 <select disabled={exporting} value={exportScope} onChange={event => setExportScope(event.target.value as typeof exportScope)}><option value="all">全部书籍</option><option value="selected">勾选书籍（{selectedCount} 本）</option><option value="filtered">当前列表（含视图与筛选）</option><option value="failed" disabled={!hasFailures}>上次失败项（使用当前书目）</option></select></label>
            <p><label><input type="checkbox" disabled={exporting} checked={excludePending} onChange={event => setExcludePending(event.target.checked)} />本次排除待审核书籍</label>　<label><input type="checkbox" disabled={exporting} checked={includeDuplicates} onChange={event => setIncludeDuplicates(event.target.checked)} />包含重复副本</label>　<label><input type="checkbox" disabled={exporting} checked={includeNotes} onChange={event => setIncludeNotes(event.target.checked)} />为保留书籍生成 Markdown 笔记</label></p>
            <p role="status">当前选择 {exportPlan.summary.selected} 本；计划打包 {exportPlan.summary.files} 本，其中重复副本 {exportPlan.summary.duplicates} 本；笔记 {exportPlan.summary.notes} 篇；新增封面 {exportPlan.summary.generatedCovers} 本；排除 {exportPlan.summary.skipped} 本。源文件合计 {formatBytes(exportPlan.summary.sourceBytes)}；预计打包内容 {formatBytes(exportPlan.summary.packageBytes)}，预计 {exportPlan.summary.parts} 个 ZIP，超过每包 256 MiB 时自动分包。</p>
            <p className="hint">仍有 {exportPlan.summary.pending} 本待审核；{exportPlan.adjustedNames} 个输出名称已做长度、非法字符或重名处理，完整书名与作者保留在笔记和记录中。导出新 ZIP 不会覆盖您已编辑的本地笔记。</p>
            {exportPlan.issues.length ? <details><summary>查看缺失、冲突及解析问题（{exportPlan.issues.length} 本）</summary><ul>{exportPlan.issues.map(issue => <li key={issue.id}>{issue.name}：{issue.reasons.join("；")}</li>)}</ul></details> : null}
            <details><summary>查看实际打包路径</summary><ul style={{ maxHeight: 220, overflow: "auto" }}>{exportPlan.entries.map(entry => <li key={entry.book.id}>{entry.book.originalName} → {entry.path || entry.skipReason}{entry.notePath ? `；${entry.notePath}` : ""}</li>)}</ul></details>
            {includeNotes ? <details><summary>笔记模板与预览</summary>
              <p className="hint">模板填写书目，阅读内容由你补充。可用变量：{noteVariables.map(name => `{{${name}}}`).join("、")}。链接与 ID 按需加入 {"{{FILE_LINK}}"}、{"{{BOOK_ID}}"}。</p>
              <label>导入 Markdown 模板 <input type="file" accept=".md,.txt" disabled={exporting} onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = "";
                if (!file) return;
                try { if (file.size > 2 * 1024 * 1024) throw new Error("模板不能超过 2 MB"); setNoteTemplate(prepareNoteTemplate(await file.text())); }
                catch (error) { setError(String(error)); }
              }} /></label>
              <label style={{ display: "block" }}>模板内容<textarea aria-label="Markdown 模板内容" rows={10} className="search" style={{ width: "100%", boxSizing: "border-box", minHeight: 200, resize: "vertical", fontFamily: "monospace" }} disabled={exporting} value={noteTemplate} onChange={event => setNoteTemplate(event.target.value)} /></label>
              <button className="btn btn-ghost" disabled={exporting} onClick={() => setNoteTemplate(prepareNoteTemplate(defaultNoteTemplate))}>恢复默认阅读模板</button>
              <label>预览书籍 <select style={{ maxWidth: "100%" }} disabled={exporting} value={previewEntry?.book.id ?? ""} onChange={event => setNotePreviewId(event.target.value)}>{exportPlan.entries.filter(entry => entry.notePath).map(entry => <option key={entry.book.id} value={entry.book.id}>{entry.book.resolvedTitle || entry.book.originalName}</option>)}</select></label>
              <pre aria-label="Markdown 笔记预览" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 320, overflow: "auto" }}>{notePreview}</pre>
            </details> : null}
            {exportPlan.blockers.map(blocker => <p role="alert" key={blocker}>{blocker}</p>)}
            <div className="actions"><button className="btn btn-primary" disabled={exporting || busy || !storageReady || !exportPlan.summary.files || !!exportPlan.blockers.length} onClick={onExport}>确认导出 {exportPlan.summary.files} 本与 {exportPlan.summary.notes} 篇笔记</button><button className="btn btn-ghost" disabled={exporting} onClick={onClose}>收起</button></div>
          </section>
  );
}

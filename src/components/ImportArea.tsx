import type { ReactNode, RefObject } from "react";
import { filesFromInput } from "../lib/files";
interface Props {
  bookCount: number; busy: boolean; exporting: boolean; storageReady: boolean;
  olProgress: string | null; progress: {done:number; total:number; current:string} | null;
  children?: ReactNode;
  coverBatchRunning: boolean; canCancel: boolean; storageStatus: string;
  fileRef: RefObject<HTMLInputElement | null>; folderRef: RefObject<HTMLInputElement | null>;
  onCancel: () => void; onRetrySave: () => void;
  csvDownloading: boolean; exportCsv: () => void; onReviewExport: () => void;
  ingest: (files: ReturnType<typeof filesFromInput>) => Promise<void>;
}
export function ImportArea({bookCount, busy, exporting, storageReady, coverBatchRunning, canCancel, storageStatus, fileRef, folderRef, onCancel, onRetrySave, csvDownloading, exportCsv, onReviewExport, ingest, children}: Props) {
  return (
    <>
<nav className="import-bar" aria-label="书库操作">
        <div className="workspace-identity"><strong>Folio</strong><span>{bookCount} 本</span></div>
        <div className="workspace-actions">
          <div className="workspace-export" role="group" aria-label="导出文件">
            <button type="button" className="btn btn-secondary" disabled={!bookCount || csvDownloading || busy || exporting || !storageReady} onClick={exportCsv}>{csvDownloading ? "已发起下载" : "导出 CSV"}</button>
            <button type="button" className="btn btn-primary" aria-label="检查并导出书库与笔记" title="检查并导出书库与笔记" disabled={!bookCount || exporting || busy || !storageReady} onClick={onReviewExport}>{exporting ? "打包中…" : "检查并导出"}</button>
          </div>
        </div>
        {(busy || exporting) && !coverBatchRunning && canCancel ? <button className="btn btn-ghost workspace-cancel" onClick={onCancel}>停止任务</button> : null}
        {children}
      </nav>
      <div className="storage-status" role="status">
        <p>{storageStatus}</p>
        <p className="hint">书库保存在当前浏览器，清除网站数据会移除记录与文件。请保留原件或导出备份。</p>
        {storageStatus.startsWith("保存失败") ? <button className="btn btn-secondary" onClick={onRetrySave}>重试保存</button> : null}
        {!storageReady && storageStatus.startsWith("恢复失败") ? <button className="btn btn-secondary" onClick={() => window.location.reload()}>重新恢复</button> : null}
      </div>
      <header className="header">
        <div>
          <p className="kicker">Folio</p>
          <h1>书籍整理工作台</h1>
          <p className="lead">
            整理 EPUB 与 PDF，核对书目、命名与重复项。文件在本机处理，不上传。
          </p>
        </div>
        <p className="hint">导入 · 核对 · 导出</p>
      </header>

      <section className={`panel intake-panel ${bookCount ? "has-books" : "is-empty"}`} aria-label="添加书籍">
        <div className={bookCount ? "intake-content" : "drop"}>
        {!bookCount ? <h2>添加书籍，开始整理</h2> : <h2>继续添加书籍</h2>}
        <p>拖入文件或文件夹，也可点击添加。支持 EPUB、PDF；MD 自动转为 PDF。</p>
        {!bookCount ? <p className="intake-note">分批添加会保留已有书籍；MD 图片请随文件夹一起导入。</p> : null}
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy || exporting || !storageReady} onClick={() => fileRef.current?.click()}>添加书籍</button>
          <button type="button" className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={() => folderRef.current?.click()}>添加文件夹</button>
        </div>
        </div>
      </section>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden-input"
            onChange={(e) => {
              void ingest(filesFromInput(e.target.files));
              e.target.value = "";
            }}
          />
          <input
            ref={(element) => { folderRef.current = element; element?.setAttribute("webkitdirectory", ""); }}
            type="file"
            multiple
            className="hidden-input"
            onChange={(e) => {
              void ingest(filesFromInput(e.target.files));
              e.target.value = "";
            }}
          />
    </>
  );
}

import type { RefObject } from "react";
import { filesFromInput } from "../lib/files";
interface Props {
  bookCount: number; busy: boolean; exporting: boolean; storageReady: boolean;
  olProgress: string | null; progress: {done:number; total:number; current?:string} | null;
  coverBatchRunning: boolean; canCancel: boolean; storageStatus: string; over: boolean;
  fileRef: RefObject<HTMLInputElement | null>; folderRef: RefObject<HTMLInputElement | null>;
  onCancel: () => void; onRetrySave: () => void; onClear: () => void;
  ingest: (files: ReturnType<typeof filesFromInput>) => Promise<void>;
}
export function ImportArea({bookCount, busy, exporting, storageReady, olProgress, progress, coverBatchRunning, canCancel, storageStatus, over, fileRef, folderRef, onCancel, onRetrySave, onClear, ingest}: Props) {
  return (
    <>
<div className="import-bar">
        <strong>Folio · {bookCount} 本</strong>
        <span>拖入页面任意位置追加</span>
        <button type="button" className="btn btn-primary" disabled={busy || exporting || !storageReady} onClick={() => fileRef.current?.click()}>添加书籍</button>
        <button type="button" className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={() => folderRef.current?.click()}>添加文件夹</button>
        {busy ? <span role="status">{olProgress || `正在处理 ${progress?.done ?? 0}/${progress?.total ?? 0}`}</span> : null}
        {(busy || exporting) && !coverBatchRunning && canCancel ? <button className="btn btn-ghost" onClick={onCancel}>停止任务</button> : null}
      </div>
      <div className="storage-status" role="status">
        <p>{storageStatus}</p>
        <p className="hint">书籍文件与封面保存在当前浏览器。清除网站数据会移除书库；不同浏览器或网址不共享。请保留导出备份。</p>
        {storageStatus.startsWith("保存失败") ? <button className="btn btn-secondary" onClick={onRetrySave}>重试保存</button> : null}
        {!storageReady && storageStatus.startsWith("恢复失败") ? <button className="btn btn-secondary" onClick={() => window.location.reload()}>重新恢复</button> : null}
      </div>
      <header className="header">
        <div>
          <p className="kicker">Folio</p>
          <h1>书籍整理工作台</h1>
          <p className="lead">
            依次读取内部元数据、按书名与作者命名、再按指纹与书目去重。文件只在本机浏览器处理，不会上传。
          </p>
        </div>
        <p className="hint">导入 → 整理与审核 → 检查并导出</p>
      </header>

      <div className={`panel import-panel ${bookCount ? "has-books" : ""}`}>
        <div className={over ? "drop over" : "drop"}>
          <h2>导入书籍，自动识别格式</h2>
          <p>可分批追加 EPUB、PDF、MD 或整个文件夹，已有书籍会保留。MD 自动转换为 PDF；本地图片请随文件夹一起导入。</p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || exporting || !storageReady}
              onClick={() => fileRef.current?.click()}
            >
              选择书籍文件
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || exporting || !storageReady}
              onClick={() => folderRef.current?.click()}
            >
              选择文件夹
            </button>
            {bookCount > 0 ? (
              <button type="button" className="btn btn-ghost" disabled={busy || exporting || !storageReady} onClick={onClear}>
                清空本地书库
              </button>
            ) : null}
          </div>
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
        </div>
      </div>
    </>
  );
}

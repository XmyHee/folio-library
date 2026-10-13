import type { Dispatch, SetStateAction } from "react";
interface Props {
  bookCount: number; namingMode: 1 | 2; setNamingMode: Dispatch<SetStateAction<1 | 2>>;
  useOnlineMeta: boolean; setUseOnlineMeta: Dispatch<SetStateAction<boolean>>;
  busy: boolean; exporting: boolean; storageReady: boolean; csvDownloading: boolean;
  retryCatalog: () => Promise<void>; exportCsv: () => void; onReviewExport: () => void;
}
export function RulesContainer({bookCount, namingMode, setNamingMode, useOnlineMeta, setUseOnlineMeta,
  busy, exporting, storageReady, csvDownloading, retryCatalog, exportCsv, onReviewExport}: Props) {
  return (
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
      {bookCount ? <button type="button" className="btn btn-ghost" disabled={busy || exporting || !storageReady || !useOnlineMeta} onClick={() => void retryCatalog()}>补全 / 重试当前列表</button> : null}
    </div>
    {bookCount ? <div className="actions" style={{ marginTop: 0, justifyContent: "flex-start" }}>
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
        onClick={onReviewExport}
      >
        {exporting ? "打包中…" : "检查并导出书库与笔记"}
      </button>
    </div> : null}
  </section>
  );
}

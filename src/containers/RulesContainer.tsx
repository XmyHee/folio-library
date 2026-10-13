import type { Dispatch, SetStateAction } from "react";
interface Props {
  bookCount: number; namingMode: 1 | 2; setNamingMode: Dispatch<SetStateAction<1 | 2>>;
  useOnlineMeta: boolean; setUseOnlineMeta: Dispatch<SetStateAction<boolean>>;
  busy: boolean; exporting: boolean; storageReady: boolean;
  retryCatalog: () => Promise<void>; onClear: () => void;
}
export function RulesContainer({bookCount, namingMode, setNamingMode, useOnlineMeta, setUseOnlineMeta,
  busy, exporting, storageReady, retryCatalog, onClear}: Props) {
  return (
  <section className="toolbar" aria-label="整理规则">
    <div className="section-heading"><h2>整理规则</h2></div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
      <div className="seg">
        <button
          type="button"
          className={namingMode === 1 ? "active" : ""}
          aria-pressed={namingMode === 1}
          onClick={() => setNamingMode(1)}
        >
          书名与作者
        </button>
        <button
          type="button"
          className={namingMode === 2 ? "active" : ""}
          aria-pressed={namingMode === 2}
          onClick={() => setNamingMode(2)}
        >
          附丛书名
        </button>
      </div>
      <label className="toggle" title="仅向 Google Books / Open Library 发送 ISBN，不上传书籍文件">
        <input
          type="checkbox"
          checked={useOnlineMeta}
          disabled={busy || exporting || !storageReady}
          onChange={(e) => setUseOnlineMeta(e.target.checked)}
        />
        联网补全书目（ISBN）
      </label>
      {bookCount ? <button type="button" className="btn btn-ghost" disabled={busy || exporting || !storageReady || !useOnlineMeta} onClick={() => void retryCatalog()}>补全当前列表</button> : null}
    </div>
    {bookCount ? <div className="library-maintenance"><button type="button" className="btn btn-ghost" disabled={busy || exporting || !storageReady} onClick={onClear}>清空本地书库</button></div> : null}
  </section>
  );
}

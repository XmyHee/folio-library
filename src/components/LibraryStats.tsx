import type { PipelineResult } from "../lib/types";
interface Props { stats: PipelineResult["stats"]; }
export function LibraryStats({ stats }: Props) {
  return (
<div className="stats">
            <div className="stat">
              <label>已扫描</label>
              <strong>{stats.total}</strong>
            </div>
            <div className="stat">
              <label>将重命名</label>
              <strong>{stats.willRename}</strong>
            </div>
            <div className="stat">
              <label>重复组</label>
              <strong>{stats.duplicateGroups}</strong>
            </div>
            <div className="stat">
              <label>将隔离</label>
              <strong>{stats.toIsolate}</strong>
            </div>
            <div className="stat">
              <span>Open Library</span>
              <strong>{stats.fromOpenLibrary}</strong>
            </div>
            <div className="stat">
              <span>书内元数据</span>
              <strong>{stats.fromInternal}</strong>
            </div>
            <div className="stat">
              <span>文件名</span>
              <strong>{stats.fromFilename}</strong>
            </div>
          </div>
  );
}

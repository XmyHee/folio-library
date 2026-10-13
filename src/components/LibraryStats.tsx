import type { PipelineResult } from "../lib/types";
interface Props { stats: PipelineResult["stats"]; }
export function LibraryStats({ stats }: Props) {
  return (
<div className="stats">
            <div className="stat">
              <label>书籍总数</label>
              <strong>{stats.total}</strong>
            </div>
            <div className="stat">
              <label>待命名</label>
              <strong>{stats.willRename}</strong>
            </div>
            <div className="stat">
              <label>重复组</label>
              <strong>{stats.duplicateGroups}</strong>
            </div>
            <div className="stat">
              <label>重复副本</label>
              <strong>{stats.toIsolate}</strong>
            </div>
            <div className="stat">
              <span>在线书目</span>
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

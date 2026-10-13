import type { ExportProgress } from "../lib/export";

export interface TaskProgressProps {
  busy: boolean;
  exporting: boolean;
  progress: { done: number; total: number; current: string } | null;
  exportProgress: ExportProgress | null;
  olProgress: string | null;
  coverBatchRunning: boolean;
}

/** Stage-local measurements only: file counts never pretend to be elapsed-time estimates. */
export function TaskProgress({ busy, exporting, progress, exportProgress, olProgress, coverBatchRunning }: TaskProgressProps) {
  if (!busy && !exporting) return null;
  const source = exporting ? exportProgress : olProgress ? null : progress;
  const zip = exporting && exportProgress?.zipPercent !== undefined;
  const total = source?.total ?? 0;
  const done = Math.min(total, Math.max(0, source?.done ?? 0));
  const percent = zip ? Math.min(100, Math.max(0, exportProgress!.zipPercent!))
    : total > 0 ? done / total * 100 : undefined;
  const title = exporting ? zip ? "生成 ZIP" : "准备导出文件"
    : olProgress ? "联网补全书目" : coverBatchRunning ? "生成封面"
    : progress ? /\.(?:md|markdown)$/i.test(progress.current) ? "MD 转 PDF / 读取信息" : "读取书籍信息"
    : "正在处理";
  const measurement = zip ? `${Math.floor(percent!)}%` : total > 0 ? `已处理 ${done} / ${total}` : "处理中";
  return <section className="task-progress" aria-label="当前任务" aria-busy="true">
    <div className="task-progress-heading" role="status" aria-live="polite" aria-atomic="true">
      <strong>{title}</strong><span>{measurement}</span>
    </div>
    <div className="task-progress-track" role="progressbar" aria-label={title}
      aria-valuemin={0} aria-valuemax={zip ? 100 : total > 0 ? total : 100}
      aria-valuenow={percent === undefined ? undefined : zip ? Math.floor(percent) : done}
      aria-valuetext={measurement}>
      {percent !== undefined ? <span className="task-progress-fill" style={{ width: `${percent}%` }} /> : null}
      <span className="task-progress-running" aria-hidden="true" />
    </div>
    <p className="task-progress-current" title={olProgress || source?.current || undefined}>
      {olProgress || source?.current || "正在完成当前步骤"}
    </p>
    <p className="task-progress-hint">大文件可能需要较长时间，请保持页面打开。</p>
  </section>;
}

import type { ExportReport } from "../lib/export";
interface Props { exportReport:ExportReport; exporting:boolean; busy:boolean; onRetry:()=>void; }
export function ExportResultPanel({exportReport, exporting, busy, onRetry}: Props) {
  return (
<section className="panel" aria-label="上次导出结果" style={{ padding: "1rem", marginBlock: "1rem" }}>
            <p role="status">上次导出：成功 {exportReport.succeeded} 本，失败 {exportReport.failed} 本，排除 {exportReport.skipped} 本。ZIP 已发起下载，请核对保存结果。</p>
            {exportReport.failed ? <><ul>{exportReport.records.filter(record => record.status === "failed").map(record => <li key={record.id}>{record.originalName}：{record.reason}</li>)}</ul><button className="btn btn-secondary" disabled={exporting || busy} onClick={onRetry}>检查并重试失败项</button></> : null}
          </section>
  );
}

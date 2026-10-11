import JSZip from "jszip";
import type { DerivedBook } from "./types";
import { reviewReasons, isReviewed, needsReview } from "./review";
import { createExportPlan } from "./export-plan";
import type { ExportOptions } from "./export-plan";
import { renderBookNote, noteTitle, noteAuthors } from "./notes";

function csvCell(value: string | number | undefined | null): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function formatLabel(book: DerivedBook): string {
  if (book.kind === "pdf") return "PDF";
  if (book.kind === "epub") return "EPUB";
  const n = (book.originalName || "").toLowerCase();
  if (n.endsWith(".pdf")) return "PDF";
  if (n.endsWith(".epub")) return "EPUB";
  return book.kind || "";
}

export function toAuditCsv(books: DerivedBook[]): string {
  const header = [
    "格式",
    "原始文件名",
    "相对路径",
    "书名",
    "作者",
    "出版社",
    "语言",
    "ISBN/标识",
    "出版日期",
    "丛书",
    "建议文件名",
    "去重结果",
    "元数据来源",
    "文件大小",
    "SHA-256",
    "状态",
    "识别提示",
    "审核状态",
    "审核原因",
    "信息状态",
  ];
  const lines = [header.join(",")];
  for (const b of books) {
    const role =
      b.role === "keep"
        ? "保留最佳"
        : b.role === "duplicate"
          ? "重复副本"
          : b.role === "identical"
            ? "完全相同"
            : "唯一";
    const meta =
      b.metaSource === "manual" ? "人工校正" : b.metaSource === "markdown" ? "Markdown 元数据" : b.metaSource === "openlibrary"
        ? "在线书目"
        : b.metaSource === "epub"
          ? "EPUB内置"
          : b.metaSource === "pdf"
            ? "PDF内置"
            : b.metaSource === "filename"
              ? "文件名"
              : b.metaSource || "";
    lines.push(
      [
        formatLabel(b),
        b.originalName,
        b.relativePath,
        b.resolvedTitle || b.rawTitle || (b.status === "error" ? "读取解析失败" : "【缺失书名】"),
        (b.resolvedAuthors ?? b.authors).join("; ") || "【缺失作者】",
        b.publisher,
        b.language,
        b.identifiers.join("; "),
        b.date,
        b.series,
        b.proposedName,
        role,
        meta,
        b.size,
        b.hash,
        b.status === "ok" ? "OK" : (b.error ?? "ERROR"),
        b.warnings?.join("; ") ?? "",
        isReviewed(b) ? "已人工审核" : needsReview(b) ? "待审核" : "未人工确认",
        reviewReasons(b).join("; "),
        reviewReasons(b).length ? "待补全 / 有异常" : "无已知异常",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return "\uFEFF" + lines.join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadCsv(books: DerivedBook[]) {
  downloadBlob(new Blob([toAuditCsv(books)], { type: "text/csv;charset=utf-8" }), "folio-audit.csv");
}

export type ExportRecord = {
  id: string; originalName: string; proposedName: string; status: "success" | "failed" | "skipped"; reason?: string;
  file?: string; note?: string; original?: string; sourceSha256?: string; outputSha256?: string;
  title?: string; authors?: string[]; noteSha256?: string;
  publisher?: string; language?: string; identifiers?: string; date?: string; series?: string; reviewStatus?: string; reviewReasons?: string; warnings?: string; informationStatus?: string;
};
export type ExportReport = { records: ExportRecord[]; succeeded: number; failed: number; skipped: number };
export type ExportProgress = { done: number; total: number; current: string; zipPercent?: number };

export function toExportResultCsv(report: ExportReport): string {
  const rows = [["书籍ID", "完整书名", "完整作者", "原始文件名", "建议文件名", "结果", "原因", "书籍路径", "笔记路径", "原件路径", "原件SHA256", "输出SHA256", "笔记SHA256", "出版社", "语言", "ISBN/标识", "出版日期", "丛书", "审核状态", "审核原因", "识别提示", "信息状态"]];
  for (const record of report.records) rows.push([record.id, record.title ?? "", record.authors?.join("; ") ?? "", record.originalName, record.proposedName, { success: "成功", failed: "失败", skipped: "排除" }[record.status], record.reason ?? "", record.file ?? "", record.note ?? "", record.original ?? "", record.sourceSha256 ?? "", record.outputSha256 ?? "", record.noteSha256 ?? "", record.publisher ?? "", record.language ?? "", record.identifiers ?? "", record.date ?? "", record.series ?? "", record.reviewStatus ?? "", record.reviewReasons ?? "", record.warnings ?? "", record.informationStatus ?? ""]);
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\n");
}

/** Build the complete package before requesting a browser download; per-book failures stay explicit. */
export async function buildLibraryZip(books: DerivedBook[], opts: ExportOptions, onProgress?: (progress: ExportProgress) => void, signal?: AbortSignal) {
  const checkCancelled = () => { if (signal?.aborted) throw new Error("导出已取消，未下载文件"); };
  checkCancelled();
  const plan = createExportPlan(books, opts);
  if (plan.blockers.length) throw new Error(plan.blockers.join("；"));
  const zip = new JSZip();
  zip.folder("Library");
  zip.folder("Originals");
  const records: ExportRecord[] = [];
  const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>))).map(b => b.toString(16).padStart(2, "0")).join("");
  for (const entry of plan.entries) {
    checkCancelled();
    const { book } = entry;
    const record: ExportRecord = { id: book.id, title: noteTitle(book), authors: noteAuthors(book), originalName: book.originalName, proposedName: book.proposedName, status: "skipped", reason: entry.skipReason };
    Object.assign(record, { publisher: book.publisher, language: book.language, identifiers: book.identifiers.join("; "), date: book.date, series: book.series, reviewStatus: isReviewed(book) ? "已人工审核" : needsReview(book) ? "待审核" : "未人工确认", reviewReasons: reviewReasons(book).join("; "), warnings: book.warnings?.join("; ") ?? "", informationStatus: reviewReasons(book).length ? "待补全 / 有异常" : "无已知异常" });
    if (!entry.path) { records.push(record); continue; }
    onProgress?.({ done: records.length, total: plan.entries.length, current: book.originalName });
    try {
      const source = new Uint8Array(await book.file.arrayBuffer());
      const duplicate = entry.path.startsWith("Originals/Duplicates/");
      const output = duplicate ? source : await (await import("./embed-cover")).embedCover(book);
      const note = entry.notePath ? renderBookNote(book, opts.noteTemplate!, entry.path, entry.notePath) : undefined;
      const originals:{path:string;bytes:Uint8Array;hash:string}[]=[];
      for(const item of entry.sourceFiles??[]){
        checkCancelled();
        const bytes=new Uint8Array(await item.file.arrayBuffer()),hash=await digest(bytes);
        if(item.hash&&hash!==item.hash)throw new Error("Markdown 原件或附件校验不一致："+item.path);
        originals.push({path:item.path,bytes,hash});
      }
      const sourceSha256 = originals.find(item=>item.path===entry.originalPath)?.hash ?? await digest(source), outputSha256 = await digest(output);
      const noteSha256 = note !== undefined ? await digest(new TextEncoder().encode(note)) : undefined;
      checkCancelled();
      // Commit this book only after all its data, note and hashes have been prepared.
      zip.file(entry.path, output);
      if (entry.originalPath && !entry.sourceFiles) zip.file(entry.originalPath, source);
      for(const item of originals)zip.file(item.path,item.bytes);
      if (entry.notePath && note !== undefined) zip.file(entry.notePath, note);
      Object.assign(record, { status: "success", reason: undefined, file: entry.path, note: entry.notePath, original: entry.originalPath, sourceSha256, outputSha256, noteSha256 });
    } catch (error) { record.status = "failed"; record.reason = String(error); }
    checkCancelled();
    records.push(record);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const report: ExportReport = { records, succeeded: records.filter(r => r.status === "success").length, failed: records.filter(r => r.status === "failed").length, skipped: records.filter(r => r.status === "skipped").length };
  zip.file("folio-export-result.csv", toExportResultCsv(report));
  zip.file("README.md", `# Folio 整理包\n\n成功 ${report.succeeded} 本；失败 ${report.failed} 本；排除 ${report.skipped} 本。\n\n- Library：整理后的书籍；阅读笔记位于 Library/Notes（启用笔记时）。\n- Originals：原始 Markdown 与引用图片，以及生成封面前的原文件；保留的重复副本位于 Originals/Duplicates。没有原件时该文件夹为空。\n- folio-export-result.csv：完整书名、作者、实际输出路径、校验值及成功、失败、排除原因。\n\n不导出 JSON 或模板副本。笔记仅按模板填写书目，阅读分析仍待填写。模板加入 {{FILE_LINK}} 可链接书籍；请保持文件夹结构。\n\n重新导出生成新的 ZIP，不覆盖本地笔记。请核对 CSV 及浏览器下载记录。\n`);
  try {
    let lastZipPercent = -1;
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "STORE",
      mimeType: "application/zip",
      streamFiles: true,
    }, metadata => {
      checkCancelled();
      const percent = Math.floor(metadata.percent);
      if (percent !== lastZipPercent) { lastZipPercent = percent; onProgress?.({ done: plan.entries.length, total: plan.entries.length, current: "生成 ZIP", zipPercent: percent }); }
    });
    checkCancelled();
    return { blob, report };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/array buffer allocation failed|out of memory|oom/i.test(msg)) {
      throw new Error(
        "导出时内存不足。请取消「ZIP 中保留重复副本」，或分批导入后再导出。",
      );
    }
    throw err;
  }
}

export async function downloadLibraryZip(books: DerivedBook[], opts: ExportOptions, onProgress?: (progress: ExportProgress) => void, signal?: AbortSignal) {
  const result = await buildLibraryZip(books, opts, onProgress, signal);
  if (signal?.aborted) throw new Error("导出已取消，未下载文件");
  downloadBlob(result.blob, result.report.failed ? "folio-library-partial.zip" : "folio-library.zip");
  return result.report;
}

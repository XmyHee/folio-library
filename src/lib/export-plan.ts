import type { DerivedBook } from "./types";
import { noteAuthors, noteTitle, unknownNoteVariables, renderBookNote } from "./notes";
import { needsReview, reviewReasons } from "./review";

export type ExportOptions = { includeDuplicates: boolean; includeNotes?: boolean; noteTemplate?: string; excludePending?: boolean };
export type ExportEntry = { book: DerivedBook; path?: string; notePath?: string; originalPath?: string; skipReason?: string };
export function safeExportName(name: string): string {
  let safe = name.normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_").replace(/[. ]+$/, "").trim();
  if (!safe || /^\.+$/.test(safe)) safe = "未命名";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = "_" + safe;
  // Limit only the filename; full title/authors remain in note content and CSV.
  if (safe.length > 180) { const ext = safe.match(/\.[^.]{1,8}$/)?.[0] ?? ""; safe = safe.slice(0, 165).replace(/[\uD800-\uDBFF]$/, "") + ext; }
  return safe;
}
export function createExportPlan(books: DerivedBook[], options: ExportOptions) {
  const taken = new Set<string>();
  let adjustedNames = 0;
  function reserve(folder: string, name: string): string {
    const base = safeExportName(name), ext = base.match(/\.[^.]+$/)?.[0] ?? "", stem = ext ? base.slice(0, -ext.length) : base;
    let candidate = base, suffix = 1;
    while (taken.has((folder + candidate).normalize("NFKC").toLowerCase())) candidate = `${stem} (${++suffix})${ext}`;
    if (candidate !== name) adjustedNames++;
    const path = folder + candidate; taken.add(path.normalize("NFKC").toLowerCase()); return path;
  }
  const entries: ExportEntry[] = books.map((book, index) => {
    if (options.excludePending && needsReview(book)) return { book, skipReason: "本次排除待审核书籍" };
    if (book.kind !== "pdf" && book.kind !== "epub") return { book, skipReason: "不支持的文件格式" };
    const duplicate = book.role === "duplicate" || book.role === "identical";
    if (duplicate && !options.includeDuplicates) return { book, skipReason: "本次不包含重复副本" };
    const path = duplicate ? reserve(`Originals/Duplicates/${index + 1}-${safeExportName(book.id)}/`, book.originalName) : reserve("Library/", book.proposedName);
    const notePath = !duplicate && options.includeNotes ? reserve("Library/Notes/", `${noteTitle(book)}${noteAuthors(book).length ? " - " + noteAuthors(book).join(" & ") : ""}.md`) : undefined;
    const originalPath = !duplicate && book.coverPreference === "title" ? reserve(`Originals/${index + 1}-${safeExportName(book.id)}/`, book.originalName) : undefined;
    return { book, path, notePath, originalPath };
  });
  const included = entries.filter(entry => entry.path);
  const issues = included.map(entry => {
    const reasons = [...reviewReasons(entry.book)];
    if (entry.originalPath && !entry.book.titleCoverBlob) reasons.push("生成封面缺失，请重新生成或恢复原文首页");
    if (!(entry.book.file instanceof Blob)) reasons.push("原文件不可用");
    return { id: entry.book.id, name: entry.book.originalName, reasons };
  }).filter(issue => issue.reasons.length);
  const blockers = options.includeNotes ? (!options.noteTemplate?.trim() ? ["Markdown 模板不能为空"] : unknownNoteVariables(options.noteTemplate).map(name => "未知模板变量：" + name)) : [];
  const firstNote = included.find(entry => entry.notePath);
  if (!blockers.length && firstNote && options.noteTemplate) {
    try { renderBookNote(firstNote.book, options.noteTemplate, firstNote.path!, firstNote.notePath); }
    catch (error) { blockers.push(String(error)); }
  }
  return { entries, blockers, adjustedNames,
    summary: { selected: books.length, files: included.length, notes: included.filter(e => e.notePath).length, duplicates: included.filter(e => e.path!.startsWith("Originals/Duplicates/")).length,
      generatedCovers: included.filter(e => e.originalPath).length, skipped: entries.length - included.length, pending: included.filter(e => needsReview(e.book)).length, sourceBytes: included.reduce((sum,e)=>sum+e.book.size,0) },
    issues,
  };
}

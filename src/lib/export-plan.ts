import type { DerivedBook } from "./types";
import { noteAuthors, noteTitle, unknownNoteVariables, renderBookNote } from "./notes";
import { needsReview, reviewReasons } from "./review";

export const MAX_ZIP_BYTES = 256 * 1024 * 1024;
export const ZIP_SIZE_MESSAGE = "单次打包超过 256 MiB 安全范围，请勾选较少书籍分批导出，或取消包含重复副本。";

export type ExportOptions = { includeDuplicates: boolean; includeNotes?: boolean; noteTemplate?: string; excludePending?: boolean };
export type ExportEntry = { book: DerivedBook; path?: string; notePath?: string; originalPath?: string; sourceFiles?: {path:string;file:Blob;hash?:string}[]; skipReason?: string };
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
    if (book.markdownSource && book.status !== "ok") return {book,skipReason:"Markdown 转换失败，请重新导入后导出"};
    if (book.kind !== "pdf" && book.kind !== "epub") return { book, skipReason: "不支持的文件格式" };
    const duplicate = book.role === "duplicate" || book.role === "identical";
    if (duplicate && !options.includeDuplicates) return { book, skipReason: "本次不包含重复副本" };
    const path = duplicate ? reserve(`Originals/Duplicates/${index + 1}-${safeExportName(book.id)}/`, book.markdownSource ? book.proposedName : book.originalName) : reserve("Library/", book.proposedName);
    const notePath = !duplicate && options.includeNotes ? reserve("Library/Notes/", `${noteTitle(book)}${noteAuthors(book).length ? " - " + noteAuthors(book).join(" & ") : ""}.md`) : undefined;
    let originalPath = !book.markdownSource && !duplicate && book.coverPreference === "title" ? reserve(`Originals/${index + 1}-${safeExportName(book.id)}/`, book.originalName) : undefined;
    const sourceFiles:NonNullable<ExportEntry["sourceFiles"]>=[];
    if(book.markdownSource){
      const source=book.markdownSource,root=`Originals/${index+1}-${safeExportName(book.id)}/`;
      const original=(relative:string)=>{const parts=relative.replace(/\\/g,"/").split("/");if(parts.some(part=>part===".."))throw new Error("原件路径不能越过导出目录");const name=parts.pop()!;return reserve(root+parts.filter(Boolean).map(safeExportName).join("/")+(parts.filter(Boolean).length?"/":""),name);};
      originalPath=original(source.path);
      sourceFiles.push({path:originalPath,file:source.file,hash:source.hash},...source.assets.map(asset=>({path:original(asset.path),file:asset.file,hash:asset.hash})));
      if(!duplicate&&book.coverPreference==="title")sourceFiles.push({path:reserve(root,"before-cover.pdf"),file:book.file});
    }
    return { book, path, notePath, originalPath, ...(sourceFiles.length?{sourceFiles}: {}) };
  });
  const included = entries.filter(entry => entry.path);
  const issues = included.map(entry => {
    const reasons = [...reviewReasons(entry.book)];
    if (entry.book.coverPreference === "title" && !entry.book.titleCoverBlob) reasons.push("生成封面缺失，请重新生成或恢复原文首页");
    if (!(entry.book.file instanceof Blob)) reasons.push("原文件不可用");
    return { id: entry.book.id, name: entry.book.originalName, reasons };
  }).filter(issue => issue.reasons.length);
  const blockers = options.includeNotes ? (!options.noteTemplate?.trim() ? ["Markdown 模板不能为空"] : unknownNoteVariables(options.noteTemplate).map(name => "未知模板变量：" + name)) : [];
  const firstNote = included.find(entry => entry.notePath);
  if (!blockers.length && firstNote && options.noteTemplate) {
    try { renderBookNote(firstNote.book, options.noteTemplate, firstNote.path!, firstNote.notePath); }
    catch (error) { blockers.push(String(error)); }
  }
  // Count every physical package copy, including retained originals and Markdown images.
  let packageBytes = 0;
  for (const entry of included) {
    const fileBytes = entry.book.file instanceof Blob ? entry.book.file.size : 0;
    packageBytes += fileBytes;
    if (entry.originalPath && !entry.sourceFiles) packageBytes += fileBytes;
    for (const item of entry.sourceFiles ?? []) packageBytes += item.file.size;
    if (entry.book.coverPreference === "title" && !entry.path!.startsWith("Originals/Duplicates/")) packageBytes += (entry.book.titleCoverBlob?.size ?? 0) + 1024 * 1024;
    if (entry.notePath && options.noteTemplate && !blockers.length) {
      try { packageBytes += new TextEncoder().encode(renderBookNote(entry.book, options.noteTemplate, entry.path!, entry.notePath)).length; }
      catch (error) { blockers.push(String(error)); }
    }
  }
  if (packageBytes > MAX_ZIP_BYTES) blockers.push(ZIP_SIZE_MESSAGE);
  return { entries, blockers, adjustedNames,
    summary: { selected: books.length, files: included.length, notes: included.filter(e => e.notePath).length, duplicates: included.filter(e => e.path!.startsWith("Originals/Duplicates/")).length,
      generatedCovers: included.filter(e => e.book.coverPreference === "title" && !e.path?.startsWith("Originals/Duplicates/")).length, skipped: entries.length - included.length, pending: included.filter(e => needsReview(e.book)).length, packageBytes, sourceBytes: included.reduce((sum,e)=>sum+e.book.size,0) },
    issues,
  };
}

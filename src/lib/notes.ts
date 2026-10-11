import type { DerivedBook } from "./types";
import { isReviewed, needsReview } from "./review";

export const noteVariables = ["TITLE", "AUTHOR", "AUTHORS", "PUBLISHER", "ISBN", "LANGUAGE", "DATE", "SERIES", "SUBJECTS", "BOOK_ID", "SOURCE_PATH", "FILE_LINK", "REVIEW_STATUS"] as const;

/** Adapt the user's original empty property fields without changing the reading framework. */
export function prepareNoteTemplate(template: string): string {
  const fields: Record<string, string> = { "书籍书名": "TITLE", "书籍作者": "AUTHORS", "检索标签": "SUBJECTS", "丛书系列": "SERIES", "出版商社": "PUBLISHER", "标识ISBN": "ISBN" };
  let front = false;
  return template.replace(/^\uFEFF/, "").split(/\r?\n/).map((line, index) => {
    if (line.trim() === "---") { front = index === 0; return line; }
    if (!front) return line;
    const match = line.match(/^(\s*)([^:：]+):\s*$/);
    const variable = match && fields[match[2]!.trim()];
    return variable ? `${match![1]}${match![2]}: {{${variable}}}` : line;
  }).join("\n");
}

export function unknownNoteVariables(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(/\{\{([^{}]+)\}\}/g), match => match[1]!.trim()).filter(name => !(noteVariables as readonly string[]).includes(name)))];
}

export function noteTitle(book: DerivedBook): string { return book.resolvedTitle || book.rawTitle || book.originalName.replace(/\.[^.]+$/, ""); }
export function noteAuthors(book: DerivedBook): string[] {
  return (book.resolvedAuthors ?? book.authors).filter(author => author.trim() && !/^(?:unknown|anonymous|作者待确认)$/i.test(author.trim()));
}

export function renderBookNote(book: DerivedBook, template: string, libraryPath: string, notePath = "Notes/note.md"): string {
  const prepared = prepareNoteTemplate(template);
  const unknown = unknownNoteVariables(prepared);
  if (unknown.length) throw new Error("模板存在未知变量：" + unknown.join("、"));
  const authors = noteAuthors(book), title = noteTitle(book);
  const from = notePath.split("/").slice(0, -1), to = libraryPath.split("/");
  while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
  const target = "../".repeat(from.length) + to.map(part => encodeURIComponent(part)).join("/");
  const values: Record<string, string | string[]> = {
    TITLE: title, AUTHOR: authors.join(" · "), AUTHORS: authors, PUBLISHER: book.publisher || "",
    ISBN: book.isbn || book.identifiers.join("; "), LANGUAGE: book.language || "", DATE: book.date || "",
    SERIES: book.series || "", SUBJECTS: book.subjects ?? [], BOOK_ID: book.id, SOURCE_PATH: book.relativePath || book.originalName,
    FILE_LINK: `[打开书籍](<${target}>)`, REVIEW_STATUS: isReviewed(book) ? "已人工审核" : needsReview(book) ? "待审核" : "未人工确认",
  };
  let front = false;
  const lines = prepared.split("\n").map((line, index) => {
    if (line.trim() === "---") { front = index === 0; return line; }
    // YAML values are encoded as complete JSON scalars/lists (valid YAML); no raw interpolation.
    if (front) {
      const field = line.match(/^(\s*[^:#][^:]*:\s*)(.*)$/);
      if (field && /\{\{[^{}]+\}\}/.test(field[2]!)) {
        const exact = field[2]!.trim().match(/^(?:["'])?\{\{\s*(\w+)\s*\}\}(?:["'])?$/);
        const value = exact ? values[exact[1]!] : field[2]!.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(values[key] ?? ""));
        return field[1] + JSON.stringify(value ?? "");
      }
      if (/\{\{[^{}]+\}\}/.test(line)) throw new Error("YAML 区域的模板变量请放在单行属性值中，例如：书籍书名: {{TITLE}}");
    }
    return line.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => Array.isArray(values[key]) ? (values[key] as string[]).join(" · ") : String(values[key] ?? ""));
  });
  // The template alone controls note content; traceability remains in the export CSV.
  return lines.join("\n");
}

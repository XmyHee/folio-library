import { pdfHeaderLines, namesInLine } from "./paper-metadata";
import type { ParsedBook } from "./types";

export type BookPageMetadata = { title: string; authors: string[]; titleEvidence: string[]; authorEvidence: string[]; page: number; source: "pdf-title-page" | "epub-title-page" };
type Line = { text: string; size: number };
export function titleExpandsAcronym(short: string, full: string): boolean {
  const acronym = short.trim();
  if (!/^[A-Z]{3,10}$/.test(acronym)) return false;
  const words = full.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= 3 && words.map(word => word[0]).join("").toUpperCase() === acronym;
}
export function bookTitleKey(text: string): string {
  return text.replace(/\.(?:pdf|epub)$/i, "").split(/\s+-\s+/)[0]!
    .replace(/(?:_\d{2}){3}(?:_[A-Z])?$/i, "")
    .normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
const notTitle = /^(?:contents|table of contents|chapter\s+\d|references|index|copyright|preface|目录|版权|前言|第[一二三四五六七八九十\d]+章)$/i;
const notAuthor = /\b(?:press|publishing|publishers?|edition|version|draft|copyright|all rights|download|available|contents|introduction|dedicated|printed|isbn)\b|出版社|版权所有|目录|出版|印刷|献给/i;

function fromLines(lines: Line[], filename: string, embeddedTitle: string, page: number, source: BookPageMetadata["source"]): BookPageMetadata | undefined {
  const anchors = [bookTitleKey(filename), bookTitleKey(embeddedTitle)].filter(key => key.length >= 6 && !/^(?:unknown|untitled|document|book)$/.test(key));
  for (let start = 0; start < Math.min(lines.length, 50); start++) {
    for (let end = start + 1; end <= Math.min(lines.length, start + 5); end++) {
      const titleLines = lines.slice(start, end);
      if (titleLines.some(line => notTitle.test(line.text))) break;
      const title = titleLines.map(line => line.text).join(" ").replace(/\s+/g, " ").trim();
      if (title.length > 250 || !(anchors.includes(bookTitleKey(title)) || titleExpandsAcronym(embeddedTitle, title) || titleExpandsAcronym(filename.replace(/\.(?:pdf|epub)$/i, "").split(/\s+-\s+/)[0]!, title))) continue;
      const authors: string[] = [], evidence: string[] = [];
      for (const line of lines.slice(end, end + 8)) {
        if (notAuthor.test(line.text)) break;
        const names = namesInLine(line.text.replace(/^by\s+/i, ""));
        if (names.length && !anchors.includes(bookTitleKey(line.text))) {
          authors.push(...names); evidence.push(line.text);
        } else if (authors.length) break;
      }
      return { title, authors: [...new Set(authors)], titleEvidence: titleLines.map(line => line.text), authorEvidence: evidence, page, source };
    }
  }
  return undefined;
}

export function extractPdfBookMetadata(pages: { number: number; items: unknown[] }[], filename: string, embeddedTitle: string): BookPageMetadata | undefined {
  let titleOnly: BookPageMetadata | undefined;
  for (const page of pages) {
    const found = fromLines(pdfHeaderLines(page.items), filename, embeddedTitle, page.number, "pdf-title-page");
    if (found?.authors.length) return found;
    if (found && !titleOnly) titleOnly = found;
  }
  return titleOnly;
}

export function extractEpubBookMetadata(doc: Document, filename: string, embeddedTitle: string, page: number): BookPageMetadata | undefined {
  const blocks = Array.from(doc.body.querySelectorAll("h1,h2,h3,p,div"))
    .filter(el => !el.querySelector("h1,h2,h3,p,div") && !el.closest("nav,script,style"))
    .slice(0, 80).map(el => ({ text: (el.textContent ?? "").replace(/\s+/g, " ").trim(), size: /^H/.test(el.tagName) ? 24 : 12 })).filter(line => line.text);
  return fromLines(blocks, filename, embeddedTitle, page, "epub-title-page");
}

export function applyBookPageMetadata(book: ParsedBook, found: BookPageMetadata): void {
  book.bookPageMetadata = found;
  const current = book.rawTitle.trim();
  if (!current || /^(?:unknown|untitled|document|microsoft word)/i.test(current) || bookTitleKey(current) === bookTitleKey(found.title) || titleExpandsAcronym(current, found.title)) book.rawTitle = found.title;
  else book.warnings = [...(book.warnings ?? []), "题名页与内置书名不同，保留内置书名，请核对题名页识别结果。"];
  const existing = book.authors.filter(author => !/^(?:unknown|anonymous|作者待确认)$/i.test(author.trim()));
  if (!existing.length && found.authors.length) book.authors = found.authors;
  else if (existing.length && found.authors.length && existing.join(" ").toLowerCase() !== found.authors.join(" ").toLowerCase()) {
    book.warnings = [...(book.warnings ?? []), "题名页与内置作者不同，保留内置作者，请核对题名页识别结果。"];
  }
}

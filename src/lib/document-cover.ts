import type { ParsedBook } from "./types";
import { resolveBookMeta } from "./resolve";
import { proposeFilename } from "./normalize";

export function paperEvidence(text: string, subjects: string[] = []): string[] {
  const reasons: string[] = [];
  if (subjects.some(subject => /^(?:journal article|research article|conference paper|学术论文|期刊论文|会议论文)$/i.test(subject.trim()))) reasons.push("书内主题标注为论文");
  const abstract = /\babstract\b|摘\s*要/.test(text.toLowerCase());
  const doi = /\b10\.\d{4,9}\/[\w.();/:\-]+/i.test(text);
  const arxiv = /arxiv\s*:\s*\d{4}\.\d{4,5}/i.test(text);
  if (abstract && doi) reasons.push("前页包含摘要与 DOI");
  if (abstract && arxiv) reasons.push("前页包含摘要与 arXiv 标识");
  return reasons;
}

export function coverUrlFor(book: ParsedBook): string | undefined {
  if (book.coverPreference === "original") return book.coverUrl;
  return book.coverPreference === "title" ? book.titleCoverUrl ?? book.coverUrl : book.coverUrl ?? book.titleCoverUrl;
}

/** Wrap measured text without truncation. */
export function coverLines(context: Pick<CanvasRenderingContext2D, "measureText">, text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of Array.from(text)) {
    if (current && context.measureText(current + char).width > width) { lines.push(current.trim()); current = char; }
    else current += char;
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

export const coverColors = ["#233c50", "#643447", "#284d40", "#383548", "#59472c", "#222831"];
export async function titleCover(title: string, author: string, _format: string, _paper: boolean, color = coverColors[0], dimensions = { width: 800, height: 1200 }): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = Math.round(canvas.width * dimensions.height / dimensions.width);
  if (!Number.isFinite(canvas.height) || canvas.height < 100 || canvas.height > 12000) throw new Error("原页面比例无法用于封面排版");
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建标题封面画布");
    const clean = (value: string) => /^(?:unknown|untitled|作者待确认|标题待确认|【缺失书名】|【缺失作者】)$/i.test(value.trim()) ? "" : value.trim();
    title = clean(title); author = clean(author);
    if (!title && !author) throw new Error("没有读取到标题或作者，请先核对元数据");
    const width = canvas.width, height = canvas.height, margin = width * 0.12;
    let font = Math.min(width * 0.055, height * 0.065);
    let titles: string[] = [], authors: string[] = [], gap = 0, titleHeight = 0, authorHeight = 0;
    while (true) {
      ctx.font = `${font}px "Microsoft YaHei", "Segoe UI", sans-serif`;
      titles = coverLines(ctx, title, width - margin * 2);
      ctx.font = `${font * 0.58}px "Microsoft YaHei", "Segoe UI", sans-serif`;
      authors = coverLines(ctx, author, width - margin * 2);
      titleHeight = titles.length * font * 1.5;
      authorHeight = authors.length * font * 0.58 * 1.6;
      gap = titles.length && authors.length ? font * 1.8 : 0;
      if (titleHeight + authorHeight + gap <= height * 0.68) break;
      font *= 0.94;
      if (font < 12) throw new Error("标题或作者过长，无法完整排入原页面，请核对读取数据");
    }
    ctx.fillStyle = coverColors.includes(color!) ? color! : coverColors[0]!;
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const start = (height - titleHeight - authorHeight - gap) / 2;
    ctx.fillStyle = "#ebd282"; ctx.font = `${font}px "Microsoft YaHei", "Segoe UI", sans-serif`;
    titles.forEach((line, i) => ctx.fillText(line, width / 2, start + (i + 0.5) * font * 1.5));
    ctx.fillStyle = "#f5f5f5"; ctx.font = `${font * 0.58}px "Microsoft YaHei", "Segoe UI", sans-serif`;
    authors.forEach((line, i) => ctx.fillText(line, width / 2, start + titleHeight + gap + (i + 0.5) * font * 0.58 * 1.6));
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) throw new Error("标题封面生成失败");
    return blob;
  } finally { canvas.width = canvas.height = 0; }
}

export async function titleCoverForBook(book: ParsedBook, title: string, author: string, color = coverColors[0]): Promise<Blob> {
  let dimensions = { width: 800, height: 1200 };
  if (book.kind === "pdf") {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(await book.file.arrayBuffer());
    if (!pdf.getPageCount()) throw new Error("PDF 没有可读取的页面");
    const page = pdf.getPage(0), box = page.getCropBox();
    const rotated = Math.abs(page.getRotation().angle) % 180 === 90;
    dimensions = rotated ? { width: box.height, height: box.width } : box;
  }
  return titleCover(title, author, book.kind ?? "", false, color, dimensions);
}

export async function refreshTitleCover(book: ParsedBook): Promise<Blob> {
  const resolved = resolveBookMeta(book, { online: false });
  const title = book.coverTitle ?? (book.resolvedTitle || resolved.title);
  const authors = book.resolvedAuthors ?? resolved.authors;
  const name = proposeFilename(title, authors, book.originalName, 1, book.series, book.language);
  return titleCoverForBook(book, title, book.coverAuthor ?? name.displayAuthor, book.coverColor);
}

export async function addDocumentCover(book: ParsedBook): Promise<ParsedBook> {
  if (book.kind !== "pdf" && book.kind !== "epub") return book;
  const reasons = book.paperReasons ?? paperEvidence("", book.subjects);
  const candidate = reasons.length > 0;
  const next = { ...book, paperReasons: reasons };
  if (book.coverUrl && (book.kind === "epub" ? !book.coverIsFirstPage : !candidate)) return next;
  try {
    const resolved = resolveBookMeta(book, { online: false });
    const name = proposeFilename(resolved.title, resolved.authors, book.originalName, 1, book.series, book.language);
    const blob = await titleCoverForBook(book, resolved.title, name.displayAuthor);
    return { ...next, coverStyleVersion: 2, titleCoverBlob: blob, titleCoverUrl: URL.createObjectURL(blob), coverPreference: book.coverUrl && !book.coverIsFirstPage ? "original" : "title" };
  } catch (error) {
    return { ...next, warnings: [...(book.warnings ?? []), "标题封面生成失败：" + String(error)] };
  }
}

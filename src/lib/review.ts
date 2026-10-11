import type { DerivedBook } from "./types";

export function reviewReasons(book: DerivedBook): string[] {
  const reasons: string[] = [];
  const title = (book.resolvedTitle || book.rawTitle || "").trim();
  if (!title || /^(?:unknown|untitled|document|【缺失书名】)$/i.test(title)) reasons.push("缺少书名");
  else if (/^(?:arxiv[:\s]*)?\d{4}\.\d{4,5}(?:v\d+)?$/i.test(title)) reasons.push("书名仍为论文编号");
  if (!(book.resolvedAuthors ?? book.authors).some(name => name.trim() && !/^(?:unknown|anonymous|作者待确认)$/i.test(name.trim()))) reasons.push("缺少作者");
  if (book.status === "error") reasons.push("文件解析失败");
  if (!book.manualMetadata && book.warnings?.some(warning => /冲突|不同|不一致/.test(warning))) reasons.push("识别信息冲突");
  return reasons;
}

/** A confirmation applies only to the exact visible catalog and outstanding issues. */
export function reviewKey(book: DerivedBook): string {
  return JSON.stringify([book.hash, book.resolvedTitle || book.rawTitle, book.resolvedAuthors ?? book.authors, book.metaSource, book.status, book.error ?? "", reviewReasons(book)]);
}
export function isReviewed(book: DerivedBook): boolean { return book.reviewedMetadataKey === reviewKey(book); }
export function needsReview(book: DerivedBook): boolean { return reviewReasons(book).length > 0 && !isReviewed(book); }

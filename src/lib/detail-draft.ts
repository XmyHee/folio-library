import type { DerivedBook } from "./types";

export type DetailDraft = { title: string; authors: string; coverTitle: string; coverAuthor: string };
export function savedDetailDraft(book: DerivedBook): DetailDraft {
  return { title: book.resolvedTitle || book.rawTitle || "", authors: (book.resolvedAuthors ?? []).join("\n"),
    coverTitle: book.coverTitle ?? (book.resolvedTitle || book.rawTitle || ""),
    coverAuthor: book.coverAuthor ?? (book.displayAuthor === "Unknown" ? "" : book.displayAuthor || "") };
}
export function detailDraftChanged(book: DerivedBook, draft: DetailDraft): boolean {
  const saved = savedDetailDraft(book);
  return (Object.keys(saved) as (keyof DetailDraft)[]).some(key => saved[key] !== draft[key]);
}

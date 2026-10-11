import type { DerivedBook, ParsedBook } from "./types";

export type CoverFilter = "all" | "missing" | "generated" | "papers";

/** Eligible source previews, not a claim that a PDF has no designed cover. */
export function lacksCover(book: ParsedBook): boolean {
  if (book.kind === "pdf") return book.coverPreference !== "title";
  return book.kind === "epub" && (book.coverIsFirstPage === true || !(book.coverBlob || book.coverUrl));
}

export function matchesCoverFilter(book: ParsedBook, filter: CoverFilter): boolean {
  if (filter === "missing") return lacksCover(book);
  if (filter === "generated") return book.coverPreference === "title";
  if (filter === "papers") return Boolean(book.paperReasons?.length);
  return true;
}

export function needsCoverGeneration(book: DerivedBook): boolean {
  return lacksCover(book) && (book.role === "unique" || book.role === "keep")
    && book.coverPreference !== "title";
}

/** One file at a time; cancellation takes effect between files. Successful work is retained. */
export async function generateCoverBatch(
  books: DerivedBook[],
  generate: (book: DerivedBook) => Promise<Blob>,
  apply: (book: DerivedBook, blob: Blob) => void,
  cancelled: () => boolean,
  progress: (done: number, total: number, file: string) => void,
) {
  const candidates = books.filter(needsCoverGeneration);
  const failures: string[] = [];
  let done = 0, succeeded = 0;
  for (const book of candidates) {
    if (cancelled()) break;
    progress(done, candidates.length, book.originalName);
    try { apply(book, await generate(book)); succeeded++; }
    catch (error) { failures.push(`${book.originalName}：${error instanceof Error ? error.message : String(error)}`); }
    done++;
    progress(done, candidates.length, book.originalName);
  }
  return { total: candidates.length, done, succeeded, failures, cancelled: done < candidates.length };
}

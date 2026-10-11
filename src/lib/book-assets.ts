import type { ParsedBook } from "./types";

/** Release only preview URLs; original File/Blob content remains untouched. */
export function revokeCovers(books: ParsedBook[]) {
  for (const book of books) {
    if (book.coverUrl) URL.revokeObjectURL(book.coverUrl);
    if (book.titleCoverUrl) URL.revokeObjectURL(book.titleCoverUrl);
  }
}

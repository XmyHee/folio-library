import { extractIsbns, primaryIsbn, stripZlibTag, stripVsiSuffix, collapseWs } from "./normalize";
import type { OpenLibraryHit } from "./openlibrary";
import type { MetaSource, ParsedBook } from "./types";

const SKIP_AUTHOR_KEYWORDS = [
  "z-lib",
  "1lib",
  "pdfdrive",
  "org",
  "sk",
  "com",
  "epub",
  "pdf",
  "zlib",
];

/**
 * Tier 3: filename regex (aligned with rename_pdf_isbn.py)
 *  - "Title (Author) (z-library...)"
 *  - "Title - Author"
 */
export function metaFromFilename(originalName: string): {
  title: string;
  authors: string[];
} {
  let stem = originalName.replace(/\.(epub|pdf)$/i, "");
  stem = stripZlibTag(stem);
  stem = stem.replace(/[\[\(]z-?lib[^\])]*[\]\)]/gi, " ");
  stem = collapseWs(stem);

  // Chinese filenames use the explicit title/author separator before parenthetical romanization.
  const separator = stem.indexOf(" - ");
  if (separator > 0 && /[\u3400-\u9fff]/.test(stem.slice(0, separator))) {
    const title = stem.slice(0, separator).trim();
    const author = stem.slice(separator + 3).trim();
    if (author) return { title, authors: [author] };
  }

  // Title (Author) (optional other parens)
  const paren = stem.match(/^(.*?)\s*\(([^()]+)\)(?:\s*\([^()]+\))*$/);
  if (paren) {
    const rawTitle = collapseWs(paren[1] || "");
    const rawAuthor = collapseWs(paren[2] || "");
    if (/^(?:unknown|anonymous)$/i.test(rawAuthor)) return { title: rawTitle, authors: [] };
    if (rawAuthor && !SKIP_AUTHOR_KEYWORDS.some((k) => rawAuthor.toLowerCase().includes(k))) {
      return { title: stripVsiSuffix(rawTitle), authors: [rawAuthor] };
    }
  }

  // Title - Author
  if (stem.includes(" - ")) {
    const parts = stem.split(" - ");
    if (parts.length >= 2) {
      const left = collapseWs(parts[0] || "");
      const right = collapseWs(parts.slice(1).join(" - "));
      if (/^(?:unknown|anonymous)$/i.test(right)) return { title: stripVsiSuffix(left), authors: [] };
      const rightLooksAuthor =
        right.split(/\s+/).length <= 6 &&
        !/\bvol(?:ume)?\.?\s*\d/i.test(right) &&
        !SKIP_AUTHOR_KEYWORDS.some((k) => right.toLowerCase().includes(k));
      if (rightLooksAuthor) {
        return { title: stripVsiSuffix(left), authors: [right] };
      }
    }
  }

  return { title: stripVsiSuffix(collapseWs(stem)), authors: [] };
}

export type ResolveOptions = {
  olByIsbn?: Map<string, OpenLibraryHit>;
  online?: boolean;
};

/**
 * 1. ISBN → Google Books / Open Library
 * 2. EPUB/PDF internal metadata
 * 3. Filename regex
 */
export function resolveBookMeta(
  book: ParsedBook,
  opts: ResolveOptions = {},
): {
  title: string;
  authors: string[];
  publisher: string;
  source: MetaSource;
  isbn: string | null;
  warnings?: string[];
} {
  const isbn =
    book.isbn ??
    primaryIsbn(book.identifiers) ??
    primaryIsbn(extractIsbns([book.originalName + " " + (book.rawTitle || "")]));

  // Preserve a Chinese edition's explicit filename fields when embedded/catalog fields use another script.
  if (book.manualMetadata) return {
    title: book.manualMetadata.title,
    authors: book.manualMetadata.authors,
    publisher: book.publisher,
    source: "manual",
    isbn,
  };
  const filename = metaFromFilename(book.originalName);
  const han = (value: string) => /[\u3400-\u9fff]/.test(value);
  const chineseFilename = han(filename.title);
  const chineseAuthors = filename.authors.length > 0 && filename.authors.every(han);
  const internalIsForeign = !han(book.rawTitle || "") || (chineseAuthors && !book.authors.some(han));
  const onlineHit = isbn ? opts.olByIsbn?.get(isbn.replace(/[^0-9Xx]/g, "").toUpperCase()) : undefined;
  const onlineIsForeign = opts.online !== false && onlineHit && (!han(onlineHit.title) || (chineseAuthors && !onlineHit.authors.some(han)));
  if (chineseFilename && (internalIsForeign || onlineIsForeign)) {
    return {
      title: filename.title,
      authors: chineseAuthors ? filename.authors : book.authors,
      publisher: book.publisher,
      source: "filename",
      isbn,
      warnings: ["中文文件名与书内或在线书目语言不一致，建议命名采用中文文件名，需人工核对。书内书名：" + (book.rawTitle || "缺失") + "；书内作者：" + (book.authors.join("、") || "缺失")],
    };
  }

  if (opts.online !== false && isbn && opts.olByIsbn) {
    const key = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
    const hit = opts.olByIsbn.get(key);
    if (hit?.title) {
      return {
        title: hit.title,
        authors: hit.authors.length ? hit.authors : book.authors,
        publisher: hit.publisher || book.publisher,
        source: "openlibrary",
        isbn: key,
      };
    }
  }

  const internalTitle = (book.rawTitle || "").trim();
  const internalAuthors = book.authors.filter(author => Boolean(author) && !/^(?:unknown|anonymous|作者待确认)$/i.test(author.trim()));
  if (internalTitle || internalAuthors.length > 0) {
    const fromFile = metaFromFilename(book.originalName);
    return {
      title: internalTitle || fromFile.title,
      authors: internalAuthors.length ? internalAuthors : fromFile.authors,
      publisher: book.publisher,
      source: book.kind === "pdf" ? "pdf" : "epub",
      isbn: isbn,
    };
  }

  const fromName = metaFromFilename(book.originalName);
  return {
    title: fromName.title || "Untitled",
    authors: fromName.authors,
    publisher: book.publisher,
    source: fromName.title ? "filename" : "none",
    isbn: isbn,
  };
}

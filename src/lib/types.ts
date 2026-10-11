export type ParseStatus = "ok" | "error";
export type NamingMode = 1 | 2;
export type DedupeRole = "unique" | "keep" | "duplicate" | "identical";
export type DedupeKind = "hash" | "isbn" | "title" | "fuzzy";
/** Where the final display title/author came from */
export type MetaSource = "manual" | "openlibrary" | "epub" | "pdf" | "filename" | "none";

export type ParsedBook = {
  id: string;
  file: File;
  originalName: string;
  relativePath: string;
  size: number;
  hash: string;
  status: ParseStatus;
  error?: string;
  warnings?: string[];
  /** Internal EPUB/PDF raw title (may be empty) */
  rawTitle: string;
  /** User-reviewed catalog fields; original extraction remains separate. */
  manualMetadata?: { title: string; authors: string[] };
  reviewedMetadataKey?: string;
  authors: string[];
  publisher: string;
  language: string;
  identifiers: string[];
  description: string;
  date: string;
  subjects: string[];
  series: string;
  coverUrl?: string;
  coverBlob?: Blob;
  coverIsFirstPage?: boolean;
  coverlessConfirmed?: boolean;
  coverTitle?: string;
  coverAuthor?: string;
  coverStyleVersion?: number;
  coverColor?: string;
  titleCoverBlob?: Blob;
  titleCoverUrl?: string;
  coverPreference?: "original" | "title";
  paperReasons?: string[];
  bookPageMetadata?: import("./book-metadata").BookPageMetadata;
  epubEmbeddedTitle?: string;
  epubEmbeddedAuthors?: string[];
  pdfEmbeddedTitle?: string;
  pdfEmbeddedAuthors?: string[];
  paperMetadata?: import("./paper-metadata").PaperMetadata;
  spineCount: number;
  hasZlibTag: boolean;
  /** Resolved ISBN-13/10 if any */
  isbn?: string | null;
  /** Final title used for naming after 3-tier resolve */
  resolvedTitle?: string;
  resolvedAuthors?: string[];
  metaSource?: MetaSource;
  kind?: "epub" | "pdf" | "other";
};

export type DerivedBook = ParsedBook & {
  cleanTitle: string;
  displayAuthor: string;
  proposedName: string;
  bookKey: string;
  groupId: string | null;
  role: DedupeRole;
  score: number;
  nameChanged: boolean;
};

export type DuplicateGroup = {
  id: string;
  key: string;
  kind: DedupeKind;
  bookIds: string[];
  keepId: string;
  reason?: string;
};

export type PipelineResult = {
  books: DerivedBook[];
  groups: DuplicateGroup[];
  stats: {
    total: number;
    parsed: number;
    failed: number;
    willRename: number;
    duplicateGroups: number;
    toIsolate: number;
    exactCopies: number;
    fromOpenLibrary: number;
    fromInternal: number;
    fromFilename: number;
  };
};

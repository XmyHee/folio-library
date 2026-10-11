import {
  authorFingerprint,
  extractVolumeKey,
  looksLikeCopyName,
  primaryIsbn,
  proposeFilename,
  titleTokenSet,
  titleWithoutVolume,
} from "./normalize";
import { resolveBookMeta } from "./resolve";
import type { OpenLibraryHit } from "./openlibrary";

import type {
  DerivedBook,
  DuplicateGroup,
  NamingMode,
  ParsedBook,
  PipelineResult,
} from "./types";

/** Higher = better candidate to keep */
function scoreBook(book: ParsedBook): number {
  let s = 0;
  if (!book.hasZlibTag) s += 1000;
  if (book.status === "ok") s += 200;
  else s -= 150;
  if (book.rawTitle) s += 120;
  if (book.authors.length > 0) s += 80;
  if (book.coverUrl) s += 50;
  if (book.publisher) s += 15;
  if (book.identifiers.length > 0) s += 40;
  if (primaryIsbn(book.identifiers)) s += 60;
  if (book.description) s += Math.min(book.description.length / 20, 40);
  if (book.date) s += 10;
  if (book.series) s += 8;
  if (looksLikeCopyName(book.originalName) || looksLikeCopyName(book.relativePath)) s -= 80;
  // Prefer modestly larger files (more complete), but don't over-weight huge scans
  s += Math.min(book.size / 1024, 350);
  s += Math.min(book.spineCount, 50);
  return s;
}

function uniqueName(desired: string, taken: Set<string>): string {
  if (!taken.has(desired.toLowerCase())) return desired;
  const ext = desired.match(/\.[^.]+$/)?.[0] ?? "";
  const stem = ext ? desired.slice(0, -ext.length) : desired;
  let n = 2;
  while (taken.has((stem + " (" + n + ")" + ext).toLowerCase())) n += 1;
  return stem + " (" + n + ")" + ext;
}

function pickKeep(
  members: DerivedBook[],
  groupId: string,
  keepOverrides: Record<string, string>,
): DerivedBook {
  const sorted = [...members].sort((a, b) => b.score - a.score || a.originalName.localeCompare(b.originalName));
  return sorted.find((m) => m.id === keepOverrides[groupId]) ?? sorted[0]!;
}

function markGroup(
  members: DerivedBook[],
  groupId: string,
  kind: DuplicateGroup["kind"],
  key: string,
  keepOverrides: Record<string, string>,
  reason: string,
  identical: boolean,
): DuplicateGroup {
  const keep = pickKeep(members, groupId, keepOverrides);
  for (const m of members) {
    m.groupId = groupId;
    m.role = m.id === keep.id ? "keep" : identical ? "identical" : "duplicate";
  }
  return {
    id: groupId,
    key,
    kind,
    bookIds: members.map((m) => m.id),
    keepId: keep.id,
    reason,
  };
}

/**
 * Union-find for fuzzy clustering so A~B and B~C merge into one group.
 */
class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p !== x) this.parent.set(x, this.find(p));
    return this.parent.get(x)!;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const FUZZY_TITLE_THRESHOLD = 0.94;
/** Prepare once per book; matching rules and thresholds are unchanged. */
function fuzzyFeatures(book: DerivedBook) {
  const fingerprint = authorFingerprint(book.authors);
  const title = titleWithoutVolume(book.rawTitle || book.cleanTitle);
  return { fingerprint, authors: new Set(fingerprint.split(" ").filter(token => token.length > 2)),
    tokens: titleTokenSet(title), length: title.replace(/\s+/g, "").length,
    volume: extractVolumeKey(book.rawTitle, book.series, book.originalName, book.relativePath),
    series: (book.series || "").trim().toLowerCase() };
}
function authorsCompatible(a: ReturnType<typeof fuzzyFeatures>, b: ReturnType<typeof fuzzyFeatures>): boolean {
  if (!a.fingerprint && !b.fingerprint) return true;
  if (!a.fingerprint || !b.fingerprint) return false;
  if (a.fingerprint === b.fingerprint) return true;
  let shared = 0;
  for (const token of a.authors) if (b.authors.has(token)) shared++;
  return a.authors.size <= 1 && b.authors.size <= 1 ? shared >= 1 : shared >= 2;
}
function titlesStrictMatch(a: ReturnType<typeof fuzzyFeatures>, b: ReturnType<typeof fuzzyFeatures>): boolean {
  if (a.tokens.size < 2 || b.tokens.size < 2) return false;
  if (a.length > 0 && b.length > 0 && Math.min(a.length,b.length) / Math.max(a.length,b.length) < 0.75) return false;
  // A size bound can reject pairs without enumerating their token intersection.
  if (Math.min(a.tokens.size,b.tokens.size) / Math.max(a.tokens.size,b.tokens.size) < FUZZY_TITLE_THRESHOLD) return false;
  let shared = 0;
  for (const token of a.tokens) if (b.tokens.has(token)) shared++;
  return shared / (a.tokens.size + b.tokens.size - shared) >= FUZZY_TITLE_THRESHOLD;
}

export function runPipeline(
  books: ParsedBook[],
  mode: NamingMode,
  keepOverrides: Record<string, string> = {},
  opts: {
    online?: boolean;
    olByIsbn?: Map<string, OpenLibraryHit>;
  } = {},
): PipelineResult {
  const derived: DerivedBook[] = books.map((book) => {
    const resolved = resolveBookMeta(book, {
      online: opts.online,
      olByIsbn: opts.olByIsbn,
    });
    const naming = proposeFilename(
      resolved.title,
      resolved.authors,
      book.kind === "pdf" || book.kind === "epub"
        ? book.originalName.replace(/\.[^.]+$/, "") + "." + book.kind
        : book.originalName,
      mode,
      book.series,
      book.language,
    );
    return {
      ...book,
      ...naming,
      rawTitle: resolved.title || book.rawTitle,
      authors: resolved.authors.length ? resolved.authors : book.authors,
      publisher: resolved.publisher || book.publisher,
      isbn: resolved.isbn,
      resolvedTitle: resolved.title,
      resolvedAuthors: resolved.authors,
      metaSource: resolved.source,
      warnings: [...(book.warnings ?? []), ...(resolved.warnings ?? [])],
      groupId: null,
      role: "unique" as const,
      score: scoreBook(book),
      nameChanged: false,
    };
  });

  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>(); // book ids already in a stronger group

  // ── 1) Exact content hash ──────────────────────────────────────────
  const byHash = new Map<string, DerivedBook[]>();
  for (const book of derived) {
    if (!/^[a-f0-9]{64}$/i.test(book.hash)) continue;
    const list = byHash.get(book.hash) ?? [];
    list.push(book);
    byHash.set(book.hash, list);
  }
  for (const [hash, members] of byHash) {
    if (members.length < 2) continue;
    const groupId = `hash:${hash.slice(0, 12)}`;
    groups.push(
      markGroup(members, groupId, "hash", hash.slice(0, 16), keepOverrides, "文件内容完全相同 (SHA-256)", true),
    );
    for (const m of members) claimed.add(m.id);
  }

  // ── 2) Same ISBN (strong bibliographic match) ──────────────────────
  const byIsbn = new Map<string, DerivedBook[]>();
  for (const book of derived) {
    if (claimed.has(book.id) || !book.isbn) continue;
    const list = byIsbn.get(book.isbn) ?? [];
    list.push(book);
    byIsbn.set(book.isbn, list);
  }
  for (const [isbn, members] of byIsbn) {
    if (members.length < 2) continue;
    const groupId = `isbn:${isbn}`;
    groups.push(
      markGroup(members, groupId, "isbn", isbn, keepOverrides, `ISBN 相同 (${isbn})`, false),
    );
    for (const m of members) claimed.add(m.id);
  }

  // ── 3) Exact normalized title+author key ───────────────────────────
  const byKey = new Map<string, DerivedBook[]>();
  for (const book of derived) {
    if (claimed.has(book.id) || !book.bookKey) continue;
    const list = byKey.get(book.bookKey) ?? [];
    list.push(book);
    byKey.set(book.bookKey, list);
  }
  for (const [key, members] of byKey) {
    // Ignore ultra-short/empty keys (legacy CJK collapse)
    if (members.length < 2 || !key || key.length < 4) continue;
    const groupId = `title:${key}`;
    groups.push(
      markGroup(members, groupId, "title", key, keepOverrides, "归一化书名与作者相同", false),
    );
    for (const m of members) claimed.add(m.id);
  }

  // ── 4) Fuzzy title + compatible authors (never merge different volumes) ──
  const candidates = derived.filter((b) => !claimed.has(b.id));
  const uf = new UnionFind();
  const features = candidates.map(fuzzyFeatures);
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      const fa = features[i]!, fb = features[j]!;
      if (!authorsCompatible(fa, fb)) continue;

      // Different ISBN => different editions/volumes, never fuzzy-merge
      if (a.isbn && b.isbn && a.isbn !== b.isbn) continue;

      if (fa.volume && fb.volume && fa.volume !== fb.volume) continue;
      if (fa.series && fb.series && fa.series !== fb.series) continue;
      if (titlesStrictMatch(fa, fb)) {
        uf.union(a.id, b.id);
      }
    }
  }
  const fuzzyBuckets = new Map<string, DerivedBook[]>();
  for (const book of candidates) {
    const root = uf.find(book.id);
    // only care about components with >1 member
    const list = fuzzyBuckets.get(root) ?? [];
    list.push(book);
    fuzzyBuckets.set(root, list);
  }
  for (const [, members] of fuzzyBuckets) {
    if (members.length < 2) continue;
    const groupId = `fuzzy:${members.map((m) => m.id).sort().join("|").slice(0, 24)}`;
    groups.push(
      markGroup(
        members,
        groupId,
        "fuzzy",
        members[0]!.bookKey,
        keepOverrides,
        "书名高度相似且作者匹配",
        false,
      ),
    );
    for (const m of members) claimed.add(m.id);
  }

  // ── Assign unique filenames (kept first, then isolated) ────────────
  const taken = new Set<string>();
  const ordered = [
    ...derived.filter((b) => b.role === "unique" || b.role === "keep"),
    ...derived.filter((b) => b.role === "duplicate" || b.role === "identical"),
  ];
  for (const book of ordered) {
    const name = uniqueName(book.proposedName, taken);
    taken.add(name.toLowerCase());
    book.proposedName = name;
    book.nameChanged = name.toLowerCase() !== book.originalName.toLowerCase();
  }

  return {
    books: derived,
    groups,
    stats: {
      total: derived.length,
      parsed: derived.filter((b) => b.status === "ok").length,
      failed: derived.filter((b) => b.status === "error").length,
      willRename: derived.filter(
        (b) => b.nameChanged && b.role !== "duplicate" && b.role !== "identical",
      ).length,
      duplicateGroups: groups.length,
      toIsolate: derived.filter((b) => b.role === "duplicate" || b.role === "identical").length,
      exactCopies: derived.filter((b) => b.role === "identical").length,
      fromOpenLibrary: derived.filter((b) => b.metaSource === "openlibrary").length,
      fromInternal: derived.filter((b) => b.metaSource === "epub" || b.metaSource === "pdf" || b.metaSource === "markdown").length,
      fromFilename: derived.filter((b) => b.metaSource === "filename").length,
    },
  };
}

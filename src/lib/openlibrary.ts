/**
 * ISBN catalog lookup: Google Books (primary) → Open Library (fallback).
 * Matches the priority used in rename_pdf_isbn.py.
 * Offline / failure → null (caller uses EPUB/PDF meta or filename).
 */

export type OpenLibraryHit = {
  title: string;
  authors: string[];
  publisher?: string;
  publishDate?: string;
  isbn?: string;
  source: "google" | "openlibrary";
};

const cache = new Map<string, OpenLibraryHit | null>();

function normalizeIsbnKey(isbn: string): string {
  return isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function cleanText(text: string | undefined | null): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

async function fetchGoogleBooks(isbn: string, signal?: AbortSignal): Promise<OpenLibraryHit | null> {
  const url = "https://www.googleapis.com/books/v1/volumes?q=isbn:" + encodeURIComponent(isbn);
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()) as {
      items?: Array<{
        volumeInfo?: {
          title?: string;
          subtitle?: string;
          authors?: string[];
          publisher?: string;
          publishedDate?: string;
        };
      }>;
    };
    const info = data.items?.[0]?.volumeInfo;
    if (!info?.title) return null;
    let title = cleanText(info.title);
    const subtitle = cleanText(info.subtitle);
    if (subtitle && !title.toLowerCase().includes(subtitle.toLowerCase())) {
      title = title + ": " + subtitle;
    }
    return {
      title,
      authors: (info.authors ?? []).map(cleanText).filter(Boolean),
      publisher: cleanText(info.publisher) || undefined,
      publishDate: info.publishedDate,
      isbn,
      source: "google",
    };
  } catch (error) {
    throw error;
  }
}

async function fetchOpenLibrary(isbn: string, signal?: AbortSignal): Promise<OpenLibraryHit | null> {
  const bib = "ISBN:" + isbn;
  const url =
    "https://openlibrary.org/api/books?bibkeys=" +
    encodeURIComponent(bib) +
    "&format=json&jscmd=data";
  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()) as Record<
      string,
      {
        title?: string;
        subtitle?: string;
        authors?: Array<{ name?: string }>;
        publishers?: Array<{ name?: string }>;
        publish_date?: string;
      }
    >;
    const entry = data[bib];
    if (!entry?.title) return null;
    let title = cleanText(entry.title);
    const subtitle = cleanText(entry.subtitle);
    if (subtitle && !title.toLowerCase().includes(subtitle.toLowerCase())) {
      title = title + ": " + subtitle;
    }
    return {
      title,
      authors: (entry.authors ?? []).map((a) => cleanText(a.name)).filter(Boolean),
      publisher: entry.publishers?.[0]?.name,
      publishDate: entry.publish_date,
      isbn,
      source: "openlibrary",
    };
  } catch (error) {
    throw error;
  }
}

export type LookupStatus = "found" | "not_found" | "failed" | "timeout";
export type LookupResult = { status: LookupStatus; hit?: OpenLibraryHit };
export type LookupOptions = { force?: boolean; timeoutMs?: number; signal?: AbortSignal; onResult?: (isbn: string, result: LookupResult) => void };

/** Bound each provider request, including response-body reads. Failures are never negative-cache entries. */
async function requestProvider(provider: typeof fetchGoogleBooks, isbn: string, options: LookupOptions): Promise<LookupResult> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (options.signal?.aborted) throw new Error("查询已取消");
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error("查询超时")); }, options.timeoutMs ?? 8000);
    });
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("查询已取消")), { once: true });
    });
    const hit = await Promise.race([provider(isbn, controller.signal), timeout, cancelled]);
    return hit ? { status: "found", hit } : { status: "not_found" };
  } catch {
    if (options.signal?.aborted) throw new Error("查询已取消");
    return { status: timedOut ? "timeout" : "failed" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export async function lookupIsbnResult(isbn: string, options: LookupOptions = {}): Promise<LookupResult> {
  const key = normalizeIsbnKey(isbn);
  if (options.signal?.aborted) throw new Error("查询已取消");
  if (key.length !== 10 && key.length !== 13) return { status: "not_found" };
  if (options.force) cache.delete(key);
  if (cache.has(key)) { const hit = cache.get(key); return hit ? { status: "found", hit } : { status: "not_found" }; }
  const first = await requestProvider(fetchGoogleBooks, key, options);
  if (first.hit) { cache.set(key, first.hit); return first; }
  const second = await requestProvider(fetchOpenLibrary, key, options);
  if (second.hit) { cache.set(key, second.hit); return second; }
  if (first.status === "not_found" && second.status === "not_found") { cache.set(key, null); return { status: "not_found" }; }
  return { status: first.status === "timeout" || second.status === "timeout" ? "timeout" : "failed" };
}

/** Backwards-compatible hit-only lookup. */
export async function lookupIsbn(isbn: string, signal?: AbortSignal): Promise<OpenLibraryHit | null> {
  return (await lookupIsbnResult(isbn, { signal })).hit ?? null;
}

export async function lookupIsbnBatch(isbns: string[], onProgress?: (done: number, total: number) => void, concurrency = 2, options: LookupOptions = {}): Promise<Map<string, OpenLibraryHit>> {
  const unique = [...new Set(isbns.map(normalizeIsbnKey).filter(key => key.length === 10 || key.length === 13))];
  const out = new Map<string, OpenLibraryHit>();
  let done = 0, next = 0;
  async function worker() {
    while (next < unique.length) {
      if (options.signal?.aborted) throw new Error("查询已取消");
      const isbn = unique[next++]!;
      const result = await lookupIsbnResult(isbn, options);
      if (result.hit) out.set(isbn, result.hit);
      options.onResult?.(isbn, result);
      onProgress?.(++done, unique.length);
    }
  }
  const count = Math.min(Math.max(1, Math.min(4, Math.floor(concurrency) || 1)), Math.max(unique.length, 1));
  const settled = await Promise.allSettled(Array.from({ length: count }, () => worker()));
  const failed = settled.find(result => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return out;
}

export function clearOpenLibraryCache() {
  cache.clear();
}

import type { ParsedBook } from "./types";

/** Injectable batch boundary; parsing remains format-specific and cancellation keeps completed items. */
export interface BookBatchServices {
  parseBook: (file: File) => Promise<ParsedBook>;
  addDocumentCover: (book: ParsedBook) => Promise<ParsedBook>;
  revokeCovers: (books: ParsedBook[]) => void;
}

export function createBookBatchParser({ parseBook, addDocumentCover, revokeCovers }: BookBatchServices) {
  async function parseEpubBatch(
    files: File[],
    onProgress: (done: number, total: number, current: string) => void,
    concurrency = 2,
    signal?: AbortSignal,
  ): Promise<ParsedBook[]> {
    const total = files.length;
    const results: ParsedBook[] = new Array(total);
    let next = 0;
    let done = 0;

    async function worker() {
      while (true) {
        if (signal?.aborted) return;
        const i = next++;
        if (i >= total) return;
        const file = files[i]!;
        onProgress(done, total, file.name);
      try {
        results[i] = await addDocumentCover(await parseBook(file));
      } catch (error) {
        if (signal?.aborted) return;
        throw error;
      }
        done += 1;
        onProgress(done, total, file.name);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const settled = await Promise.allSettled(
      Array.from({ length: Math.min(4, Math.max(1, Math.floor(concurrency) || 1), Math.max(total, 1)) }, () => worker()),
    );
    const failed = settled.find(result => result.status === "rejected");
    if (failed?.status === "rejected") { revokeCovers(results.filter(Boolean)); throw failed.reason; }
    return results.filter(Boolean);
  }
  return parseEpubBatch;
}

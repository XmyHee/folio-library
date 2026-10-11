import type { useTaskState } from "../hooks/useTaskState";
import type { useLibraryState } from "../hooks/useLibraryState";
import type { useBookDetails } from "../hooks/useBookDetails";
import type { useLibraryView } from "../hooks/useLibraryView";
/** Explicit ports for import commands. Read state at invocation; share task refs across features. */
export interface ImportCommandContext {
    storageReady: ReturnType<typeof useLibraryState>["storageReady"];
    importingRef: ReturnType<typeof useTaskState>["importingRef"];
    setError: ReturnType<typeof useTaskState>["setError"];
    setBusy: ReturnType<typeof useTaskState>["setBusy"];
    setOlProgress: ReturnType<typeof useTaskState>["setOlProgress"];
    setProgress: ReturnType<typeof useTaskState>["setProgress"];
    taskController: ReturnType<typeof useTaskState>["taskController"];
    parseEpubBatch: typeof import("../lib/parse").parseEpubBatch;
    useOnlineMeta: ReturnType<typeof useLibraryState>["useOnlineMeta"];
    primaryIsbn: typeof import("../lib/normalize").primaryIsbn;
    lookupIsbnBatch: typeof import("../lib/openlibrary").lookupIsbnBatch;
    setLookupResults: ReturnType<typeof useTaskState>["setLookupResults"];
    setOlByIsbn: ReturnType<typeof useLibraryState>["setOlByIsbn"];
    setBooks: ReturnType<typeof useLibraryState>["setBooks"];
    setQuery: ReturnType<typeof useLibraryView>["setQuery"];
    setSelected: ReturnType<typeof useBookDetails>["setSelected"];
    setTab: ReturnType<typeof useLibraryView>["setTab"];
    markdownSettings?: import("../lib/markdown/model").MarkdownSettings;
}
export function createImportCommands(getContext: () => ImportCommandContext) {
    async function ingest(files: File[]) {
        const {
            storageReady,
            importingRef,
            setError,
            setBusy,
            setOlProgress,
            setProgress,
            taskController,
            parseEpubBatch,
            useOnlineMeta,
            primaryIsbn,
            lookupIsbnBatch,
            setLookupResults,
            setOlByIsbn,
            setBooks,
            setQuery,
            setSelected,
            setTab,
            markdownSettings,
        } = getContext();
        if (!storageReady || importingRef.current)
            return;
        if (files.length === 0) {
            setError("没有选中文件。请选择书籍文件或文件夹。");
            return;
        }
        importingRef.current = true;
        setBusy(true);
        setError(null);
        setOlProgress(null);
        setProgress({ done: 0, total: files.length, current: files[0]?.name ?? "" });
        taskController.current = new AbortController();
        try {
            const parsed = await parseEpubBatch(files, (done, total, current) => {
                setProgress({ done, total, current });
            }, 2, taskController.current.signal, markdownSettings);
            // Tier-1 prep: collect ISBNs and optionally query Open Library
            if (useOnlineMeta && !taskController.current.signal.aborted) {
                const isbns = parsed
                    .map((b) => b.isbn || primaryIsbn(b.identifiers) || "")
                    .filter(Boolean);
                if (isbns.length > 0) {
                    setOlProgress("书目查询中（Google Books / Open Library）…");
                    try {
                        const hits = await lookupIsbnBatch(isbns, (done, total) => {
                            setOlProgress("书目查询 " + done + "/" + total);
                        }, 2, { signal: taskController.current.signal, onResult: (isbn, result) => {
                                setLookupResults(previous => ({ ...previous, [isbn]: result }));
                                if (result.hit)
                                    setOlByIsbn(previous => new Map([...previous, [isbn, result.hit!]]));
                            } });
                        setOlByIsbn((previous) => new Map([...previous, ...hits]));
                    }
                    catch {
                        setError("在线书目查询未完成，当前使用书内元数据或文件名；请检查结果。");
                    }
                    setOlProgress(null);
                }
            }
            setBooks((previous) => [...previous, ...parsed]);
            if (taskController.current.signal.aborted)
                setError(`导入已停止，保留已完成的 ${parsed.length} 本。`);
            setQuery("");
            setSelected(null);
            setTab("audit");
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "解析失败";
            setError(/array buffer|内存|oom/i.test(msg)
                ? "浏览器内存不足。请分批导入，每次少选一些书。"
                : msg);
        }
        finally {
            importingRef.current = false;
            taskController.current = null;
            setBusy(false);
            setProgress(null);
            setOlProgress(null);
        }
    }
    return { ingest };
}

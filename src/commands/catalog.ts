import type { useTaskState } from "../hooks/useTaskState";
import type { useLibraryState } from "../hooks/useLibraryState";
import type { useLibraryView } from "../hooks/useLibraryView";
import type { LookupResult } from "../lib/openlibrary";
/** Explicit ports for catalog commands. Read state at invocation; share task refs across features. */
export interface CatalogCommandContext {
    busy: ReturnType<typeof useTaskState>["busy"];
    exporting: ReturnType<typeof useTaskState>["exporting"];
    importingRef: ReturnType<typeof useTaskState>["importingRef"];
    storageReady: ReturnType<typeof useLibraryState>["storageReady"];
    useOnlineMeta: ReturnType<typeof useLibraryState>["useOnlineMeta"];
    viewBooks: ReturnType<typeof useLibraryView>["viewBooks"];
    primaryIsbn: typeof import("../lib/normalize").primaryIsbn;
    setLookupSummary: ReturnType<typeof useTaskState>["setLookupSummary"];
    setBusy: ReturnType<typeof useTaskState>["setBusy"];
    setError: ReturnType<typeof useTaskState>["setError"];
    taskController: ReturnType<typeof useTaskState>["taskController"];
    lookupIsbnBatch: typeof import("../lib/openlibrary").lookupIsbnBatch;
    setOlProgress: ReturnType<typeof useTaskState>["setOlProgress"];
    setLookupResults: ReturnType<typeof useTaskState>["setLookupResults"];
    setOlByIsbn: ReturnType<typeof useLibraryState>["setOlByIsbn"];
}
export function createCatalogCommands(getContext: () => CatalogCommandContext) {
    async function retryCatalog() {
        const {
            busy,
            exporting,
            importingRef,
            storageReady,
            useOnlineMeta,
            viewBooks,
            primaryIsbn,
            setLookupSummary,
            setBusy,
            setError,
            taskController,
            lookupIsbnBatch,
            setOlProgress,
            setLookupResults,
            setOlByIsbn,
        } = getContext();
        if (busy || exporting || importingRef.current || !storageReady || !useOnlineMeta)
            return;
        const isbns = [...new Set(viewBooks.map(book => book.isbn || primaryIsbn(book.identifiers) || "").filter(Boolean))];
        if (!isbns.length) {
            setLookupSummary("当前列表没有可查询的 ISBN。");
            return;
        }
        importingRef.current = true;
        setBusy(true);
        setError(null);
        taskController.current = new AbortController();
        const outcomes: Record<string, LookupResult> = {};
        try {
            const hits = await lookupIsbnBatch(isbns, (done, total) => setOlProgress(`联网补全 ${done}/${total}`), 2, { force: true, signal: taskController.current.signal, onResult: (isbn, result) => { outcomes[isbn] = result; setLookupResults(previous => ({ ...previous, [isbn]: result })); if (result.hit)
                    setOlByIsbn(previous => new Map([...previous, [isbn, result.hit!]])); } });
            setOlByIsbn(previous => new Map([...previous, ...hits]));
            setLookupResults(previous => ({ ...previous, ...outcomes }));
            setLookupSummary(`联网补全：匹配 ${Object.values(outcomes).filter(result => result.status === "found").length} 项；无结果 ${Object.values(outcomes).filter(result => result.status === "not_found").length} 项；失败或超时 ${Object.values(outcomes).filter(result => result.status === "failed" || result.status === "timeout").length} 项。已有书目保留。`);
        }
        catch (error) {
            setError("联网补全未完成：" + String(error));
        }
        finally {
            importingRef.current = false;
            taskController.current = null;
            setBusy(false);
            setOlProgress(null);
        }
    }
    return { retryCatalog };
}

import type { useTaskState } from "../hooks/useTaskState";
import type { useLibraryState } from "../hooks/useLibraryState";
import type { useBookDetails } from "../hooks/useBookDetails";
import type { useLibraryView } from "../hooks/useLibraryView";
import type { Dispatch, SetStateAction } from "react";
/** Explicit ports for library commands. Read state at invocation; share task refs across features. */
export interface LibraryCommandContext {
    storageReady: ReturnType<typeof useLibraryState>["storageReady"];
    importingRef: ReturnType<typeof useTaskState>["importingRef"];
    exporting: ReturnType<typeof useTaskState>["exporting"];
    busy: ReturnType<typeof useTaskState>["busy"];
    clearedLibrary: ReturnType<typeof useLibraryState>["clearedLibrary"];
    revokeCovers: typeof import("../lib/book-assets").revokeCovers;
    books: ReturnType<typeof useLibraryState>["books"];
    setClearedLibrary: ReturnType<typeof useLibraryState>["setClearedLibrary"];
    keepOverrides: ReturnType<typeof useLibraryState>["keepOverrides"];
    olByIsbn: ReturnType<typeof useLibraryState>["olByIsbn"];
    exportReport: ReturnType<typeof useLibraryState>["exportReport"];
    setOlByIsbn: ReturnType<typeof useLibraryState>["setOlByIsbn"];
    setBooks: ReturnType<typeof useLibraryState>["setBooks"];
    setKeepOverrides: ReturnType<typeof useLibraryState>["setKeepOverrides"];
    setSelected: ReturnType<typeof useBookDetails>["setSelected"];
    setQuery: ReturnType<typeof useLibraryView>["setQuery"];
    setCoverFilter: ReturnType<typeof useLibraryView>["setCoverFilter"];
    setReviewFilter: ReturnType<typeof useLibraryView>["setReviewFilter"];
    setInformationFilter: ReturnType<typeof useLibraryView>["setInformationFilter"];
    setTab: ReturnType<typeof useLibraryView>["setTab"];
    setError: ReturnType<typeof useTaskState>["setError"];
    setLookupResults: ReturnType<typeof useTaskState>["setLookupResults"];
    setLookupSummary: ReturnType<typeof useTaskState>["setLookupSummary"];
    setExportReport: ReturnType<typeof useLibraryState>["setExportReport"];
    setExportScope: Dispatch<SetStateAction<"all" | "filtered" | "failed" | "selected">>;
    setShowExportReview: Dispatch<SetStateAction<boolean>>;
    setShowCoverBatchReview: Dispatch<SetStateAction<boolean>>;
    setShowClearConfirm: Dispatch<SetStateAction<boolean>>;
}
export function createLibraryCommands(getContext: () => LibraryCommandContext) {
    function clearAll() {
        const {
            storageReady,
            importingRef,
            exporting,
            busy,
            clearedLibrary,
            revokeCovers,
            books,
            setClearedLibrary,
            keepOverrides,
            olByIsbn,
            exportReport,
            setOlByIsbn,
            setBooks,
            setKeepOverrides,
            setSelected,
            setQuery,
            setCoverFilter,
            setReviewFilter,
            setInformationFilter,
            setTab,
            setError,
            setLookupResults,
            setLookupSummary,
            setExportReport,
            setExportScope,
            setShowExportReview,
            setShowCoverBatchReview,
            setShowClearConfirm,
        } = getContext();
        if (!storageReady || importingRef.current || exporting || busy)
            return;
        if (clearedLibrary)
            revokeCovers(clearedLibrary.books);
        setClearedLibrary({ books, keepOverrides, olByIsbn, lastExport: exportReport, expiresAt: Date.now() + 10 * 60 * 1000 });
        setOlByIsbn(new Map());
        setBooks([]);
        setKeepOverrides({});
        setSelected(null);
        setQuery("");
        setCoverFilter("all");
        setReviewFilter("all");
        setInformationFilter("all");
        setTab("audit");
        setError(null);
        setLookupResults({});
        setLookupSummary("");
        setExportReport(undefined);
        setExportScope("all");
        setShowExportReview(false);
        setShowCoverBatchReview(false);
        setShowClearConfirm(false);
    }
    function undoClear() {
        const {
            clearedLibrary,
            busy,
            exporting,
            storageReady,
            books,
            setBooks,
            setKeepOverrides,
            setOlByIsbn,
            setExportReport,
            setClearedLibrary,
            setQuery,
            setCoverFilter,
            setReviewFilter,
            setInformationFilter,
            setTab,
        } = getContext();
        if (!clearedLibrary || Date.now() >= clearedLibrary.expiresAt || busy || exporting || !storageReady)
            return;
        const active = new Set(books.map(book => book.id));
        setBooks(previous => [...clearedLibrary.books.filter(book => !active.has(book.id)), ...previous]);
        setKeepOverrides(previous => ({ ...clearedLibrary.keepOverrides, ...previous }));
        setOlByIsbn(previous => new Map([...clearedLibrary.olByIsbn, ...previous]));
        setExportReport(previous => previous ?? clearedLibrary.lastExport);
        setClearedLibrary(undefined);
        setQuery("");
        setCoverFilter("all");
        setReviewFilter("all");
        setInformationFilter("all");
        setTab("audit");
    }
    return { clearAll, undoClear };
}

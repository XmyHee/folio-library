import type { useTaskState } from "../hooks/useTaskState";
import type { useLibraryState } from "../hooks/useLibraryState";
import type { useLibraryView } from "../hooks/useLibraryView";
import type { Dispatch, SetStateAction } from "react";
import type { DerivedBook } from "../lib/types";
/** Explicit ports for export commands. Read state at invocation; share task refs across features. */
export interface ExportCommandContext {
    exportPlan: ReturnType<typeof import("../lib/export-plan").createExportPlan>;
    importingRef: ReturnType<typeof useTaskState>["importingRef"];
    storageReady: ReturnType<typeof useLibraryState>["storageReady"];
    setExporting: ReturnType<typeof useTaskState>["setExporting"];
    setError: ReturnType<typeof useTaskState>["setError"];
    setExportProgress: Dispatch<SetStateAction<import("../lib/export").ExportProgress | null>>;
    exportBooks: DerivedBook[];
    taskController: ReturnType<typeof useTaskState>["taskController"];
    downloadLibraryZip: typeof import("../lib/export").downloadLibraryZip;
    includeDuplicates: ReturnType<typeof useLibraryState>["includeDuplicates"];
    includeNotes: ReturnType<typeof useLibraryState>["includeNotes"];
    noteTemplate: ReturnType<typeof useLibraryState>["noteTemplate"];
    excludePending: boolean;
    setExportReport: ReturnType<typeof useLibraryState>["setExportReport"];
    setShowExportReview: Dispatch<SetStateAction<boolean>>;
    csvDownloadLock: ReturnType<typeof useTaskState>["csvDownloadLock"];
    busy: ReturnType<typeof useTaskState>["busy"];
    exporting: ReturnType<typeof useTaskState>["exporting"];
    setCsvDownloading: ReturnType<typeof useTaskState>["setCsvDownloading"];
    downloadCsv: typeof import("../lib/export").downloadCsv;
    batchBooks: ReturnType<typeof useLibraryView>["batchBooks"];
}
export function createExportCommands(getContext: () => ExportCommandContext) {
    async function handleExport() {
        const {
            exportPlan,
            importingRef,
            storageReady,
            setExporting,
            setError,
            setExportProgress,
            exportBooks,
            taskController,
            downloadLibraryZip,
            includeDuplicates,
            includeNotes,
            noteTemplate,
            excludePending,
            setExportReport,
            setShowExportReview,
        } = getContext();
        if (!exportPlan.summary.files || exportPlan.blockers.length || importingRef.current || !storageReady)
            return;
        importingRef.current = true;
        setExporting(true);
        setError(null);
        setExportProgress({ done: 0, total: exportBooks.length, current: "准备导出" });
        taskController.current = new AbortController();
        try {
            const report = await downloadLibraryZip(exportBooks, { includeDuplicates, includeNotes, noteTemplate, excludePending }, setExportProgress, taskController.current.signal);
            setExportReport(report);
            setShowExportReview(false);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "导出失败");
        }
        finally {
            importingRef.current = false;
            taskController.current = null;
            setExporting(false);
            setExportProgress(null);
        }
    }
    function exportCsv() {
        const {
            csvDownloadLock,
            busy,
            exporting,
            storageReady,
            setCsvDownloading,
            downloadCsv,
            batchBooks,
            setError,
        } = getContext();
        if (csvDownloadLock.current || busy || exporting || !storageReady)
            return;
        csvDownloadLock.current = true;
        setCsvDownloading(true);
        try {
            downloadCsv(batchBooks);
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "CSV 下载失败");
        }
    }
    return { handleExport, exportCsv };
}

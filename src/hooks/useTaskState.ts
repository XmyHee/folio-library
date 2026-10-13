import { useCallback, useEffect } from "react";
import { useFolioSlice, useFolioSelector, useFolioStoreApi } from "../state/folio-context";

/** One shared task lock and cancellation source across import, lookup, covers and export.
 * Command handlers retain the lock through their finally block; do not clear it on cancel.
 */
export function useTaskState() {
  return { ...useFolioSlice("task"), ...useTaskLifecycle() };
}

/** Mount once at the workbench root. Progress consumers subscribe independently. */
export function useTaskLifecycle() {
  const { csvDownloading, setCsvDownloading } = useFolioSelector(s => ({ csvDownloading: s.csvDownloading, setCsvDownloading: s.setCsvDownloading }));
  const { csvDownloadLock, cancelCoverBatch, taskController, importingRef } = useFolioStoreApi().getState().runtime;
  useEffect(() => {
    if (!csvDownloading) return;
    const timer = window.setTimeout(() => { csvDownloadLock.current = false; setCsvDownloading(false); }, 1500);
    return () => window.clearTimeout(timer);
  }, [csvDownloading]);

  const cancelTask = useCallback(() => { taskController.current?.abort(); }, [taskController]);
  const cancelCovers = useCallback(() => { cancelCoverBatch.current = true; }, [cancelCoverBatch]);
  useEffect(() => () => { taskController.current?.abort(); cancelCoverBatch.current = true; }, []);
  return {
    csvDownloadLock, cancelCoverBatch, taskController, importingRef,
    cancelTask, cancelCovers,
  };
}

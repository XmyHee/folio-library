import { useEffect, useRef, useState } from "react";
import type { LookupResult } from "../lib/openlibrary";

/** One shared task lock and cancellation source across import, lookup, covers and export.
 * Command handlers retain the lock through their finally block; do not clear it on cancel.
 */
export function useTaskState() {
  const [lookupResults, setLookupResults] = useState<Record<string, LookupResult>>({});
  const [lookupSummary, setLookupSummary] = useState("");
  const [olProgress, setOlProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [coverBatchRunning, setCoverBatchRunning] = useState(false);
  const [coverBatchResult, setCoverBatchResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [csvDownloading, setCsvDownloading] = useState(false);
  const csvDownloadLock = useRef(false);
  useEffect(() => {
    if (!csvDownloading) return;
    const timer = window.setTimeout(() => { csvDownloadLock.current = false; setCsvDownloading(false); }, 1500);
    return () => window.clearTimeout(timer);
  }, [csvDownloading]);
  const cancelCoverBatch = useRef(false);
  const taskController = useRef<AbortController | null>(null);
  const importingRef = useRef(false);

  function cancelTask() { taskController.current?.abort(); }
  function cancelCovers() { cancelCoverBatch.current = true; }
  useEffect(() => () => { taskController.current?.abort(); cancelCoverBatch.current = true; }, []);
  return {
    lookupResults, setLookupResults, lookupSummary, setLookupSummary,
    olProgress, setOlProgress, busy, setBusy,
    progress, setProgress, error, setError,
    coverBatchRunning, setCoverBatchRunning, coverBatchResult, setCoverBatchResult,
    exporting, setExporting, csvDownloading, setCsvDownloading,
    csvDownloadLock, cancelCoverBatch, taskController, importingRef,
    cancelTask, cancelCovers,
  };
}

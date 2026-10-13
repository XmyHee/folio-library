import type { useTaskState } from "../hooks/useTaskState";
import type { useLibraryState } from "../hooks/useLibraryState";
import type { useBookDetails } from "../hooks/useBookDetails";
import type { useLibraryView } from "../hooks/useLibraryView";
import type { Dispatch, SetStateAction } from "react";
export interface LibraryCommandContext {
  storageReady: boolean; importingRef: ReturnType<typeof useTaskState>["importingRef"];
  exporting: boolean; busy: boolean;
  clearLibrary: ReturnType<typeof useLibraryState>["clearLibrary"];
  setBusy: ReturnType<typeof useTaskState>["setBusy"];
  setSelected: ReturnType<typeof useBookDetails>["setSelected"];
  clearDetailDrafts: ReturnType<typeof useBookDetails>["clearDetailDrafts"];
  setQuery: ReturnType<typeof useLibraryView>["setQuery"];
  setCoverFilter: ReturnType<typeof useLibraryView>["setCoverFilter"];
  setReviewFilter: ReturnType<typeof useLibraryView>["setReviewFilter"];
  setInformationFilter: ReturnType<typeof useLibraryView>["setInformationFilter"];
  setTab: ReturnType<typeof useLibraryView>["setTab"];
  setBatchScope: ReturnType<typeof useLibraryView>["setBatchScope"];
  setPage: ReturnType<typeof useLibraryView>["setPage"];
  setCheckedIds: ReturnType<typeof useLibraryView>["setCheckedIds"];
  setError: ReturnType<typeof useTaskState>["setError"];
  setLookupResults: ReturnType<typeof useTaskState>["setLookupResults"];
  setLookupSummary: ReturnType<typeof useTaskState>["setLookupSummary"];
  setCoverBatchResult: ReturnType<typeof useTaskState>["setCoverBatchResult"];
  setExportScope: Dispatch<SetStateAction<"all" | "filtered" | "failed" | "selected">>;
  setShowExportReview: Dispatch<SetStateAction<boolean>>;
  setShowCoverBatchReview: Dispatch<SetStateAction<boolean>>;
  setShowClearConfirm: Dispatch<SetStateAction<boolean>>;
}
export function createLibraryCommands(getContext: () => LibraryCommandContext) {
  async function clearAll() {
    const c = getContext();
    if (!c.storageReady || c.importingRef.current || c.exporting || c.busy) return;
    c.importingRef.current = true;
    c.setBusy(true); c.setError(null);
    try {
      await c.clearLibrary();
      c.setSelected(null); c.clearDetailDrafts(); c.setCheckedIds(new Set());
      c.setBatchScope("view"); c.setPage(1);
      c.setQuery(""); c.setCoverFilter("all"); c.setReviewFilter("all");
      c.setInformationFilter("all"); c.setTab("audit");
      c.setLookupResults({}); c.setLookupSummary(""); c.setCoverBatchResult(null);
      c.setExportScope("all"); c.setShowExportReview(false);
      c.setShowCoverBatchReview(false); c.setShowClearConfirm(false);
    } catch (error) {
      c.setError("清空失败，未完成删除：" + (error instanceof Error ? error.message : String(error)));
    } finally {
      c.importingRef.current = false; c.setBusy(false);
    }
  }
  return { clearAll };
}

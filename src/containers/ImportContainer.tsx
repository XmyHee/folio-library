import type { ComponentProps } from "react";
import { ImportArea } from "../components/ImportArea";
import { TaskProgress } from "../components/TaskProgress";
import { useFolioSelector } from "../state/folio-context";

type Props = Pick<ComponentProps<typeof ImportArea>, "fileRef" | "folderRef" | "ingest" | "onCancel" | "onRetrySave" | "exportCsv" | "onReviewExport">;

/** Compose intake and task feedback without duplicating task or persistence state. */
export function ImportContainer(props: Props) {
  const state = useFolioSelector(s => ({ bookCount: s.books.length, busy: s.busy, exporting: s.exporting,
    storageReady: s.storageReady, olProgress: s.olProgress, progress: s.progress,
    coverBatchRunning: s.coverBatchRunning, storageStatus: s.storageStatus,
    csvDownloading: s.csvDownloading, exportProgress: s.exportProgress,
    canCancel: !!s.runtime.taskController.current,
  }));
  return <ImportArea {...state} {...props}>
    <TaskProgress {...state} />
  </ImportArea>;
}

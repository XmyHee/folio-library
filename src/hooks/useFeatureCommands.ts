import { useMemo, useRef } from "react";
import { useFolioStoreApi } from "../state/folio-context";
import { createWorkbenchCommands, type WorkbenchPorts } from "../commands/workbench";
import { downloadCsv, downloadLibraryZip } from "../lib/export";
import { generateCoverBatch } from "../lib/cover-workflow";
import { refreshTitleCover, titleCoverForBook, coverColors } from "../lib/document-cover";
import { parseEpubBatch, parseBook } from "../lib/parse";
import { lookupIsbnBatch } from "../lib/openlibrary";
import { primaryIsbn } from "../lib/normalize";
import { runPipeline } from "../lib/pipeline";
import { reviewKey } from "../lib/review";

/** Only lifecycle methods are bridged through a ref; canonical values stay in the store. */
export function useFeatureCommands(clearLibrary: WorkbenchPorts["clearLibrary"], details: WorkbenchPorts["details"]) {
  const store = useFolioStoreApi();
  const ports = useRef({ clearLibrary, details });
  ports.current = { clearLibrary, details };
  return useMemo(() => createWorkbenchCommands(store, () => ports.current, {
    parseEpubBatch, parseBook, lookupIsbnBatch, primaryIsbn, runPipeline, reviewKey,
    refreshTitleCover, titleCoverForBook, coverColors, generateCoverBatch,
    downloadCsv, downloadLibraryZip, URL,
  }), [store]);
}

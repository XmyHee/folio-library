import { useState, type ReactNode } from "react";
import { createFolioStore, type FolioStore } from "./folio-store";
import { FolioContext } from "./folio-context";

export function FolioStoreProvider({ children, store }: { children: ReactNode; store?: FolioStore }) {
  const [instance] = useState(() => store ?? createFolioStore());
  return <FolioContext.Provider value={instance}>{children}</FolioContext.Provider>;
}

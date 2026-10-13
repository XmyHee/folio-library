import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { selectSlice, type FolioStore, type FolioState, sliceKeys } from "./folio-store";

/** Keep context/subscriptions outside the component hot-refresh boundary. */
export const FolioContext = createContext<FolioStore | null>(null);
export function useFolioStoreApi() {
  const store = useContext(FolioContext);
  if (!store) throw new Error("FolioStoreProvider is required");
  return store;
}
export function useFolioSelector<T>(selector: (state: FolioState) => T) {
  return useStore(useFolioStoreApi(), useShallow(selector));
}
export function useFolioSlice<N extends keyof typeof sliceKeys>(name: N) {
  return useFolioSelector(state => selectSlice(state, name));
}

import { useFolioSelector } from "../state/folio-context";
import { BookDetailsPanel } from "../components/BookDetailsPanel";
import type { ComponentProps } from "react";
import type { useBookDetails } from "../hooks/useBookDetails";
import type { useFeatureCommands } from "../hooks/useFeatureCommands";

interface Props {
  details: ReturnType<typeof useBookDetails>;
  commands: ReturnType<typeof useFeatureCommands>;
  narrowScreen: boolean;
  neighbors: ComponentProps<typeof BookDetailsPanel>["neighbors"];
  viewBookCount: number;
}
export function DetailContainer({details, commands, narrowScreen, neighbors, viewBookCount}: Props) {
  const state = useFolioSelector(s => ({ busy: s.busy, exporting: s.exporting, storageReady: s.storageReady,
    lookupResults: s.lookupResults, olByIsbn: s.olByIsbn }));
  if (!details.selected) return null;
  return <BookDetailsPanel {...details} {...commands} {...state} selected={details.selected}
    narrowScreen={narrowScreen} neighbors={neighbors} selectedIndex={neighbors.index} viewBookCount={viewBookCount} />;
}

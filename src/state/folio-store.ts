import { createStore, type StoreApi } from "zustand/vanilla";
import type { Dispatch, SetStateAction } from "react";
import type { ParsedBook, NamingMode } from "../lib/types";
import type { ExportProgress, ExportReport } from "../lib/export";
import type { LookupResult, OpenLibraryHit } from "../lib/openlibrary";
import type { CoverFilter } from "../lib/cover-workflow";
import type { DetailDraft } from "../lib/detail-draft";
import { prepareNoteTemplate } from "../lib/notes";
import { defaultNoteTemplate } from "../lib/note-template";

export interface LibraryState {
  books: ParsedBook[];
  namingMode: NamingMode;
  useOnlineMeta: boolean;
  includeDuplicates: boolean;
  includeNotes: boolean;
  noteTemplate: string;
  savedNoteTemplate: string;
  exportReport: ExportReport | undefined;
  keepOverrides: Record<string, string>;
  olByIsbn: Map<string, OpenLibraryHit>;
  storageReady: boolean;
  storageStatus: string;
  saveRetry: number;
}
export interface TaskState {
  lookupResults: Record<string, LookupResult>;
  lookupSummary: string;
  olProgress: string | null;
  busy: boolean;
  progress: { done: number; total: number; current: string } | null;
  error: string | null;
  coverBatchRunning: boolean;
  coverBatchResult: string | null;
  exporting: boolean;
  csvDownloading: boolean;
}
export interface ViewState {
  query: string;
  coverFilter: CoverFilter;
  informationFilter: "all" | "issues" | "complete";
  reviewFilter: "all" | "pending" | "reviewed";
  tab: "audit" | "rename" | "dedupe";
  checkedIds: Set<string>;
  batchScope: "view" | "selected";
  page: number;
}
export interface DetailState {
  selectedId: string | null;
  metadataTitleDraft: string;
  metadataAuthorsDraft: string;
  coverTitleDraft: string;
  coverAuthorDraft: string;
  showDraftPrompt: boolean;
}
export interface WorkspaceState {
  showExportReview: boolean;
  exportScope: "all" | "filtered" | "failed" | "selected";
  excludePending: boolean;
  exportProgress: ExportProgress | null;
  notePreviewId: string;
  showCoverBatchReview: boolean;
  showClearConfirm: boolean;
}
export type FolioData = LibraryState & TaskState & ViewState & DetailState & WorkspaceState;
export type Setters<T> = { [K in keyof T as K extends string ? `set${Capitalize<K>}` : never]: Dispatch<SetStateAction<T[K]>> };
type Ref<T> = { current: T };
/** Non-serializable resources belong to the same mounted workbench, never to browser storage. */
export interface FolioRuntime {
  importingRef: Ref<boolean>;
  taskController: Ref<AbortController | null>;
  cancelCoverBatch: Ref<boolean>;
  csvDownloadLock: Ref<boolean>;
  saveQueue: Ref<Promise<void>>;
  clearing: Ref<boolean>;
  detailDrafts: Ref<Record<string, DetailDraft>>;
  pendingDetail: Ref<string | null>;
  detailPosition: Ref<number>;
}
export type FolioState = FolioData & Setters<FolioData> & { runtime: FolioRuntime };
export type FolioStore = StoreApi<FolioState>;

export const sliceKeys = {
  library: ["books", "namingMode", "useOnlineMeta", "includeDuplicates", "includeNotes", "noteTemplate", "savedNoteTemplate", "exportReport", "keepOverrides", "olByIsbn", "storageReady", "storageStatus", "saveRetry"],
  task: ["lookupResults", "lookupSummary", "olProgress", "busy", "progress", "error", "coverBatchRunning", "coverBatchResult", "exporting", "csvDownloading"],
  view: ["query", "coverFilter", "informationFilter", "reviewFilter", "tab", "checkedIds", "batchScope", "page"],
  detail: ["selectedId", "metadataTitleDraft", "metadataAuthorsDraft", "coverTitleDraft", "coverAuthorDraft", "showDraftPrompt"],
  workspace: ["showExportReview", "exportScope", "excludePending", "exportProgress", "notePreviewId", "showCoverBatchReview", "showClearConfirm"],
} as const;

/** A fresh instance per workbench/test. No singleton and no JSON persist middleware:
 * IndexedDB remains the only writer of books, File/Blob assets, Map and receipts.
 */
export function createFolioStore(): FolioStore {
  const template = prepareNoteTemplate(defaultNoteTemplate);
  const initial: FolioData = {
    books: [], namingMode: 1, useOnlineMeta: true, includeDuplicates: true, includeNotes: true,
    noteTemplate: template, savedNoteTemplate: template, exportReport: undefined,
    keepOverrides: {}, olByIsbn: new Map(), storageReady: false,
    storageStatus: "正在恢复本地书库…", saveRetry: 0,
    lookupResults: {}, lookupSummary: "", olProgress: null, busy: false, progress: null,
    error: null, coverBatchRunning: false, coverBatchResult: null, exporting: false, csvDownloading: false,
    query: "", coverFilter: "all", informationFilter: "all", reviewFilter: "all", tab: "audit",
    checkedIds: new Set(), batchScope: "view", page: 1,
    selectedId: null, metadataTitleDraft: "", metadataAuthorsDraft: "", coverTitleDraft: "", coverAuthorDraft: "", showDraftPrompt: false,
    showExportReview: false, exportScope: "all", excludePending: false, exportProgress: null,
    notePreviewId: "", showCoverBatchReview: false, showClearConfirm: false,
  };
  const runtime: FolioRuntime = {
    importingRef: { current: false }, taskController: { current: null }, cancelCoverBatch: { current: false },
    csvDownloadLock: { current: false }, saveQueue: { current: Promise.resolve() }, clearing: { current: false },
    detailDrafts: { current: {} }, pendingDetail: { current: null }, detailPosition: { current: 0 },
  };
  return createStore<FolioState>()((set) => {
    const setters = Object.fromEntries(Object.keys(initial).map(key => [
      `set${key[0].toUpperCase()}${key.slice(1)}`,
      (value: unknown) => set(state => {
        const field = key as keyof FolioData;
        const next = typeof value === "function" ? value(state[field]) : value;
        return Object.is(next, state[field]) ? state : { [key]: next } as Partial<FolioState>;
      }),
    ])) as Setters<FolioData>;
    return { ...initial, ...setters, runtime };
  });
}

type SliceName = keyof typeof sliceKeys;
type SliceData<N extends SliceName> = Pick<FolioData, (typeof sliceKeys)[N][number]>;
/** Stable setters keep the public command ports compatible with functional updates. */
export function selectSlice<N extends SliceName>(state: FolioState, name: N): SliceData<N> & Setters<SliceData<N>> {
  const result: Record<string, unknown> = {};
  for (const key of sliceKeys[name]) {
    const setter = `set${key[0].toUpperCase()}${key.slice(1)}` as keyof FolioState;
    result[key] = state[key]; result[setter] = state[setter];
  }
  return result as SliceData<N> & Setters<SliceData<N>>;
}

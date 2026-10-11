import { useEffect, useRef, useState } from "react";
import type { ParsedBook, NamingMode } from "../lib/types";
import type { ExportReport } from "../lib/export";
import { loadLibrary, saveLibrary } from "../lib/storage";
import type { ClearedLibrary } from "../lib/storage";
import { revokeCovers } from "../lib/book-assets";
import { prepareNoteTemplate } from "../lib/notes";
import { defaultNoteTemplate } from "../lib/note-template";

/** Sole owner of persisted book/settings state, restoration and serialized saves. */
export function useLibraryState(busy: boolean) {
  const [books, setBooks] = useState<ParsedBook[]>([]);
  const [namingMode, setNamingMode] = useState<NamingMode>(1);
  const [useOnlineMeta, setUseOnlineMeta] = useState(true);
  const [includeDuplicates, setIncludeDuplicates] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [noteTemplate, setNoteTemplate] = useState(() => prepareNoteTemplate(defaultNoteTemplate));
  const [savedNoteTemplate, setSavedNoteTemplate] = useState(() => prepareNoteTemplate(defaultNoteTemplate));
  const [exportReport, setExportReport] = useState<ExportReport | undefined>();
  const [keepOverrides, setKeepOverrides] = useState<Record<string, string>>({});
  const [olByIsbn, setOlByIsbn] = useState<Map<string, import("../lib/openlibrary").OpenLibraryHit>>(new Map());
  const [clearedLibrary, setClearedLibrary] = useState<ClearedLibrary | undefined>();

  useEffect(() => {
    if (!clearedLibrary) return;
    const timer = window.setTimeout(() => { revokeCovers(clearedLibrary.books); setClearedLibrary(undefined); }, Math.max(0, clearedLibrary.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [clearedLibrary]);

  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState("正在恢复本地书库…");
  const [saveRetry, setSaveRetry] = useState(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!storageReady || savedNoteTemplate === noteTemplate) return;
    setStorageStatus("模板修改待保存，请稍候…");
    const timer = window.setTimeout(() => setSavedNoteTemplate(noteTemplate), 500);
    return () => window.clearTimeout(timer);
  }, [storageReady, savedNoteTemplate, noteTemplate]);

  useEffect(() => {
    let cancelled = false;
    void loadLibrary().then((snapshot) => {
      if (cancelled) { if (snapshot) { revokeCovers(snapshot.books); if (snapshot.clearedLibrary) revokeCovers(snapshot.clearedLibrary.books); } return; }
      if (snapshot) {
        setBooks(snapshot.books);
        setNamingMode(snapshot.namingMode);
        setKeepOverrides(snapshot.keepOverrides);
        setOlByIsbn(snapshot.olByIsbn);
        setUseOnlineMeta(snapshot.useOnlineMeta);
        setIncludeDuplicates(snapshot.includeDuplicates);
        if (snapshot.exportSettings) {
          setNoteTemplate(snapshot.exportSettings.noteTemplate);
          setSavedNoteTemplate(snapshot.exportSettings.noteTemplate);
          setIncludeNotes(snapshot.exportSettings.includeNotes);
        }
        setExportReport(snapshot.lastExport);
        setClearedLibrary(snapshot.clearedLibrary);
      }
      setStorageReady(true);
    }).catch((error: unknown) => {
      if (!cancelled) setStorageStatus("恢复失败，已停止写入以保留原数据：" + String(error));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!storageReady || busy || savedNoteTemplate !== noteTemplate) return;
    let cancelled = false;
    setStorageStatus("正在保存，请等待完成后关闭页面…");
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveLibrary({
      version: 1, books, namingMode, keepOverrides, olByIsbn, useOnlineMeta, includeDuplicates,
      exportSettings: { noteTemplate, includeNotes }, lastExport: exportReport, clearedLibrary,
    }));
    void saveQueue.current.then(() => {
      if (!cancelled) setStorageStatus("已保存到此浏览器，刷新或重新打开可恢复");
    }).catch((error: unknown) => {
      if (!cancelled) setStorageStatus("保存失败，当前列表仍保留，请导出备份或重试：" + String(error));
    });
    return () => { cancelled = true; };
  }, [storageReady, busy, books, namingMode, keepOverrides, olByIsbn, useOnlineMeta, includeDuplicates, saveRetry, noteTemplate, savedNoteTemplate, includeNotes, exportReport, clearedLibrary]);

  return {

    books, setBooks, namingMode, setNamingMode,

    useOnlineMeta, setUseOnlineMeta, includeDuplicates, setIncludeDuplicates,

    includeNotes, setIncludeNotes, noteTemplate, setNoteTemplate,

    exportReport, setExportReport, keepOverrides, setKeepOverrides,

    olByIsbn, setOlByIsbn, clearedLibrary, setClearedLibrary,

    storageReady, storageStatus, setSaveRetry,

  };
}

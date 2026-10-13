import { useEffect, useRef, useState } from "react";
import type { ParsedBook, NamingMode } from "../lib/types";
import type { ExportReport } from "../lib/export";
import { loadLibrary, saveLibrary } from "../lib/storage";
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
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState("正在恢复本地书库…");
  const [saveRetry, setSaveRetry] = useState(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const clearing = useRef(false);

  useEffect(() => {
    if (!storageReady || savedNoteTemplate === noteTemplate) return;
    setStorageStatus("模板修改待保存，请稍候…");
    const timer = window.setTimeout(() => setSavedNoteTemplate(noteTemplate), 500);
    return () => window.clearTimeout(timer);
  }, [storageReady, savedNoteTemplate, noteTemplate]);

  useEffect(() => {
    let cancelled = false;
    void loadLibrary().then((snapshot) => {
      if (cancelled) { if (snapshot) { revokeCovers(snapshot.books);  } return; }
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
      }
      setStorageReady(true);
    }).catch((error: unknown) => {
      if (!cancelled) setStorageStatus("恢复失败，已停止写入以保留原数据：" + String(error));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!storageReady || busy || clearing.current || savedNoteTemplate !== noteTemplate) return;
    let cancelled = false;
    setStorageStatus("正在保存，请等待完成后关闭页面…");
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveLibrary({
      version: 1, books, namingMode, keepOverrides, olByIsbn, useOnlineMeta, includeDuplicates,
      exportSettings: { noteTemplate, includeNotes }, lastExport: exportReport,
    }));
    void saveQueue.current.then(() => {
      if (!cancelled) setStorageStatus("已保存到此浏览器，刷新或重新打开可恢复");
    }).catch((error: unknown) => {
      if (!cancelled) setStorageStatus("保存失败，当前列表仍保留，请导出备份或重试：" + String(error));
    });
    return () => { cancelled = true; };
  }, [storageReady, busy, books, namingMode, keepOverrides, olByIsbn, useOnlineMeta, includeDuplicates, saveRetry, noteTemplate, savedNoteTemplate, includeNotes, exportReport]);

  /** Drain earlier saves, then delete files and catalog in one committed transaction. */
  async function clearLibrary() {
    if (!storageReady || clearing.current) throw new Error("本地书库尚未就绪");
    clearing.current = true;
    setStorageReady(false);
    setStorageStatus("正在清空本地书库，请等待完成…");
    const previousBooks = books;
    const operation = saveQueue.current.catch(() => {}).then(() => saveLibrary({
      version: 1, books: [], namingMode, keepOverrides: {}, olByIsbn: new Map(),
      useOnlineMeta, includeDuplicates, exportSettings: { noteTemplate, includeNotes },
    }));
    saveQueue.current = operation;
    try {
      await operation;
      setBooks([]); setKeepOverrides({}); setOlByIsbn(new Map()); setExportReport(undefined);
      setSavedNoteTemplate(noteTemplate);
      revokeCovers(previousBooks);
      setStorageStatus("本地书库已清空");
    } catch (error) {
      setStorageStatus("清空失败，书库仍保留：" + String(error));
      throw error;
    } finally {
      clearing.current = false;
      setStorageReady(true);
    }
  }

  return {

    books, setBooks, namingMode, setNamingMode,

    useOnlineMeta, setUseOnlineMeta, includeDuplicates, setIncludeDuplicates,

    includeNotes, setIncludeNotes, noteTemplate, setNoteTemplate,

    exportReport, setExportReport, keepOverrides, setKeepOverrides,

    olByIsbn, setOlByIsbn, clearLibrary,

    storageReady, storageStatus, setSaveRetry,

  };
}

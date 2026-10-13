import { useEffect } from "react";
import { useFolioSlice, useFolioStoreApi } from "../state/folio-context";
import { loadLibrary, saveLibrary } from "../lib/storage";
import { revokeCovers } from "../lib/book-assets";

/** Sole persistence lifecycle adapter; all shared values live in the workbench store. */
export function useLibraryState(busy: boolean) {
  const store = useFolioStoreApi();
  const {
    books, setBooks, namingMode, setNamingMode, useOnlineMeta, setUseOnlineMeta,
    includeDuplicates, setIncludeDuplicates, includeNotes, setIncludeNotes,
    noteTemplate, setNoteTemplate, savedNoteTemplate, setSavedNoteTemplate,
    exportReport, setExportReport, keepOverrides, setKeepOverrides, olByIsbn, setOlByIsbn,
    storageReady, setStorageReady, storageStatus, setStorageStatus, saveRetry, setSaveRetry,
  } = useFolioSlice("library");
  const { saveQueue, clearing } = store.getState().runtime;

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
      store.setState(snapshot ? {
        books: snapshot.books, namingMode: snapshot.namingMode, keepOverrides: snapshot.keepOverrides,
        olByIsbn: snapshot.olByIsbn, useOnlineMeta: snapshot.useOnlineMeta,
        includeDuplicates: snapshot.includeDuplicates, exportReport: snapshot.lastExport,
        ...(snapshot.exportSettings ? {
          noteTemplate: snapshot.exportSettings.noteTemplate, savedNoteTemplate: snapshot.exportSettings.noteTemplate,
          includeNotes: snapshot.exportSettings.includeNotes,
        } : {}), storageReady: true,
      } : { storageReady: true });
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
    const { storageReady, books, namingMode, useOnlineMeta, includeDuplicates, noteTemplate, includeNotes } = store.getState();
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
      store.setState({ books: [], keepOverrides: {}, olByIsbn: new Map(), exportReport: undefined, savedNoteTemplate: noteTemplate });
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

import type { ParsedBook, NamingMode } from "./types";
import type { OpenLibraryHit } from "./openlibrary";
import { refreshTitleCover } from "./document-cover";

export type ClearedLibrary = { books: ParsedBook[]; keepOverrides: Record<string, string>; olByIsbn: Map<string, OpenLibraryHit>; lastExport?: import("./export").ExportReport; expiresAt: number };
export type LibrarySnapshot = {
  version: 1;
  books: ParsedBook[];
  namingMode: NamingMode;
  keepOverrides: Record<string, string>;
  olByIsbn: Map<string, OpenLibraryHit>;
  useOnlineMeta: boolean;
  includeDuplicates: boolean;
  exportSettings?: { noteTemplate: string; includeNotes: boolean };
  lastExport?: import("./export").ExportReport;
  clearedLibrary?: ClearedLibrary;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("folio-library", 2);
    request.onupgradeneeded = () => {
      for (const name of ["library", "books", "assets"]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("无法打开本地书库"));
    request.onblocked = () => {
      request.onsuccess = () => request.result.close();
      reject(new Error("本地书库升级被其他页面阻止，请关闭其他 Folio 页面后重试"));
    };
  });
}

export async function loadLibrary(): Promise<LibrarySnapshot | null> {
  const db = await openDatabase();
  try {
    const stored = await new Promise<LibrarySnapshot | undefined>((resolve, reject) => {
      const tx = db.transaction(["library", "books", "assets"], "readonly");
      const settings = tx.objectStore("library").get("settings");
      const legacy = tx.objectStore("library").get("current");
      const records = tx.objectStore("books").getAll();
      const assets = tx.objectStore("assets").getAll();
      tx.oncomplete = () => {
        if (!settings.result) { revision = 0; metadataCache.clear(); assetCache.clear(); resolve(legacy.result); return; }
        const value = settings.result;
        revision = value.revision;
        const byId = new Map(assets.result.map(item => [item.id, item]));
        const byBook = new Map<string, ParsedBook>();
        metadataCache.clear(); assetCache.clear();
        for (const record of records.result) {
          const asset = byId.get(record.id);
          if (!asset) { reject(new Error("本地书籍文件不完整，已保留原数据")); return; }
          const { id: _id, ...blobs } = asset;
          const {markdownFile, markdownAssets, ...bookBlobs} = blobs;
          if (record.markdownSource && (!(markdownFile instanceof Blob) || !Array.isArray(markdownAssets)
            || markdownAssets.length !== record.markdownSource.assets.length
            || markdownAssets.some((item: import("./markdown/assets").MarkdownAsset, index: number) => !(item.file instanceof Blob) || item.path !== record.markdownSource.assets[index]?.path || item.hash !== record.markdownSource.assets[index]?.hash))) {
            reject(new Error("Markdown 原件或附件不完整，已保留原数据")); return;
          }
          byBook.set(record.id, { ...record, ...bookBlobs,
            ...(record.markdownSource ? {markdownSource:{...record.markdownSource,file:markdownFile,assets:markdownAssets}} : {}) });
          metadataCache.set(record.id, JSON.stringify(record));
          assetCache.set(record.id, blobs);
        }
        const restore = (ids: string[]) => ids.map(id => {
          const book = byBook.get(id);
          if (!book) throw new Error("书库索引不完整，已保留原数据");
          return book;
        });
        try {
          resolve({ ...value, books: restore(value.bookIds), clearedLibrary: value.clearedLibrary ? { ...value.clearedLibrary, books: restore(value.clearedLibrary.bookIds) } : undefined });
        } catch (error) { reject(error); }
      };
      tx.onabort = () => reject(tx.error ?? new Error("读取本地书库失败"));
      tx.onerror = () => reject(tx.error ?? new Error("读取本地书库失败"));
    });
    if (!stored) return null;
    if (stored.version !== 1 || !Array.isArray(stored.books) || !(stored.olByIsbn instanceof Map)
      || ![1, 2].includes(stored.namingMode) || !stored.keepOverrides
      || typeof stored.useOnlineMeta !== "boolean" || typeof stored.includeDuplicates !== "boolean") {
      throw new Error("本地书库版本或数据结构无法识别，已保留原数据");
    }
    const books: ParsedBook[] = [];
    try {
      for (const book of stored.books) {
        if (!(book.file instanceof Blob) || !book.id) throw new Error("本地书籍文件不完整");
        if (book.titleCoverBlob && book.coverStyleVersion !== 2) {
          try {
            book.titleCoverBlob = await refreshTitleCover(book);
            book.coverStyleVersion = 2;
          } catch (error) {
            book.titleCoverBlob = undefined;
            book.coverPreference = "original";
            book.warnings = [...(book.warnings ?? []), "旧封面更新失败，请重新生成：" + String(error)];
          }
        }
        books.push({ ...book, coverUrl: book.coverBlob ? URL.createObjectURL(book.coverBlob) : undefined, titleCoverUrl: book.titleCoverBlob ? URL.createObjectURL(book.titleCoverBlob) : undefined });
      }
    } catch (error) {
      for (const book of books) {
        if (book.coverUrl) URL.revokeObjectURL(book.coverUrl);
        if (book.titleCoverUrl) URL.revokeObjectURL(book.titleCoverUrl);
      }
      throw error;
    }
    let clearedLibrary = stored.clearedLibrary;
    if (clearedLibrary && clearedLibrary.expiresAt > Date.now()) {
      if (!Array.isArray(clearedLibrary.books) || !(clearedLibrary.olByIsbn instanceof Map) || !clearedLibrary.keepOverrides) throw new Error("撤销记录不完整，已保留数据");
      clearedLibrary = { ...clearedLibrary, books: clearedLibrary.books.map(book => {
        if (!(book.file instanceof Blob) || !book.id) throw new Error("撤销原文件不完整");
        return { ...book, coverUrl: book.coverBlob ? URL.createObjectURL(book.coverBlob) : undefined, titleCoverUrl: book.titleCoverBlob ? URL.createObjectURL(book.titleCoverBlob) : undefined };
      }) };
    } else clearedLibrary = undefined;
    return { ...stored, books, clearedLibrary };
  } finally {
    db.close();
  }
}

type Assets = Pick<ParsedBook, "file" | "coverBlob" | "titleCoverBlob"> & {
  markdownFile?: File; markdownAssets?: import("./markdown/assets").MarkdownAsset[];
};
let revision = 0;
const metadataCache = new Map<string, string>();
const assetCache = new Map<string, Assets>();

/** Metadata and original bytes commit atomically. Unchanged blobs are never rewritten. */
export async function saveLibrary(snapshot: LibrarySnapshot): Promise<void> {
  const db = await openDatabase();
  const nextMetadata = new Map<string, string>(), nextAssets = new Map<string, Assets>();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["library", "books", "assets"], "readwrite");
      let conflict = false;
      tx.oncomplete = () => { revision += 1; metadataCache.clear(); assetCache.clear(); nextMetadata.forEach((v,k) => metadataCache.set(k,v)); nextAssets.forEach((v,k) => assetCache.set(k,v)); resolve(); };
      tx.onabort = () => reject(conflict ? new Error("书库已在其他页面更新，请刷新后重试；当前修改尚未保存") : tx.error ?? new Error("本地书库保存中断"));
      tx.onerror = () => reject(tx.error ?? new Error("本地书库保存失败"));
      const store = tx.objectStore("library");
      const check = store.get("settings");
      check.onsuccess = () => {
        if (check.result && check.result.revision !== revision) { conflict = true; tx.abort(); return; }
        const active = new Set<string>();
        const all = [...(snapshot.clearedLibrary?.books ?? []), ...snapshot.books];
        for (const book of all) {
          const { file, coverBlob, titleCoverBlob, coverUrl: _url, titleCoverUrl: _titleUrl, markdownSource, ...fields } = book;
          const record = {...fields, ...(markdownSource ? {markdownSource:{...markdownSource,file:undefined,assets:markdownSource.assets.map(({file:_asset,...asset})=>asset)}} : {})};
          const serialized = JSON.stringify(record);
          const previous = assetCache.get(book.id);
          const blobs:Assets = { file, coverBlob, titleCoverBlob, ...(markdownSource ? {markdownFile:markdownSource.file,markdownAssets:markdownSource.assets} : {}) };
          active.add(book.id); nextMetadata.set(book.id, serialized); nextAssets.set(book.id, blobs);
          if (metadataCache.get(book.id) !== serialized) tx.objectStore("books").put(record, book.id);
          if (!previous || previous.file !== file || previous.coverBlob !== coverBlob || previous.titleCoverBlob !== titleCoverBlob
            || previous.markdownFile !== blobs.markdownFile || previous.markdownAssets !== blobs.markdownAssets) tx.objectStore("assets").put({ id: book.id, ...blobs }, book.id);
        }
        const keys = tx.objectStore("books").getAllKeys();
        keys.onsuccess = () => { for (const key of keys.result) if (!active.has(String(key))) { tx.objectStore("books").delete(key); tx.objectStore("assets").delete(key); } };
        const { books: _books, clearedLibrary, ...settings } = snapshot;
        store.put({ ...settings, revision: revision + 1, bookIds: snapshot.books.map(book => book.id), clearedLibrary: clearedLibrary ? { ...clearedLibrary, books: undefined, bookIds: clearedLibrary.books.map(book => book.id) } : undefined }, "settings");
        // Remove the legacy snapshot only in the same successful migration transaction.
        store.delete("current");
      };
    });
  } finally { db.close(); }
}

import { generateCoverBatch, matchesCoverFilter, needsCoverGeneration } from "./lib/cover-workflow";
import type { CoverFilter } from "./lib/cover-workflow";
import { refreshTitleCover } from "./lib/document-cover";
import { coverUrlFor, titleCoverForBook, coverColors } from "./lib/document-cover";
import { currentViewBooks, reviewNeighbors } from "./lib/view-scope";
import { savedDetailDraft, detailDraftChanged } from "./lib/detail-draft";
import type { DetailDraft } from "./lib/detail-draft";
import type { ClearedLibrary } from "./lib/storage";
import type { LookupResult } from "./lib/openlibrary";
import { loadLibrary, saveLibrary } from "./lib/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadCsv, downloadLibraryZip } from "./lib/export";
import type { ExportReport, ExportProgress } from "./lib/export";
import { createExportPlan } from "./lib/export-plan";
import { renderBookNote, prepareNoteTemplate, noteVariables } from "./lib/notes";
import { defaultNoteTemplate } from "./lib/note-template";
import { filesFromDataTransfer, filesFromInput, formatBytes } from "./lib/files";
import { parseEpubBatch, parseBook, revokeCovers } from "./lib/parse";
import { lookupIsbnBatch } from "./lib/openlibrary";
import { primaryIsbn } from "./lib/normalize";
import { runPipeline } from "./lib/pipeline";
import { reviewReasons, reviewKey, isReviewed, needsReview } from "./lib/review";
import type { DerivedBook, NamingMode, ParsedBook } from "./lib/types";

const ROLE_LABEL: Record<DerivedBook["role"], { text: string; cls: string }> = {
  unique: { text: "唯一", cls: "badge-accent" },
  keep: { text: "保留", cls: "badge-keep" },
  duplicate: { text: "重复", cls: "badge-drop" },
  identical: { text: "相同", cls: "badge-drop" },
};

function Cover({ src, kind }: { src?: string; kind?: string }) {
  return (
    <div className="cover" aria-hidden>
      {src ? <img src={src} alt="" /> : kind === "pdf" ? "PDF 首页不可用" : kind === "epub" ? "EPUB 无封面" : "无预览"}
    </div>
  );
}

export default function App() {
  const [books, setBooks] = useState<ParsedBook[]>([]);
  const [namingMode, setNamingMode] = useState<NamingMode>(1);
  const [useOnlineMeta, setUseOnlineMeta] = useState(true);
  const [lookupResults, setLookupResults] = useState<Record<string, LookupResult>>({});
  const [lookupSummary, setLookupSummary] = useState("");
  const [olProgress, setOlProgress] = useState<string | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [noteTemplate, setNoteTemplate] = useState(() => prepareNoteTemplate(defaultNoteTemplate));
  const [savedNoteTemplate, setSavedNoteTemplate] = useState(() => prepareNoteTemplate(defaultNoteTemplate));
  const [showExportReview, setShowExportReview] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "filtered" | "failed" | "selected">("all");
  const [excludePending, setExcludePending] = useState(false);
  const [exportReport, setExportReport] = useState<ExportReport | undefined>();
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [notePreviewId, setNotePreviewId] = useState("");
  const [keepOverrides, setKeepOverrides] = useState<Record<string, string>>({});
  const [olByIsbn, setOlByIsbn] = useState<Map<string, import("./lib/openlibrary").OpenLibraryHit>>(new Map());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [coverFilter, setCoverFilter] = useState<CoverFilter>("all");
  const [informationFilter, setInformationFilter] = useState<"all" | "issues" | "complete">("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "pending" | "reviewed">("all");
  const [coverTitleDraft, setCoverTitleDraft] = useState("");
  const [coverAuthorDraft, setCoverAuthorDraft] = useState("");
  const [showCoverBatchReview, setShowCoverBatchReview] = useState(false);
  const [coverBatchRunning, setCoverBatchRunning] = useState(false);
  const [coverBatchResult, setCoverBatchResult] = useState<string | null>(null);
  const cancelCoverBatch = useRef(false);
  const [tab, setTab] = useState<"audit" | "rename" | "dedupe">("audit");
  const [clearedLibrary, setClearedLibrary] = useState<ClearedLibrary | undefined>();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const detailDrafts = useRef<Record<string, DetailDraft>>({});
  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem("folio-detail-drafts") || "{}");
      for (const [id, draft] of Object.entries(stored)) {
        if (draft && typeof draft === "object" && ["title", "authors", "coverTitle", "coverAuthor"].every(key => typeof (draft as Record<string, unknown>)[key] === "string")) detailDrafts.current[id] = draft as DetailDraft;
      }
    } catch { /* Optional drafts do not block the saved library. */ }
  }, []);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [batchScope, setBatchScope] = useState<"view" | "selected">("view");
  const [page, setPage] = useState(1);
  const [narrowScreen, setNarrowScreen] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => { const media = window.matchMedia("(max-width: 900px)"); const update = () => setNarrowScreen(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const pageSize = 40;
  const taskController = useRef<AbortController | null>(null);
  const pendingDetail = useRef<DerivedBook | null>(null);
  const detailPosition = useRef(0);
  function finishDetail() { setSelected(pendingDetail.current); setShowDraftPrompt(false); }
  function openDetails(book: DerivedBook) {
    if (busy || exporting) return;
    if (selected?.id === book.id) return;
    pendingDetail.current = book;
    if (draftDirty) setShowDraftPrompt(true); else finishDetail();
  }
  function toggleBook(id: string) { setCheckedIds(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  const [selected, setSelected] = useState<DerivedBook | null>(null);
  const [metadataTitleDraft, setMetadataTitleDraft] = useState("");
  const [metadataAuthorsDraft, setMetadataAuthorsDraft] = useState("");
  useEffect(() => {
    if (!selected) return;
    const draft = detailDrafts.current[selected.id] ?? savedDetailDraft(selected);
    setMetadataTitleDraft(draft.title); setMetadataAuthorsDraft(draft.authors);
    setCoverTitleDraft(draft.coverTitle); setCoverAuthorDraft(draft.coverAuthor);
    setShowDraftPrompt(false);
  }, [selected?.id, selected?.resolvedTitle, selected?.resolvedAuthors?.join("\n")]);
  useEffect(() => { document.getElementById("detail-title")?.focus(); }, [selected?.id]);
  const currentDraft: DetailDraft = { title: metadataTitleDraft, authors: metadataAuthorsDraft, coverTitle: coverTitleDraft, coverAuthor: coverAuthorDraft };
  const draftDirty = !!selected && detailDraftChanged(selected, currentDraft);
  const metadataDirty = !!selected && (metadataTitleDraft !== savedDetailDraft(selected).title || metadataAuthorsDraft !== savedDetailDraft(selected).authors);
  function persistDraft(book: DerivedBook, draft?: DetailDraft) {
    if (draft && detailDraftChanged(book, draft)) detailDrafts.current[book.id] = draft;
    else delete detailDrafts.current[book.id];
    try { sessionStorage.setItem("folio-detail-drafts", JSON.stringify(detailDrafts.current)); }
    catch { setError("草稿暂不能写入浏览器，请保存修改后再关闭页面。"); }
  }
  function updateDetailDraft(key: keyof DetailDraft, value: string) {
    if (!selected) return;
    const next = { ...currentDraft, [key]: value };
    persistDraft(selected, next);
    if (key === "title") setMetadataTitleDraft(value);
    else if (key === "authors") setMetadataAuthorsDraft(value);
    else if (key === "coverTitle") setCoverTitleDraft(value);
    else setCoverAuthorDraft(value);
  }
  function closeDetails() {
    if (busy || exporting) return;
    pendingDetail.current = null;
    if (draftDirty) setShowDraftPrompt(true);
    else finishDetail();
  }
  useEffect(() => {
    if (!draftDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftDirty]);
  useEffect(() => {
    if (!clearedLibrary) return;
    const timer = window.setTimeout(() => { revokeCovers(clearedLibrary.books); setClearedLibrary(undefined); }, Math.max(0, clearedLibrary.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [clearedLibrary]);
  const [exporting, setExporting] = useState(false);
  const [csvDownloading, setCsvDownloading] = useState(false);
  const csvDownloadLock = useRef(false);
  useEffect(() => {
    if (!csvDownloading) return;
    const timer = window.setTimeout(() => { csvDownloadLock.current = false; setCsvDownloading(false); }, 1500);
    return () => window.clearTimeout(timer);
  }, [csvDownloading]);
  const [over, setOver] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const importingRef = useRef(false);
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

  useEffect(() => {
    const isFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => {
      if (!isFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      if (storageReady && !importingRef.current) setOver(true);
    };
    const over = (event: DragEvent) => {
      if (!isFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = storageReady && !importingRef.current ? "copy" : "none";
    };
    const leave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setOver(false);
    };
    const drop = (event: DragEvent) => {
      if (!isFiles(event) || !event.dataTransfer) return;
      event.preventDefault();
      void onDrop({ preventDefault: () => event.preventDefault(), dataTransfer: event.dataTransfer });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [storageReady, useOnlineMeta]);

  const pipeline = useMemo(
    () => runPipeline(books, namingMode, keepOverrides, { online: useOnlineMeta, olByIsbn }),
    [books, namingMode, keepOverrides, useOnlineMeta, olByIsbn],
  );

  useEffect(() => {
    setSelected(previous => previous ? pipeline.books.find(book => book.id === previous.id) ?? null : null);
  }, [pipeline.books]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = pipeline.books.filter(book => matchesCoverFilter(book, coverFilter) && (informationFilter === "all" || (informationFilter === "issues" ? reviewReasons(book).length > 0 : reviewReasons(book).length === 0)) && (reviewFilter === "all" || (reviewFilter === "pending" ? needsReview(book) : isReviewed(book))));
    if (!q) return matching;
    return matching.filter((b) =>
      [b.rawTitle, b.originalName, b.proposedName, b.displayAuthor, b.publisher]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [pipeline.books, query, coverFilter, reviewFilter, informationFilter]);

  const renameBooks = currentViewBooks(filtered, pipeline.books, pipeline.groups, "rename");
  const duplicateBooks = pipeline.books.filter(book => book.groupId !== null);
  const visibleGroups = pipeline.groups.filter(group => group.bookIds.some(id => filtered.some(book => book.id === id)));
  const viewBooks = useMemo(() => currentViewBooks(filtered, pipeline.books, pipeline.groups, tab), [filtered, pipeline, tab]);
  const selectedBooks = useMemo(() => pipeline.books.filter(book => checkedIds.has(book.id)), [pipeline, checkedIds]);
  const batchBooks = batchScope === "selected" ? selectedBooks : viewBooks;
  const coverCandidates = batchBooks.filter(needsCoverGeneration);
  const pageCount = Math.max(1, Math.ceil((tab === "dedupe" ? visibleGroups.length : viewBooks.length) / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageBooks = viewBooks.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageGroups = visibleGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const neighbors = reviewNeighbors(viewBooks, selected?.id, detailPosition.current);
  const selectedIndex = neighbors.index;
  useEffect(() => { if (selectedIndex >= 0) detailPosition.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { setPage(1); }, [query, coverFilter, informationFilter, reviewFilter, tab]);
  useEffect(() => { const ids = new Set(books.map(book => book.id)); setCheckedIds(previous => new Set([...previous].filter(id => ids.has(id)))); }, [books]);
  const failedIds = useMemo(() => new Set(exportReport?.records.filter(record => record.status === "failed").map(record => record.id)), [exportReport]);
  const exportBooks = useMemo(() => exportScope === "selected" ? selectedBooks : exportScope === "filtered" ? viewBooks : exportScope === "failed" ? pipeline.books.filter(book => failedIds.has(book.id)) : pipeline.books, [exportScope, selectedBooks, viewBooks, pipeline, failedIds]);
  const exportPlan = useMemo(() => createExportPlan(exportBooks, { includeDuplicates, includeNotes, noteTemplate, excludePending }), [exportBooks, includeDuplicates, includeNotes, noteTemplate, excludePending]);
  const previewEntry = exportPlan.entries.find(entry => entry.book.id === notePreviewId && entry.notePath) || exportPlan.entries.find(entry => entry.notePath);
  let notePreview = "没有符合当前范围的笔记。";
  if (previewEntry?.path) {
    try { notePreview = renderBookNote(previewEntry.book, noteTemplate, previewEntry.path, previewEntry.notePath); }
    catch (error) { notePreview = String(error); }
  }

  async function ingest(files: File[]) {
    if (!storageReady || importingRef.current) return;
    if (files.length === 0) {
      setError("没有选中文件。请选择书籍文件或文件夹。");
      return;
    }
    importingRef.current = true;
    setBusy(true);
    setError(null);
    setOlProgress(null);
    setProgress({ done: 0, total: files.length, current: files[0]?.name ?? "" });
    taskController.current = new AbortController();
    try {
      const parsed = await parseEpubBatch(files, (done, total, current) => {
        setProgress({ done, total, current });
      }, 2, taskController.current.signal);

      // Tier-1 prep: collect ISBNs and optionally query Open Library
      if (useOnlineMeta && !taskController.current.signal.aborted) {
        const isbns = parsed
          .map((b) => b.isbn || primaryIsbn(b.identifiers) || "")
          .filter(Boolean);
        if (isbns.length > 0) {
          setOlProgress("书目查询中（Google Books / Open Library）…");
          try {
            const hits = await lookupIsbnBatch(isbns, (done, total) => {
              setOlProgress("书目查询 " + done + "/" + total);
            }, 2, { signal: taskController.current.signal, onResult: (isbn, result) => {
              setLookupResults(previous => ({ ...previous, [isbn]: result }));
              if (result.hit) setOlByIsbn(previous => new Map([...previous, [isbn, result.hit!]]));
            } });
            setOlByIsbn((previous) => new Map([...previous, ...hits]));
          } catch {
            setError("在线书目查询未完成，当前使用书内元数据或文件名；请检查结果。");
          }
          setOlProgress(null);
        }
      }

      setBooks((previous) => [...previous, ...parsed]);
      if (taskController.current.signal.aborted) setError(`导入已停止，保留已完成的 ${parsed.length} 本。`);
      setQuery("");
      setSelected(null);
      setTab("audit");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "解析失败";
      setError(
        /array buffer|内存|oom/i.test(msg)
          ? "浏览器内存不足。请分批导入，每次少选一些书。"
          : msg,
      );
    } finally {
      importingRef.current = false;
      taskController.current = null;
      setBusy(false);
      setProgress(null);
      setOlProgress(null);
    }
  }

  function clearAll() {
    if (!storageReady || importingRef.current || exporting || busy) return;
    if (clearedLibrary) revokeCovers(clearedLibrary.books);
    setClearedLibrary({ books, keepOverrides, olByIsbn, lastExport: exportReport, expiresAt: Date.now() + 10 * 60 * 1000 });
    setOlByIsbn(new Map()); setBooks([]); setKeepOverrides({}); setSelected(null);
    setQuery(""); setCoverFilter("all"); setReviewFilter("all"); setInformationFilter("all"); setTab("audit"); setError(null);
    setLookupResults({}); setLookupSummary("");
    setExportReport(undefined); setExportScope("all"); setShowExportReview(false); setShowCoverBatchReview(false); setShowClearConfirm(false);
  }
  function undoClear() {
    if (!clearedLibrary || Date.now() >= clearedLibrary.expiresAt || busy || exporting || !storageReady) return;
    const active = new Set(books.map(book => book.id));
    setBooks(previous => [...clearedLibrary.books.filter(book => !active.has(book.id)), ...previous]);
    setKeepOverrides(previous => ({ ...clearedLibrary.keepOverrides, ...previous }));
    setOlByIsbn(previous => new Map([...clearedLibrary.olByIsbn, ...previous]));
    setExportReport(previous => previous ?? clearedLibrary.lastExport);
    setClearedLibrary(undefined); setQuery(""); setCoverFilter("all"); setReviewFilter("all"); setInformationFilter("all"); setTab("audit");
  }
  async function retryCatalog() {
    if (busy || exporting || importingRef.current || !storageReady || !useOnlineMeta) return;
    const isbns = [...new Set(viewBooks.map(book => book.isbn || primaryIsbn(book.identifiers) || "").filter(Boolean))];
    if (!isbns.length) { setLookupSummary("当前列表没有可查询的 ISBN。"); return; }
    importingRef.current = true; setBusy(true); setError(null);
    taskController.current = new AbortController();
    const outcomes: Record<string, LookupResult> = {};
    try {
      const hits = await lookupIsbnBatch(isbns, (done, total) => setOlProgress(`联网补全 ${done}/${total}`), 2, { force: true, signal: taskController.current.signal, onResult: (isbn, result) => { outcomes[isbn] = result; setLookupResults(previous => ({ ...previous, [isbn]: result })); if (result.hit) setOlByIsbn(previous => new Map([...previous, [isbn, result.hit!]])); } });
      setOlByIsbn(previous => new Map([...previous, ...hits]));
      setLookupResults(previous => ({ ...previous, ...outcomes }));
      setLookupSummary(`联网补全：匹配 ${Object.values(outcomes).filter(result => result.status === "found").length} 项；无结果 ${Object.values(outcomes).filter(result => result.status === "not_found").length} 项；失败或超时 ${Object.values(outcomes).filter(result => result.status === "failed" || result.status === "timeout").length} 项。已有书目保留。`);
    } catch (error) { setError("联网补全未完成：" + String(error)); }
    finally { importingRef.current = false; taskController.current = null; setBusy(false); setOlProgress(null); }
  }

  async function onDrop(e: { preventDefault: () => void; dataTransfer: DataTransfer }) {
    e.preventDefault();
    dragDepth.current = 0;
    setOver(false);
    if (!storageReady || importingRef.current) return;
    try {
      const files = await filesFromDataTransfer(e.dataTransfer);
      await ingest(files);
    } catch (error) {
      setError("无法读取拖入文件：" + String(error));
    }
  }

  function saveReviewedMetadata(book: DerivedBook, reset = false) {
    if (busy || exporting || !storageReady) return false;
    const title = metadataTitleDraft.replace(/\s+/g, " ").trim();
    if (!reset && !title) { setError("请填写书名后保存；作者未确认时可以留空。"); return false; }
    const manualMetadata = reset ? undefined : { title, authors: metadataAuthorsDraft.split(/\r?\n|[;；]/).map(value => value.trim()).filter(Boolean) };
    const nextBooks = books.map(item => item.id === book.id ? { ...item, manualMetadata } : item);
    const updated = runPipeline(nextBooks, namingMode, keepOverrides, { online: useOnlineMeta, olByIsbn }).books.find(item => item.id === book.id)!;
    const previousSaved = savedDetailDraft(book);
    const keepCoverDraft = coverTitleDraft !== previousSaved.coverTitle || coverAuthorDraft !== previousSaved.coverAuthor;
    const saved = savedDetailDraft(updated);
    const nextDraft = { ...saved, coverTitle: keepCoverDraft ? coverTitleDraft : saved.coverTitle, coverAuthor: keepCoverDraft ? coverAuthorDraft : saved.coverAuthor };
    persistDraft(updated, nextDraft);
    setBooks(nextBooks);
    setSelected(updated);
    setMetadataTitleDraft(updated.resolvedTitle || updated.rawTitle);
    setMetadataAuthorsDraft((updated.resolvedAuthors ?? []).join("\n"));
    setCoverTitleDraft(nextDraft.coverTitle);
    setCoverAuthorDraft(nextDraft.coverAuthor);
    setError(null);
    return true;
  }

  function confirmMetadataReview(book: DerivedBook, undo = false) {
    if (busy || exporting || !storageReady || metadataDirty) return;
    const reviewedMetadataKey = undo ? undefined : reviewKey(book);
    setBooks(previous => previous.map(item => item.id === book.id ? { ...item, reviewedMetadataKey } : item));
    setSelected(previous => previous?.id === book.id ? { ...previous, reviewedMetadataKey } : previous);
  }

  async function regenerateDocumentCover(book: DerivedBook) {
    if (importingRef.current || !storageReady) return;
    importingRef.current = true;
    setBusy(true);
    const pendingUrls: string[] = [];
    setError(null);
    try {
      const parsed = await parseBook(book.file);
      if (parsed.coverUrl) pendingUrls.push(parsed.coverUrl);
      if (parsed.status !== "ok") throw new Error(parsed.error || "重新识别失败，已保留原记录");
      const merged = { ...book, ...parsed, id: book.id, file: book.file, coverlessConfirmed: book.coverlessConfirmed,
        coverColor: book.coverColor, coverTitle: undefined, coverAuthor: undefined,
        resolvedTitle: undefined, resolvedAuthors: undefined, metaSource: undefined,
        coverPreference: book.coverPreference };
      const updated = runPipeline([merged], namingMode, {}, { online: useOnlineMeta, olByIsbn }).books[0]!;
      const generated = book.coverPreference === "title" ? await refreshTitleCover(updated) : undefined;
      const next = { ...merged, titleCoverBlob: generated, titleCoverUrl: generated ? URL.createObjectURL(generated) : undefined,
        coverStyleVersion: generated ? 2 : undefined, coverPreference: generated ? "title" as const : "original" as const };
      if (next.titleCoverUrl) pendingUrls.push(next.titleCoverUrl);
      const selectedNext = runPipeline(books.map(item => item.id === book.id ? next : item), namingMode, keepOverrides, { online: useOnlineMeta, olByIsbn }).books.find(item => item.id === book.id)!;
      setBooks(previous => previous.map(item => item.id === book.id ? next : item));
      setSelected(previous => previous?.id === book.id ? selectedNext : previous);
      setCoverTitleDraft(selectedNext.resolvedTitle || selectedNext.rawTitle);
      setCoverAuthorDraft(selectedNext.displayAuthor === "Unknown" ? "" : selectedNext.displayAuthor);
      if (book.coverUrl) URL.revokeObjectURL(book.coverUrl);
      if (book.titleCoverUrl) URL.revokeObjectURL(book.titleCoverUrl);
      pendingUrls.length = 0;
    } catch (error) {
      pendingUrls.forEach(url => URL.revokeObjectURL(url));
      setError("重新识别失败，已保留原记录：" + String(error));
    } finally {
      importingRef.current = false;
      setBusy(false);
    }
  }

  async function chooseTitleCover(book: DerivedBook, color = book.coverColor ?? coverColors[0]) {
    if (importingRef.current || !storageReady) return;
    importingRef.current = true;
    setBusy(true);
    try {
      const title = coverTitleDraft.trim(), author = coverAuthorDraft.trim();
      const blob = await titleCoverForBook(book, title, author, color);
      const patch = { coverTitle: title, coverAuthor: author, coverStyleVersion: 2, coverColor: color, titleCoverBlob: blob, titleCoverUrl: URL.createObjectURL(blob), coverPreference: "title" as const };
      persistDraft({ ...book, ...patch }, { ...currentDraft, coverTitle: title, coverAuthor: author });
      setCoverTitleDraft(title); setCoverAuthorDraft(author);
      setBooks(previous => previous.map(item => item.id === book.id ? { ...item, ...patch } : item));
      setSelected(previous => previous?.id === book.id ? { ...previous, ...patch } : previous);
      if (book.titleCoverUrl) URL.revokeObjectURL(book.titleCoverUrl);
    } catch (error) {
      setError("标题封面生成失败：" + String(error));
    } finally {
      importingRef.current = false;
      setBusy(false);
    }
  }

  async function generateMissingCovers() {
    if (importingRef.current || !storageReady || exporting || !coverCandidates.length) return;
    setShowCoverBatchReview(false);
    importingRef.current = true; cancelCoverBatch.current = false;
    setBusy(true); setCoverBatchRunning(true); setCoverBatchResult(null); setError(null);
    try {
      const result = await generateCoverBatch(coverCandidates, refreshTitleCover, (book, blob) => {
        const patch = { titleCoverBlob: blob, titleCoverUrl: URL.createObjectURL(blob), coverPreference: "title" as const, coverStyleVersion: 2 };
        setBooks(previous => previous.map(item => item.id === book.id ? { ...item, ...patch } : item));
        setSelected(previous => previous?.id === book.id ? { ...previous, ...patch } : previous);
        if (book.titleCoverUrl) URL.revokeObjectURL(book.titleCoverUrl);
      }, () => cancelCoverBatch.current, (done, total, current) => setProgress({ done, total, current }));
      setCoverBatchResult(`${result.cancelled ? "已停止" : "已完成"}：成功 ${result.succeeded} 本，失败 ${result.failures.length} 本，未处理 ${result.total - result.done} 本。`);
      if (result.failures.length) setError("以下封面未生成，原文件及原封面已保留：\n" + result.failures.join("\n"));
    } finally {
      importingRef.current = false; setBusy(false); setCoverBatchRunning(false); setProgress(null);
    }
  }

  function useOriginalCover(book: DerivedBook) {
    if (importingRef.current || !storageReady) return;
    setBooks(previous => previous.map(item => item.id === book.id ? { ...item, coverPreference: "original" } : item));
    setSelected(previous => previous?.id === book.id ? { ...previous, coverPreference: "original" } : previous);
  }

  async function handleExport() {
    if (!exportPlan.summary.files || exportPlan.blockers.length || importingRef.current || !storageReady) return;
    importingRef.current = true;
    setExporting(true);
    setError(null);
    setExportProgress({ done: 0, total: exportBooks.length, current: "准备导出" });
    taskController.current = new AbortController();
    try {
      const report = await downloadLibraryZip(exportBooks, { includeDuplicates, includeNotes, noteTemplate, excludePending }, setExportProgress, taskController.current.signal);
      setExportReport(report);
      setShowExportReview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      importingRef.current = false;
      taskController.current = null;
      setExporting(false);
      setExportProgress(null);
    }
  }

  const ratio =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={`app ${selected ? "detail-open" : ""}`}>
      <div inert={selected && narrowScreen ? true : undefined}>
      {over ? <div className="drop-overlay" aria-hidden="true">松开即可追加书籍 · 已有书籍会保留</div> : null}
      <div className="import-bar">
        <strong>Folio · {books.length} 本</strong>
        <span>拖入页面任意位置追加</span>
        <button type="button" className="btn btn-primary" disabled={busy || exporting || !storageReady} onClick={() => fileRef.current?.click()}>添加书籍</button>
        <button type="button" className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={() => folderRef.current?.click()}>添加文件夹</button>
        {busy ? <span role="status">{olProgress || `正在处理 ${progress?.done ?? 0}/${progress?.total ?? 0}`}</span> : null}
        {(busy || exporting) && !coverBatchRunning && taskController.current ? <button className="btn btn-ghost" onClick={() => { taskController.current?.abort(); setError("正在停止任务，等待当前步骤结束…"); }}>停止任务</button> : null}
      </div>
      <div className="storage-status" role="status">
        <p>{storageStatus}</p>
        <p className="hint">书籍文件与封面保存在当前浏览器。清除网站数据会移除书库；不同浏览器或网址不共享。请保留导出备份。</p>
        {storageStatus.startsWith("保存失败") ? <button className="btn btn-secondary" onClick={() => setSaveRetry(v => v + 1)}>重试保存</button> : null}
        {!storageReady && storageStatus.startsWith("恢复失败") ? <button className="btn btn-secondary" onClick={() => window.location.reload()}>重新恢复</button> : null}
      </div>
      <header className="header">
        <div>
          <p className="kicker">Folio</p>
          <h1>书籍整理工作台</h1>
          <p className="lead">
            依次读取内部元数据、按书名与作者命名、再按指纹与书目去重。文件只在本机浏览器处理，不会上传。
          </p>
        </div>
        <p className="hint">导入 → 整理与审核 → 检查并导出</p>
      </header>

      <div className={`panel import-panel ${books.length ? "has-books" : ""}`}>
        <div className={over ? "drop over" : "drop"}>
          <h2>导入书籍，自动识别格式</h2>
          <p>可分批追加 EPUB、PDF 或整个文件夹，已有书籍会保留。根据文件内容识别格式，提取书名、作者、ISBN 与封面；无法识别的文件会列出原因。</p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || exporting || !storageReady}
              onClick={() => fileRef.current?.click()}
            >
              选择书籍文件
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || exporting || !storageReady}
              onClick={() => folderRef.current?.click()}
            >
              选择文件夹
            </button>
            {books.length > 0 ? (
              <button type="button" className="btn btn-ghost" disabled={busy || exporting || !storageReady} onClick={() => setShowClearConfirm(true)}>
                清空本地书库
              </button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden-input"
            onChange={(e) => {
              void ingest(filesFromInput(e.target.files));
              e.target.value = "";
            }}
          />
          <input
            ref={(element) => { folderRef.current = element; element?.setAttribute("webkitdirectory", ""); }}
            type="file"
            multiple
            className="hidden-input"
            onChange={(e) => {
              void ingest(filesFromInput(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {busy && progress ? (
        <div className="progress">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--muted)" }}>正在读取内部元数据</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="bar" style={{ marginTop: "0.5rem" }}>
            <div style={{ width: `${ratio}%` }} />
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--faint)" }}>
            {progress.current}
          </p>
        </div>
      ) : null}

      {olProgress ? <p role="status">{olProgress}</p> : null}
      {lookupSummary ? <p role="status" className="hint">{lookupSummary}</p> : null}
      {Object.values(lookupResults).some(result => result.status === "failed" || result.status === "timeout") ? <p className="hint">部分查询失败或超时，可在整理规则中重试；已有书目不会清空。</p> : null}
      {clearedLibrary ? <section className="panel" aria-label="清空撤销"><p>书库已清空，十分钟内可撤销；刷新后仍可恢复。期间新添书籍会保留。</p><button className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={undoClear}>撤销清空</button></section> : null}
      {showClearConfirm ? <section className="panel" role="alertdialog" aria-label="确认清空书库"><p>清空当前 {books.length} 本书籍？原始磁盘文件不受影响。十分钟内可撤销，之后撤销记录失效。</p><div className="actions"><button className="btn btn-secondary" disabled={busy || exporting} onClick={clearAll}>确认清空</button><button className="btn btn-ghost" onClick={() => setShowClearConfirm(false)}>取消</button></div></section> : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

          <section className="toolbar" aria-label="整理规则与导出">
            <div className="section-heading"><h2>整理规则</h2><p>CSV 与批量封面可切换当前结果或勾选项；导出前单独确认范围。</p></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
              <div className="seg">
                <button
                  type="button"
                  className={namingMode === 1 ? "active" : ""}
                  onClick={() => setNamingMode(1)}
                >
                  纯书名
                </button>
                <button
                  type="button"
                  className={namingMode === 2 ? "active" : ""}
                  onClick={() => setNamingMode(2)}
                >
                  附丛书名
                </button>
              </div>
              <label className="toggle" title="按 ISBN 查询在线书目，不上传书籍文件">
                <input
                  type="checkbox"
                  checked={useOnlineMeta}
                  disabled={busy || exporting || !storageReady}
                  onChange={(e) => setUseOnlineMeta(e.target.checked)}
                />
                联网补全书目（ISBN）
              </label>
              {books.length ? <button type="button" className="btn btn-ghost" disabled={busy || exporting || !storageReady || !useOnlineMeta} onClick={() => void retryCatalog()}>补全 / 重试当前列表</button> : null}
            </div>
            {books.length ? <div className="actions" style={{ marginTop: 0, justifyContent: "flex-start" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={csvDownloading || busy || exporting || !storageReady}
                onClick={() => {
                  if (csvDownloadLock.current) return;
                  csvDownloadLock.current = true;
                  setCsvDownloading(true);
                  try { downloadCsv(batchBooks); }
                  catch (error) { setError(error instanceof Error ? error.message : "CSV 下载失败"); }
                }}
              >
                {csvDownloading ? "已发起下载" : "导出 CSV"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={exporting || busy || !storageReady}
                onClick={() => { setExportScope("filtered"); setShowExportReview(true); }}
              >
                {exporting ? "打包中…" : "检查并导出书库与笔记"}
              </button>
            </div> : null}
          </section>


      {pipeline.stats.total > 0 ? (
        <>
          <div className="stats">
            <div className="stat">
              <label>已扫描</label>
              <strong>{pipeline.stats.total}</strong>
            </div>
            <div className="stat">
              <label>将重命名</label>
              <strong>{pipeline.stats.willRename}</strong>
            </div>
            <div className="stat">
              <label>重复组</label>
              <strong>{pipeline.stats.duplicateGroups}</strong>
            </div>
            <div className="stat">
              <label>将隔离</label>
              <strong>{pipeline.stats.toIsolate}</strong>
            </div>
            <div className="stat">
              <span>Open Library</span>
              <strong>{pipeline.stats.fromOpenLibrary}</strong>
            </div>
            <div className="stat">
              <span>书内元数据</span>
              <strong>{pipeline.stats.fromInternal}</strong>
            </div>
            <div className="stat">
              <span>文件名</span>
              <strong>{pipeline.stats.fromFilename}</strong>
            </div>
          </div>

          {showExportReview ? <section className="panel" aria-label="导出前检查" style={{ padding: "1rem", marginBlock: "1rem" }}>
            <h3>导出前检查</h3>
            <p className="hint">打包内容：README.md、结果 CSV、Library、Originals。笔记放入 Library/Notes，重复副本放入 Originals/Duplicates；不导出 JSON。</p>
            <label>导出范围 <select disabled={exporting} value={exportScope} onChange={event => setExportScope(event.target.value as typeof exportScope)}><option value="all">全部书籍</option><option value="selected">勾选书籍（{selectedBooks.length} 本）</option><option value="filtered">当前列表（含视图与筛选）</option><option value="failed" disabled={!failedIds.size}>上次失败项（使用当前书目）</option></select></label>
            <p><label><input type="checkbox" disabled={exporting} checked={excludePending} onChange={event => setExcludePending(event.target.checked)} />本次排除待审核书籍</label>　<label><input type="checkbox" disabled={exporting} checked={includeDuplicates} onChange={event => setIncludeDuplicates(event.target.checked)} />包含重复副本</label>　<label><input type="checkbox" disabled={exporting} checked={includeNotes} onChange={event => setIncludeNotes(event.target.checked)} />为保留书籍生成 Markdown 笔记</label></p>
            <p role="status">当前选择 {exportPlan.summary.selected} 本；计划打包 {exportPlan.summary.files} 本，其中重复副本 {exportPlan.summary.duplicates} 本；笔记 {exportPlan.summary.notes} 篇；新增封面 {exportPlan.summary.generatedCovers} 本；排除 {exportPlan.summary.skipped} 本。源文件合计 {formatBytes(exportPlan.summary.sourceBytes)}（不含生成内容和 ZIP 内存开销）。</p>
            <p className="hint">仍有 {exportPlan.summary.pending} 本待审核；{exportPlan.adjustedNames} 个输出名称已做长度、非法字符或重名处理，完整书名与作者保留在笔记和记录中。导出新 ZIP 不会覆盖您已编辑的本地笔记。</p>
            {exportPlan.issues.length ? <details><summary>查看缺失、冲突及解析问题（{exportPlan.issues.length} 本）</summary><ul>{exportPlan.issues.map(issue => <li key={issue.id}>{issue.name}：{issue.reasons.join("；")}</li>)}</ul></details> : null}
            <details><summary>查看实际打包路径</summary><ul style={{ maxHeight: 220, overflow: "auto" }}>{exportPlan.entries.map(entry => <li key={entry.book.id}>{entry.book.originalName} → {entry.path || entry.skipReason}{entry.notePath ? `；${entry.notePath}` : ""}</li>)}</ul></details>
            {includeNotes ? <details open><summary>Markdown 模板与预览</summary>
              <p className="hint">默认沿用你的阅读模板，书籍作者按列表保存。支持变量：{noteVariables.map(name => `{{${name}}}`).join("、")}。模板只填书目信息，阅读分析部分保持待填写。默认不追加结尾链接或 ID；需要时在模板中加入 {"{{FILE_LINK}}"} 或 {"{{BOOK_ID}}"}。</p>
              <label>导入 Markdown 模板 <input type="file" accept=".md,.txt" disabled={exporting} onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = "";
                if (!file) return;
                try { if (file.size > 2 * 1024 * 1024) throw new Error("模板不能超过 2 MB"); setNoteTemplate(prepareNoteTemplate(await file.text())); }
                catch (error) { setError(String(error)); }
              }} /></label>
              <label style={{ display: "block" }}>模板内容<textarea aria-label="Markdown 模板内容" rows={10} className="search" style={{ width: "100%", boxSizing: "border-box", minHeight: 200, resize: "vertical", fontFamily: "monospace" }} disabled={exporting} value={noteTemplate} onChange={event => setNoteTemplate(event.target.value)} /></label>
              <button className="btn btn-ghost" disabled={exporting} onClick={() => setNoteTemplate(prepareNoteTemplate(defaultNoteTemplate))}>恢复默认阅读模板</button>
              <label>预览书籍 <select style={{ maxWidth: "100%" }} disabled={exporting} value={previewEntry?.book.id ?? ""} onChange={event => setNotePreviewId(event.target.value)}>{exportPlan.entries.filter(entry => entry.notePath).map(entry => <option key={entry.book.id} value={entry.book.id}>{entry.book.resolvedTitle || entry.book.originalName}</option>)}</select></label>
              <pre aria-label="Markdown 笔记预览" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 320, overflow: "auto" }}>{notePreview}</pre>
            </details> : null}
            {exportPlan.blockers.map(blocker => <p role="alert" key={blocker}>{blocker}</p>)}
            <div className="actions"><button className="btn btn-primary" disabled={exporting || busy || !storageReady || !exportPlan.summary.files || !!exportPlan.blockers.length} onClick={() => void handleExport()}>确认导出 {exportPlan.summary.files} 本与 {exportPlan.summary.notes} 篇笔记</button><button className="btn btn-ghost" disabled={exporting} onClick={() => setShowExportReview(false)}>收起</button></div>
          </section> : null}
          {exportProgress ? <p role="status">导出进度 {exportProgress.done} / {exportProgress.total}：{exportProgress.current}{exportProgress.zipPercent !== undefined ? ` ${Math.round(exportProgress.zipPercent)}%` : ""}</p> : null}
          {exportReport ? <section className="panel" aria-label="上次导出结果" style={{ padding: "1rem", marginBlock: "1rem" }}>
            <p role="status">上次已生成 ZIP 并发起下载：成功 {exportReport.succeeded} 本，失败 {exportReport.failed} 本，排除 {exportReport.skipped} 本。请在浏览器下载记录核对是否保存完成。</p>
            {exportReport.failed ? <><ul>{exportReport.records.filter(record => record.status === "failed").map(record => <li key={record.id}>{record.originalName}：{record.reason}</li>)}</ul><button className="btn btn-secondary" disabled={exporting || busy} onClick={() => { setExportScope("failed"); setExcludePending(false); setShowExportReview(true); }}>检查并重试失败项</button></> : null}
          </section> : null}
          <section className="library-controls" aria-label="书库搜索与筛选">
          <div className="section-heading"><h2>浏览与审核</h2><p>搜索、审核状态和封面条件共同作用于下方列表。</p></div>
          <label className="search-label" htmlFor="library-search">搜索书库</label>
          <input
            id="library-search"
            type="search"
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索书名、作者或文件名"
          />

          <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <label>封面筛选 <select value={coverFilter} onChange={event => setCoverFilter(event.target.value as CoverFilter)}>
              <option value="all">全部</option><option value="missing">使用原文首页 / 无封面预览</option><option value="generated">使用生成封面</option><option value="papers">论文候选</option>
            </select></label>
            <button className="btn btn-secondary" disabled={busy || exporting || !storageReady || !coverCandidates.length} onClick={() => setShowCoverBatchReview(true)}>批量生成封面（{coverCandidates.length} 本）</button>
            {coverBatchRunning ? <button className="btn btn-ghost" onClick={() => { cancelCoverBatch.current = true; }}>处理完当前文件后停止</button> : null}
          </div>
          <p className="hint">PDF 默认保留原文首页；EPUB 保留原书封面。只有选择生成后才新增封面，不改动原页。当前批量范围 {batchBooks.length} 本。</p>
          {showCoverBatchReview ? <section className="panel" aria-label="批量封面范围" style={{ padding: "1rem" }}>
            <p>将为所选范围中的 {coverCandidates.length} 本保留书籍新增封面，原页面完整保留。PDF 首页可能已含封面，请核对下面的范围。</p>
            <ul style={{ maxHeight: "180px", overflow: "auto" }}>{coverCandidates.map(book => <li key={book.id}>{book.resolvedTitle || book.rawTitle || book.originalName} · {book.originalName}</li>)}</ul>
            <div className="actions"><button className="btn btn-primary" disabled={busy || exporting || !storageReady || !coverCandidates.length} onClick={() => void generateMissingCovers()}>生成这 {coverCandidates.length} 本</button><button className="btn btn-ghost" onClick={() => setShowCoverBatchReview(false)}>收起</button></div>
          </section> : null}
          {coverBatchResult ? <p role="status" className="hint">{coverBatchResult}</p> : null}

          <label>信息状态 <select aria-label="信息状态" value={informationFilter} onChange={event => setInformationFilter(event.target.value as typeof informationFilter)}><option value="all">全部信息状态</option><option value="issues">待补全 / 有异常</option><option value="complete">无已知异常</option></select></label>
          <div className="tabs" aria-label="书籍视图">
            <label>审核筛选 <select aria-label="审核筛选" value={reviewFilter} onChange={event => setReviewFilter(event.target.value as typeof reviewFilter)}><option value="all">全部审核状态</option><option value="pending">待审核（{pipeline.books.filter(needsReview).length} 本）</option><option value="reviewed">已人工审核（{pipeline.books.filter(isReviewed).length} 本）</option></select></label>
            <button
              type="button"
              className={tab === "audit" ? "active" : ""}
              aria-pressed={tab === "audit"}
              onClick={() => setTab("audit")}
            >
              全部书籍 {pipeline.stats.total} 本
            </button>
            <button
              type="button"
              className={tab === "rename" ? "active" : ""}
              aria-pressed={tab === "rename"}
              onClick={() => setTab("rename")}
            >
              待命名 {pipeline.stats.willRename} 本
            </button>
            <button
              type="button"
              className={tab === "dedupe" ? "active" : ""}
              aria-pressed={tab === "dedupe"}
              onClick={() => setTab("dedupe")}
            >
              去重 {duplicateBooks.length} 本 · {pipeline.stats.duplicateGroups} 组
            </button>
          </div>

          <p className="view-summary" role="status">
            {tab === "audit" ? `全部 ${pipeline.stats.total} 本，当前显示 ${filtered.length} 本`
              : tab === "rename" ? `待命名 ${pipeline.stats.willRename} / ${pipeline.stats.total} 本，当前显示 ${renameBooks.length} 本；仅列出保留书籍中建议文件名有变化的项目`
              : `重复候选 ${duplicateBooks.length} / ${pipeline.stats.total} 本，共 ${pipeline.groups.length} 组，当前显示 ${visibleGroups.length} 组；每组完整展示，方便比较`}
          </p>
          {query || coverFilter !== "all" || reviewFilter !== "all" || informationFilter !== "all" ? <div className="filter-summary"><span>当前条件：{informationFilter === "issues" ? "信息待补全 / 有异常 · " : informationFilter === "complete" ? "无已知异常 · " : ""}{query ? `搜索「${query}」 · ` : ""}{reviewFilter === "pending" ? "待审核" : reviewFilter === "reviewed" ? "已人工审核" : "全部审核状态"} · {coverFilter === "missing" ? "原文首页 / 无封面预览" : coverFilter === "generated" ? "生成封面" : coverFilter === "papers" ? "论文候选" : "全部封面"}</span><button type="button" className="btn btn-ghost" onClick={() => { setQuery(""); setCoverFilter("all"); setReviewFilter("all"); setInformationFilter("all"); }}>清除筛选</button></div> : null}
          </section>
          <section className="selection-bar" aria-label="批量范围">
            <span>已勾选 {selectedBooks.length} 本</span>
            <button className="btn btn-ghost" onClick={() => setCheckedIds(previous => new Set([...previous, ...viewBooks.map(book => book.id)]))}>选择当前结果（{viewBooks.length}）</button>
            <button className="btn btn-ghost" onClick={() => setCheckedIds(new Set(pipeline.books.map(book => book.id)))}>选择全库（{books.length}）</button>
            <button className="btn btn-ghost" onClick={() => setCheckedIds(new Set())}>取消勾选</button>
            <label>批量封面 / CSV <select aria-label="批量封面和 CSV 范围" value={batchScope} onChange={event => setBatchScope(event.target.value as typeof batchScope)} disabled={busy || exporting}><option value="view">当前结果（{viewBooks.length}）</option><option value="selected">勾选书籍（{selectedBooks.length}）</option></select></label>
          </section>
          <nav className="pagination" aria-label="结果分页"><button className="btn btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</button><span>第 {currentPage} / {pageCount} 页 · 每页最多 {pageSize} {tab === "dedupe" ? "组" : "本"}</span><button className="btn btn-secondary" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>
          {tab === "audit" ? (
            <>
              <div className="mobile-cards">
                {filtered.length === 0 ? (
                  <p className="empty">没有符合筛选的图书。</p>
                ) : (
                  pageBooks.map((book) => (
                    <div key={book.id} className="selectable-row"><input type="checkbox" aria-label={`选择 ${book.originalName}`} checked={checkedIds.has(book.id)} onChange={() => toggleBook(book.id)} /><button
                      type="button"
                      className="card-row"
                      onClick={() => openDetails(book)}
                    >
                      <Cover src={coverUrlFor(book)} kind={book.kind} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {book.resolvedTitle || book.rawTitle || "【缺失书名】"}
                          {book.metaSource ? (
                            <span className="badge" style={{ marginLeft: 6, fontSize: "0.7rem" }}>
                              {book.metaSource === "manual" ? "人工校正" : book.metaSource === "openlibrary"
                                ? "在线书目"
                                : book.metaSource === "epub"
                                  ? "EPUB"
                                  : book.metaSource === "pdf"
                                    ? "PDF"
                                    : book.metaSource === "filename"
                                      ? "文件名"
                                      : ""}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                          {book.displayAuthor}
                        </div>
                        <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          <span className={`badge ${ROLE_LABEL[book.role].cls}`}>
                            {ROLE_LABEL[book.role].text}
                          </span>
                          {book.paperReasons?.length ? <span className="badge badge-accent">论文候选</span> : null} {book.coverPreference === "title" ? <span className="badge">生成封面</span> : null}
                          {book.nameChanged ? <span className="badge badge-warn">待命名</span> : <span className="badge">名称未变</span>} {book.groupId ? <span className="badge badge-accent">重复组</span> : null}
                          {reviewReasons(book).length ? <span className="badge badge-warn">信息：{reviewReasons(book).join("、")}</span> : <span className="badge">无已知异常</span>} {needsReview(book) ? <span className="badge badge-warn">待审核</span> : isReviewed(book) ? <span className="badge badge-accent">已人工审核</span> : null}
                          {book.hasZlibTag ? <span className="badge badge-warn">zlib</span> : null}
                          {book.status === "error" ? (
                            <span className="badge badge-drop">失败</span>
                          ) : null}
                        </div>
                      </div>
                    </button></div>
                  ))
                )}
              </div>
              <div className="desktop-table table-wrap">
                {filtered.length === 0 ? (
                  <p className="empty">没有符合筛选的图书。</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>选择</th><th>书目</th>
                        <th>原始文件名</th>
                        <th>体积</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageBooks.map((book) => (
                        <tr key={book.id}>
                          <td><input type="checkbox" aria-label={`选择 ${book.originalName}`} checked={checkedIds.has(book.id)} onChange={() => toggleBook(book.id)} /></td><td>
                            <button
                              type="button"
                              className="book-cell"
                              onClick={() => openDetails(book)}
                            >
                              <Cover src={coverUrlFor(book)} kind={book.kind} />
                              <span>
                                <span>{book.rawTitle || "【缺失书名】"}</span>
                                <span className="meta">{book.displayAuthor}</span>
                              </span>
                            </button>
                          </td>
                          <td
                            style={{
                              fontFamily: "ui-monospace, monospace",
                              fontSize: "0.75rem",
                              color: "var(--muted)",
                              maxWidth: "16rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {book.originalName}
                          </td>
                          <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>
                            {formatBytes(book.size)}
                          </td>
                          <td>
                            <span className={`badge ${ROLE_LABEL[book.role].cls}`}>
                              {ROLE_LABEL[book.role].text}
                            </span>{" "}
                            {book.paperReasons?.length ? <span className="badge badge-accent">论文候选</span> : null} {book.coverPreference === "title" ? <span className="badge">生成封面</span> : null}
                          {book.nameChanged ? <span className="badge badge-warn">待命名</span> : <span className="badge">名称未变</span>} {book.groupId ? <span className="badge badge-accent">重复组</span> : null}
                          {book.hasZlibTag ? <span className="badge badge-warn">zlib</span> : null}{" "}
                            {reviewReasons(book).length ? <span className="badge badge-warn">信息：{reviewReasons(book).join("、")}</span> : <span className="badge">无已知异常</span>} {needsReview(book) ? <span className="badge badge-warn">待审核</span> : isReviewed(book) ? <span className="badge badge-accent">已人工审核</span> : null}
                            {book.status === "error" ? (
                              <span className="badge badge-drop">失败</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : null}

          {tab === "rename" ? (
            <div className="list">
              {renameBooks.length === 0 ? (
                <p className="empty">没有需要重命名的文件。</p>
              ) : (
                pageBooks.map((book) => (
                  <div key={book.id} className="selectable-row"><input type="checkbox" aria-label={`选择 ${book.originalName}`} checked={checkedIds.has(book.id)} onChange={() => toggleBook(book.id)} /><button
                    type="button"
                    className="list-item"
                    onClick={() => openDetails(book)}
                  >
                    <span className="badge badge-warn">待命名</span>
                    <div className="old">原名：{book.originalName}</div>
                    <div className="new">建议：{book.proposedName}</div>
                  </button></div>
                ))
              )}
            </div>
          ) : null}

          {tab === "dedupe" ? (
            visibleGroups.length === 0 ? (
              <p className="empty">当前搜索范围内没有重复组。</p>
            ) : (
              pageGroups.map((group) => {
                const members = group.bookIds
                  .map((id) => pipeline.books.find((b) => b.id === id))
                  .filter(Boolean) as DerivedBook[];
                const title =
                  members.find((m) => m.rawTitle)?.rawTitle ||
                  members[0]?.cleanTitle ||
                  group.key;
                return (
                  <section key={group.id} className="group">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                      <h3 style={{ margin: 0 }}>{title}</h3>
                      <span className={`badge ${group.kind === "hash" || group.kind === "isbn" ? "badge-warn" : group.kind === "fuzzy" ? "badge-accent" : ""}`}>
                        {group.kind === "hash"
                          ? "内容完全相同"
                          : group.kind === "isbn"
                            ? "ISBN 相同"
                            : group.kind === "fuzzy"
                              ? "书名相似"
                              : "书名作者相同"}
                      </span>
                      {group.reason ? (
                        <span style={{ fontSize: "0.75rem", color: "var(--faint)" }}>{group.reason}</span>
                      ) : null}
                      <span style={{ fontSize: "0.75rem", color: "var(--faint)" }}>
                        {members.length} 个版本
                      </span>
                    </div>
                    {members.map((book) => {
                      const kept = book.id === group.keepId;
                      return (
                        <div key={book.id} className="member"><input type="checkbox" aria-label={`选择 ${book.originalName}`} checked={checkedIds.has(book.id)} onChange={() => toggleBook(book.id)} />
                          <Cover src={coverUrlFor(book)} kind={book.kind} />
                          <div className="info">
                            <button
                              type="button"
                              className="name"
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "inherit",
                                font: "inherit",
                                padding: 0,
                                cursor: "pointer",
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                              }}
                              onClick={() => openDetails(book)}
                            >
                              {book.originalName}
                            </button>
                            <div className="sub">
                              {book.displayAuthor} · {formatBytes(book.size)}
                              {book.hasZlibTag ? " · z-library" : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ height: "2.25rem", padding: "0 0.5rem" }}
                            onClick={() =>
                              setKeepOverrides((prev) => ({ ...prev, [group.id]: book.id }))
                            }
                          >
                            <span className={`badge ${kept ? "badge-keep" : "badge-drop"}`}>
                              {kept ? "保留" : "隔离"}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </section>
                );
              })
            )
          ) : null}

          {pageCount > 1 ? <nav className="pagination" aria-label="列表末尾分页"><button className="btn btn-secondary" disabled={currentPage <= 1} onClick={() => { setPage(currentPage - 1); document.querySelector('[aria-label="结果分页"]')?.scrollIntoView({ block: "start" }); }}>上一页</button><span>第 {currentPage} / {pageCount} 页</span><button className="btn btn-secondary" disabled={currentPage >= pageCount} onClick={() => { setPage(currentPage + 1); document.querySelector('[aria-label="结果分页"]')?.scrollIntoView({ block: "start" }); }}>下一页</button></nav> : null}
          {pipeline.stats.failed > 0 ? (
            <p style={{ fontSize: "0.75rem", color: "var(--warn)", marginTop: "1rem" }}>
              {pipeline.stats.failed}{" "}
              本无法可靠读取内部元数据，仍会按文件名参与命名，但不作为可靠书目。
            </p>
          ) : null}
        </>
      ) : !busy ? (
        <div className="steps">
          <div className="step">
            <div className="n">01</div>
            <h3>审计</h3>
            <p>自动识别 EPUB / PDF，读取内部元数据；缺失字段回退到文件名，失败保留原因。</p>
          </div>
          <div className="step">
            <div className="n">02</div>
            <h3>命名</h3>
            <p>模式1：清洗书名；模式2：有丛书元数据则附加（丛书名）。</p>
          </div>
          <div className="step">
            <div className="n">03</div>
            <h3>去重</h3>
            <p>SHA-256 → ISBN → 精确书名作者 → 模糊书名；按质量分保留最优。</p>
          </div>
        </div>
      ) : null}

      </div>
      {selected ? (
        <div
          className="dialog-backdrop"
          onClick={closeDetails}
          onKeyDown={(e) => e.key === "Escape" && closeDetails()}
          role="presentation"
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal={narrowScreen}
            aria-labelledby="detail-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={event => {
              if (!narrowScreen || event.key !== "Tab") return;
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary')).filter(element => element.getClientRects().length);
              const first = controls[0], last = controls[controls.length - 1];
              if (event.shiftKey && (document.activeElement === first || document.activeElement?.id === "detail-title")) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }}
          >
            <button type="button" className="dialog-close" onClick={closeDetails}>
              ×
            </button>
              <h2 id="detail-title" tabIndex={-1}>书籍详情</h2>
              <nav className="actions" aria-label="连续审核"><button className="btn btn-secondary" disabled={busy || exporting || !neighbors.previous} onClick={() => openDetails(neighbors.previous!)}>上一本</button><span>{selectedIndex < 0 ? "已不在当前结果" : `${selectedIndex + 1} / ${viewBooks.length}`}</span><button className="btn btn-secondary" disabled={busy || exporting || !neighbors.next} onClick={() => openDetails(neighbors.next!)}>下一本</button></nav>
              {showDraftPrompt ? <section className="panel" role="alertdialog" aria-label="未保存修改"><p>当前修改尚未应用。草稿保留在此标签页，不参与导出。</p><div className="actions"><button className="btn btn-secondary" onClick={() => { if (saveReviewedMetadata(selected)) finishDetail(); }}>保存书目并继续</button><button className="btn btn-secondary" onClick={finishDetail}>保留草稿并继续</button><button className="btn btn-ghost" onClick={() => { persistDraft(selected); finishDetail(); }}>放弃修改并继续</button><button className="btn btn-ghost" onClick={() => setShowDraftPrompt(false)}>继续编辑</button></div></section> : null}
              {draftDirty ? <p className="hint" role="status">有未应用修改 · 草稿已保留，保存书目或生成封面后生效。</p> : null}
            <div className="detail-overview">
              <div className="cover" style={{ width: "5rem", height: "7.5rem" }}>
                {coverUrlFor(selected) ? <img src={coverUrlFor(selected)} alt="" /> : selected.kind === "pdf" ? "PDF 首页不可用" : selected.kind === "epub" ? "EPUB 无封面" : "无预览"}
              </div>
              <div>
                <div style={{ fontFamily: "var(--display)", fontSize: "1.1rem", fontWeight: 500 }}>
                  {selected.rawTitle || "【缺失书名】"}
                </div>
                <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                  {selected.displayAuthor}
                </div>
                <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <span className={`badge ${ROLE_LABEL[selected.role].cls}`}>
                    {ROLE_LABEL[selected.role].text}
                  </span>
                  {selected.hasZlibTag ? <span className="badge badge-warn">z-library</span> : null}
                  {selected.status === "error" ? (
                    <span className="badge badge-drop">解析失败</span>
                  ) : null}
                </div>
              </div>
            </div>
            {selected.kind === "pdf" || selected.kind === "epub" ? <button className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={() => void regenerateDocumentCover(selected)}>重新识别书目与封面</button> : null}
            <section className="detail-section" aria-label="人工校正书目">
              <strong>人工校正书目{selected.manualMetadata ? " · 已保存" : ""}</strong>
              <p className="hint">审核：{isReviewed(selected) ? "已人工审核" : "未人工审核"} · 信息：{reviewReasons(selected).join("；") || "无已知异常"}</p>
              <div className="detail-fields">
              <label>书名<textarea className="search" rows={3} value={metadataTitleDraft} disabled={busy || exporting} onChange={event => updateDetailDraft("title", event.target.value)} /></label>
              <label>作者（每行一位）<textarea className="search" rows={3} value={metadataAuthorsDraft} disabled={busy || exporting} onChange={event => updateDetailDraft("authors", event.target.value)} /></label>
              </div>
              <div className="actions"><button className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={() => saveReviewedMetadata(selected)}>保存书名与作者</button><button className="btn btn-ghost" disabled={busy || exporting || !storageReady || !selected.manualMetadata} onClick={() => saveReviewedMetadata(selected, true)}>恢复自动识别结果</button></div>
              <p className="hint">保存后更新命名与去重；已有生成封面需重新生成。</p>
              <div className="actions"><button className="btn btn-secondary" disabled={busy || exporting || !storageReady || isReviewed(selected) || metadataDirty} onClick={() => confirmMetadataReview(selected)}>确认已审核</button><button className="btn btn-ghost" disabled={busy || exporting || !storageReady || !isReviewed(selected)} onClick={() => confirmMetadataReview(selected, true)}>撤销审核</button></div>
              <p className="hint">请先保存再确认。确认不消除错误；书目变化后需重新审核。</p>
            </section>
            {selected.kind === "pdf" || selected.kind === "epub" ? <details className="detail-section"><summary>封面设置</summary>
            <div className="detail-fields">
            {selected.kind === "pdf" || selected.kind === "epub" ? <div className="detail-cover-fields">
              <label>封面标题<textarea className="search" style={{ width: "100%", boxSizing: "border-box" }} rows={3} disabled={busy || exporting} value={coverTitleDraft} onChange={event => updateDetailDraft("coverTitle", event.target.value)} /></label>
              <label>封面作者<textarea className="search" style={{ width: "100%", boxSizing: "border-box" }} rows={2} disabled={busy || exporting} value={coverAuthorDraft} onChange={event => updateDetailDraft("coverAuthor", event.target.value)} /></label>
              <p className="hint">仅用于封面，生成后生效。</p>

            </div> : null}
            </div>
            {selected.kind === "pdf" || selected.kind === "epub" ? <div className="actions">
              <button className="btn btn-secondary" disabled={busy || exporting || !storageReady} onClick={() => void chooseTitleCover(selected)}>生成标题作者封面</button>
              <button className="btn btn-ghost" disabled={busy || exporting || !storageReady} onClick={() => useOriginalCover(selected)}>{selected.kind === "pdf" || selected.coverIsFirstPage ? "使用原文首页" : "恢复原文件封面"}</button>
            </div> : null}
            <div className="detail-color-row"><label>配色并生成 <select disabled={busy || exporting || !storageReady} value={selected.coverColor ?? coverColors[0]} onChange={event => void chooseTitleCover(selected, event.target.value)}>{coverColors.map((color, index) => <option key={color} value={color}>{["海蓝", "酒红", "墨绿", "紫灰", "棕金", "深灰"][index]}</option>)}</select></label>
            <button className="btn btn-ghost" disabled={busy || exporting || !storageReady} onClick={() => void chooseTitleCover(selected, coverColors[crypto.getRandomValues(new Uint32Array(1))[0]! % coverColors.length])}>随机配色并生成</button>
            </div>
            <p className="hint">导出时嵌入生成封面，保留正文与 Originals 原文件；选择原封面 / 首页可恢复。</p>
            </details> : null}
            <section className="detail-section" aria-label="文件信息"><strong>文件信息</strong><dl className="dl">
              <dt>实际格式</dt><dd>{selected.kind?.toUpperCase() || "未知"}</dd>
              <dt>联网状态</dt><dd>{!selected.isbn ? "无 ISBN" : lookupResults[selected.isbn.replace(/[^0-9Xx]/g, "").toUpperCase()] ? { found: "已匹配", not_found: "未找到书目", failed: "查询失败，可重试", timeout: "查询超时，可重试" }[lookupResults[selected.isbn.replace(/[^0-9Xx]/g, "").toUpperCase()]!.status] : olByIsbn.has(selected.isbn.replace(/[^0-9Xx]/g, "").toUpperCase()) ? "已缓存书目" : "未查询"}</dd>
              <dt>原始文件名</dt><dd>{selected.originalName}</dd>
              <dt>建议文件名</dt><dd>{selected.proposedName}</dd>
              <dt>识别提示</dt><dd>{selected.warnings?.join("；") || "无"}</dd>
            </dl></section>
            <details className="detail-section"><summary>更多书目与识别信息</summary>
            <dl className="dl">
              <dt>封面来源</dt><dd>{selected.coverPreference === "title" ? "标题作者生成封面" : selected.kind === "pdf" || selected.coverIsFirstPage ? "原文首页（EPUB 为重排预览）" : "原书封面"}</dd>
              {selected.bookPageMetadata ? <><dt>题名页书名</dt><dd>{selected.bookPageMetadata.title}</dd><dt>题名页作者</dt><dd>{selected.bookPageMetadata.authors.join(" · ") || "未可靠提取"}</dd><dt>识别依据</dt><dd>前页 / 前章节第 {selected.bookPageMetadata.page} 项：{[...selected.bookPageMetadata.titleEvidence, ...selected.bookPageMetadata.authorEvidence].join(" / ")}</dd></> : null}
              {selected.paperMetadata ? <><dt>首页识别标题</dt><dd>{selected.paperMetadata.title || "—"}</dd><dt>首页识别作者</dt><dd>{selected.paperMetadata.authors.join(" · ") || "未可靠提取"}</dd><dt>首页识别依据</dt><dd>{[...selected.paperMetadata.titleEvidence, ...selected.paperMetadata.authorEvidence].join(" / ")}</dd></> : null}
              <dt>论文识别依据</dt><dd>{selected.paperReasons?.join("；") || "未建立论文判断"}</dd>
              <dt>书目来源</dt><dd>{selected.manualMetadata ? "人工校正" : "自动识别"}</dd>
              <dt>作者</dt>
              <dd>{selected.resolvedAuthors?.join(" · ") || "—"}</dd>
              <dt>出版社</dt>
              <dd>{selected.publisher || "—"}</dd>
              <dt>语言</dt>
              <dd>{selected.language || "—"}</dd>
              <dt>标识符</dt>
              <dd>{selected.identifiers.join(" · ") || "—"}</dd>
              <dt>日期</dt>
              <dd>{selected.date || "—"}</dd>
              <dt>丛书</dt>
              <dd>{selected.series || "—"}</dd>
              <dt>体积</dt>
              <dd>{formatBytes(selected.size)}</dd>
              <dt>SHA-256</dt>
              <dd className="mono">{selected.hash}</dd>
              {selected.error ? (
                <>
                  <dt>错误</dt>
                  <dd>{selected.error}</dd>
                </>
              ) : null}
            </dl>
            {selected.description ? (
              <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "var(--muted)" }}>
                {selected.description}
              </p>
            ) : null}
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}

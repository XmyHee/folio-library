import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";
import type { DerivedBook } from "../lib/types";
import { savedDetailDraft, detailDraftChanged } from "../lib/detail-draft";
import type { DetailDraft } from "../lib/detail-draft";

/** Selected/pending IDs refer to the canonical derived library; drafts are tab-local. */
export function useBookDetails(books: DerivedBook[], busy: boolean, exporting: boolean, setError: (message:string)=>void) {
  const [coverTitleDraft, setCoverTitleDraft] = useState("");
  const [coverAuthorDraft, setCoverAuthorDraft] = useState("");
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

  const pendingDetail = useRef<string | null>(null);
  const detailPosition = useRef(0);
  function finishDetail() { setSelectedId(pendingDetail.current); setShowDraftPrompt(false); }
  function openDetails(book: DerivedBook) {
    if (busy || exporting) return;
    if (selected?.id === book.id) return;
    pendingDetail.current = book.id;
    if (draftDirty) setShowDraftPrompt(true); else finishDetail();
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = books.find(book => book.id === selectedId) ?? null;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const setSelected = useCallback((value: SetStateAction<DerivedBook | null>) => {
    const next = typeof value === "function" ? value(selectedRef.current) : value;
    selectedRef.current = next;
    setSelectedId(next?.id ?? null);
  }, []);
  useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);
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

  function clearDetailDrafts() {
    detailDrafts.current = {}; pendingDetail.current = null;
    setSelectedId(null); setShowDraftPrompt(false);
    setMetadataTitleDraft(""); setMetadataAuthorsDraft(""); setCoverTitleDraft(""); setCoverAuthorDraft("");
    try { sessionStorage.removeItem("folio-detail-drafts"); }
    catch { setError("书库已清空，但此标签页草稿未能清除，请关闭标签页。"); }
  }

  return {

    selected, setSelected, metadataTitleDraft, setMetadataTitleDraft,

    metadataAuthorsDraft, setMetadataAuthorsDraft, coverTitleDraft, setCoverTitleDraft,

    coverAuthorDraft, setCoverAuthorDraft, showDraftPrompt, setShowDraftPrompt,

    detailPosition, openDetails, closeDetails, finishDetail,

    currentDraft, draftDirty, metadataDirty, persistDraft,

    updateDetailDraft, clearDetailDrafts,

  };
}

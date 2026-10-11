import type { useTaskState } from "../hooks/useTaskState";
import type { useLibraryState } from "../hooks/useLibraryState";
import type { useBookDetails } from "../hooks/useBookDetails";
import type { DerivedBook } from "../lib/types";
/** Explicit ports for metadata commands. Read state at invocation; share task refs across features. */
export interface MetadataCommandContext {
    busy: ReturnType<typeof useTaskState>["busy"];
    exporting: ReturnType<typeof useTaskState>["exporting"];
    storageReady: ReturnType<typeof useLibraryState>["storageReady"];
    metadataTitleDraft: ReturnType<typeof useBookDetails>["metadataTitleDraft"];
    setError: ReturnType<typeof useTaskState>["setError"];
    metadataAuthorsDraft: ReturnType<typeof useBookDetails>["metadataAuthorsDraft"];
    books: ReturnType<typeof useLibraryState>["books"];
    runPipeline: typeof import("../lib/pipeline").runPipeline;
    namingMode: ReturnType<typeof useLibraryState>["namingMode"];
    keepOverrides: ReturnType<typeof useLibraryState>["keepOverrides"];
    useOnlineMeta: ReturnType<typeof useLibraryState>["useOnlineMeta"];
    olByIsbn: ReturnType<typeof useLibraryState>["olByIsbn"];
    savedDetailDraft: typeof import("../lib/detail-draft").savedDetailDraft;
    coverTitleDraft: ReturnType<typeof useBookDetails>["coverTitleDraft"];
    coverAuthorDraft: ReturnType<typeof useBookDetails>["coverAuthorDraft"];
    persistDraft: ReturnType<typeof useBookDetails>["persistDraft"];
    setBooks: ReturnType<typeof useLibraryState>["setBooks"];
    setSelected: ReturnType<typeof useBookDetails>["setSelected"];
    setMetadataTitleDraft: ReturnType<typeof useBookDetails>["setMetadataTitleDraft"];
    setMetadataAuthorsDraft: ReturnType<typeof useBookDetails>["setMetadataAuthorsDraft"];
    setCoverTitleDraft: ReturnType<typeof useBookDetails>["setCoverTitleDraft"];
    setCoverAuthorDraft: ReturnType<typeof useBookDetails>["setCoverAuthorDraft"];
    metadataDirty: ReturnType<typeof useBookDetails>["metadataDirty"];
    reviewKey: typeof import("../lib/review").reviewKey;
}
export function createMetadataCommands(getContext: () => MetadataCommandContext) {
    function saveReviewedMetadata(book: DerivedBook, reset = false) {
        const {
            busy,
            exporting,
            storageReady,
            metadataTitleDraft,
            setError,
            metadataAuthorsDraft,
            books,
            runPipeline,
            namingMode,
            keepOverrides,
            useOnlineMeta,
            olByIsbn,
            savedDetailDraft,
            coverTitleDraft,
            coverAuthorDraft,
            persistDraft,
            setBooks,
            setSelected,
            setMetadataTitleDraft,
            setMetadataAuthorsDraft,
            setCoverTitleDraft,
            setCoverAuthorDraft,
        } = getContext();
        if (busy || exporting || !storageReady)
            return false;
        const title = metadataTitleDraft.replace(/\s+/g, " ").trim();
        if (!reset && !title) {
            setError("请填写书名后保存；作者未确认时可以留空。");
            return false;
        }
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
        const {
            busy,
            exporting,
            storageReady,
            metadataDirty,
            reviewKey,
            setBooks,
            setSelected,
        } = getContext();
        if (busy || exporting || !storageReady || metadataDirty)
            return;
        const reviewedMetadataKey = undo ? undefined : reviewKey(book);
        setBooks(previous => previous.map(item => item.id === book.id ? { ...item, reviewedMetadataKey } : item));
        setSelected(previous => previous?.id === book.id ? { ...previous, reviewedMetadataKey } : previous);
    }
    return { saveReviewedMetadata, confirmMetadataReview };
}

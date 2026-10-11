import type { useTaskState } from "../hooks/useTaskState";
import type { useLibraryState } from "../hooks/useLibraryState";
import type { useBookDetails } from "../hooks/useBookDetails";
import type { useLibraryView } from "../hooks/useLibraryView";
import type { Dispatch, SetStateAction } from "react";
import type { DerivedBook } from "../lib/types";
/** Explicit ports for covers commands. Read state at invocation; share task refs across features. */
export interface CoversCommandContext {
    importingRef: ReturnType<typeof useTaskState>["importingRef"];
    storageReady: ReturnType<typeof useLibraryState>["storageReady"];
    setBusy: ReturnType<typeof useTaskState>["setBusy"];
    setError: ReturnType<typeof useTaskState>["setError"];
    parseBook: typeof import("../lib/parse").parseBook;
    runPipeline: typeof import("../lib/pipeline").runPipeline;
    namingMode: ReturnType<typeof useLibraryState>["namingMode"];
    useOnlineMeta: ReturnType<typeof useLibraryState>["useOnlineMeta"];
    olByIsbn: ReturnType<typeof useLibraryState>["olByIsbn"];
    books: ReturnType<typeof useLibraryState>["books"];
    refreshTitleCover: typeof import("../lib/document-cover").refreshTitleCover;
    URL: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
    keepOverrides: ReturnType<typeof useLibraryState>["keepOverrides"];
    setBooks: ReturnType<typeof useLibraryState>["setBooks"];
    setSelected: ReturnType<typeof useBookDetails>["setSelected"];
    setCoverTitleDraft: ReturnType<typeof useBookDetails>["setCoverTitleDraft"];
    setCoverAuthorDraft: ReturnType<typeof useBookDetails>["setCoverAuthorDraft"];
    coverColors: typeof import("../lib/document-cover").coverColors;
    coverTitleDraft: ReturnType<typeof useBookDetails>["coverTitleDraft"];
    coverAuthorDraft: ReturnType<typeof useBookDetails>["coverAuthorDraft"];
    titleCoverForBook: typeof import("../lib/document-cover").titleCoverForBook;
    persistDraft: ReturnType<typeof useBookDetails>["persistDraft"];
    currentDraft: ReturnType<typeof useBookDetails>["currentDraft"];
    exporting: ReturnType<typeof useTaskState>["exporting"];
    coverCandidates: ReturnType<typeof useLibraryView>["coverCandidates"];
    setShowCoverBatchReview: Dispatch<SetStateAction<boolean>>;
    cancelCoverBatch: ReturnType<typeof useTaskState>["cancelCoverBatch"];
    setCoverBatchRunning: ReturnType<typeof useTaskState>["setCoverBatchRunning"];
    setCoverBatchResult: ReturnType<typeof useTaskState>["setCoverBatchResult"];
    generateCoverBatch: typeof import("../lib/cover-workflow").generateCoverBatch;
    setProgress: ReturnType<typeof useTaskState>["setProgress"];
}
export function createCoversCommands(getContext: () => CoversCommandContext) {
    async function regenerateDocumentCover(book: DerivedBook) {
        const {
            importingRef,
            storageReady,
            setBusy,
            setError,
            parseBook,
            runPipeline,
            namingMode,
            useOnlineMeta,
            olByIsbn,
            books,
            refreshTitleCover,
            URL,
            keepOverrides,
            setBooks,
            setSelected,
            setCoverTitleDraft,
            setCoverAuthorDraft,
        } = getContext();
        if (importingRef.current || !storageReady)
            return;
        importingRef.current = true;
        setBusy(true);
        const pendingUrls: string[] = [];
        setError(null);
        try {
            const parsed = book.markdownSource ? await (await import("../lib/markdown/import")).reconvertMarkdown(book,parseBook) : await parseBook(book.file);
            if (parsed.coverUrl)
                pendingUrls.push(parsed.coverUrl);
            if (parsed.status !== "ok")
                throw new Error(parsed.error || "重新识别失败，已保留原记录");
            const merged = { ...book, ...parsed, id: book.id, file: book.file, coverlessConfirmed: book.coverlessConfirmed,
                coverColor: book.coverColor, coverTitle: undefined, coverAuthor: undefined,
                resolvedTitle: undefined, resolvedAuthors: undefined, metaSource: undefined,
                coverPreference: book.coverPreference };
            const updated = runPipeline([merged], namingMode, {}, { online: useOnlineMeta, olByIsbn }).books[0]!;
            const generated = book.coverPreference === "title" ? await refreshTitleCover(updated) : undefined;
            const next = { ...merged, titleCoverBlob: generated, titleCoverUrl: generated ? URL.createObjectURL(generated) : undefined,
                coverStyleVersion: generated ? 2 : undefined, coverPreference: generated ? "title" as const : "original" as const };
            if (next.titleCoverUrl)
                pendingUrls.push(next.titleCoverUrl);
            const selectedNext = runPipeline(books.map(item => item.id === book.id ? next : item), namingMode, keepOverrides, { online: useOnlineMeta, olByIsbn }).books.find(item => item.id === book.id)!;
            setBooks(previous => previous.map(item => item.id === book.id ? next : item));
            setSelected(previous => previous?.id === book.id ? selectedNext : previous);
            setCoverTitleDraft(selectedNext.resolvedTitle || selectedNext.rawTitle);
            setCoverAuthorDraft(selectedNext.displayAuthor === "Unknown" ? "" : selectedNext.displayAuthor);
            if (book.coverUrl)
                URL.revokeObjectURL(book.coverUrl);
            if (book.titleCoverUrl)
                URL.revokeObjectURL(book.titleCoverUrl);
            pendingUrls.length = 0;
        }
        catch (error) {
            pendingUrls.forEach(url => URL.revokeObjectURL(url));
            setError("重新识别失败，已保留原记录：" + String(error));
        }
        finally {
            importingRef.current = false;
            setBusy(false);
        }
    }
    async function chooseTitleCover(book: DerivedBook, color?: string) {
        const {
            coverColors,
            importingRef,
            storageReady,
            setBusy,
            coverTitleDraft,
            coverAuthorDraft,
            titleCoverForBook,
            URL,
            persistDraft,
            currentDraft,
            setCoverTitleDraft,
            setCoverAuthorDraft,
            setBooks,
            setSelected,
            setError,
        } = getContext();
        color ??= book.coverColor ?? coverColors[0];
        if (importingRef.current || !storageReady)
            return;
        importingRef.current = true;
        setBusy(true);
        try {
            const title = coverTitleDraft.trim(), author = coverAuthorDraft.trim();
            const blob = await titleCoverForBook(book, title, author, color);
            const patch = { coverTitle: title, coverAuthor: author, coverStyleVersion: 2, coverColor: color, titleCoverBlob: blob, titleCoverUrl: URL.createObjectURL(blob), coverPreference: "title" as const };
            persistDraft({ ...book, ...patch }, { ...currentDraft, coverTitle: title, coverAuthor: author });
            setCoverTitleDraft(title);
            setCoverAuthorDraft(author);
            setBooks(previous => previous.map(item => item.id === book.id ? { ...item, ...patch } : item));
            setSelected(previous => previous?.id === book.id ? { ...previous, ...patch } : previous);
            if (book.titleCoverUrl)
                URL.revokeObjectURL(book.titleCoverUrl);
        }
        catch (error) {
            setError("标题封面生成失败：" + String(error));
        }
        finally {
            importingRef.current = false;
            setBusy(false);
        }
    }
    async function generateMissingCovers() {
        const {
            importingRef,
            storageReady,
            exporting,
            coverCandidates,
            setShowCoverBatchReview,
            cancelCoverBatch,
            setBusy,
            setCoverBatchRunning,
            setCoverBatchResult,
            setError,
            generateCoverBatch,
            refreshTitleCover,
            URL,
            setBooks,
            setSelected,
            setProgress,
        } = getContext();
        if (importingRef.current || !storageReady || exporting || !coverCandidates.length)
            return;
        setShowCoverBatchReview(false);
        importingRef.current = true;
        cancelCoverBatch.current = false;
        setBusy(true);
        setCoverBatchRunning(true);
        setCoverBatchResult(null);
        setError(null);
        try {
            const result = await generateCoverBatch(coverCandidates, refreshTitleCover, (book, blob) => {
                const patch = { titleCoverBlob: blob, titleCoverUrl: URL.createObjectURL(blob), coverPreference: "title" as const, coverStyleVersion: 2 };
                setBooks(previous => previous.map(item => item.id === book.id ? { ...item, ...patch } : item));
                setSelected(previous => previous?.id === book.id ? { ...previous, ...patch } : previous);
                if (book.titleCoverUrl)
                    URL.revokeObjectURL(book.titleCoverUrl);
            }, () => cancelCoverBatch.current, (done, total, current) => setProgress({ done, total, current }));
            setCoverBatchResult(`${result.cancelled ? "已停止" : "已完成"}：成功 ${result.succeeded} 本，失败 ${result.failures.length} 本，未处理 ${result.total - result.done} 本。`);
            if (result.failures.length)
                setError("以下封面未生成，原文件及原封面已保留：\n" + result.failures.join("\n"));
        }
        finally {
            importingRef.current = false;
            setBusy(false);
            setCoverBatchRunning(false);
            setProgress(null);
        }
    }
    function useOriginalCover(book: DerivedBook) {
        const {
            importingRef,
            storageReady,
            setBooks,
            setSelected,
        } = getContext();
        if (importingRef.current || !storageReady)
            return;
        setBooks(previous => previous.map(item => item.id === book.id ? { ...item, coverPreference: "original" } : item));
        setSelected(previous => previous?.id === book.id ? { ...previous, coverPreference: "original" } : previous);
    }
    return { regenerateDocumentCover, chooseTitleCover, generateMissingCovers, useOriginalCover };
}

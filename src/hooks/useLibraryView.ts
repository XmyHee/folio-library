import { useEffect, useMemo, useState } from "react";
import type { PipelineResult } from "../lib/types";
import type { CoverFilter } from "../lib/cover-workflow";
import { matchesCoverFilter, needsCoverGeneration } from "../lib/cover-workflow";
import { isReviewed, needsReview, reviewReasons } from "../lib/review";
import { currentViewBooks, viewSummary } from "../lib/view-scope";

/** Transient view state only; never persists derived books or changes the source library. */
export function useLibraryView(pipeline: PipelineResult) {
  const pageSize = 40;
  const [query, setQuery] = useState("");
  const [coverFilter, setCoverFilter] = useState<CoverFilter>("all");
  const [informationFilter, setInformationFilter] = useState<"all" | "issues" | "complete">("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "pending" | "reviewed">("all");
  const [tab, setTab] = useState<"audit" | "rename" | "dedupe">("audit");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [batchScope, setBatchScope] = useState<"view" | "selected">("view");
  const [page, setPage] = useState(1);

  function toggleBook(id: string) { setCheckedIds(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); }

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

  const { renameBooks, duplicateBooks, visibleGroups } = useMemo(
    () => viewSummary(filtered, pipeline.books, pipeline.groups), [filtered, pipeline.books, pipeline.groups],
  );
  const viewBooks = useMemo(() => currentViewBooks(filtered, pipeline.books, pipeline.groups, tab), [filtered, pipeline, tab]);
  const selectedBooks = useMemo(() => pipeline.books.filter(book => checkedIds.has(book.id)), [pipeline, checkedIds]);
  const batchBooks = batchScope === "selected" ? selectedBooks : viewBooks;
  const coverCandidates = batchBooks.filter(needsCoverGeneration);
  const pageCount = Math.max(1, Math.ceil((tab === "dedupe" ? visibleGroups.length : viewBooks.length) / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageBooks = viewBooks.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageGroups = visibleGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setPage(1); }, [query, coverFilter, informationFilter, reviewFilter, tab]);
  useEffect(() => { const ids = new Set(pipeline.books.map(book => book.id)); setCheckedIds(previous => new Set([...previous].filter(id => ids.has(id)))); }, [pipeline.books]);

  return {

    pageSize, query, setQuery, coverFilter,

    setCoverFilter, informationFilter, setInformationFilter, reviewFilter,

    setReviewFilter, tab, setTab, checkedIds,

    setCheckedIds, batchScope, setBatchScope, page,

    setPage, toggleBook, filtered, renameBooks,

    duplicateBooks, visibleGroups, viewBooks, selectedBooks,

    batchBooks, coverCandidates, pageCount, currentPage,

    pageBooks, pageGroups,

  };
}

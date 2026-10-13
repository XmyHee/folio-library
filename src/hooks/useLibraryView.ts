import { useCallback, useEffect, useMemo } from "react";
import type { PipelineResult } from "../lib/types";
import { useFolioSlice } from "../state/folio-context";
import { deriveLibraryView } from "../state/selectors";

/** Derives current scopes from store inputs; no second source library or persisted lists. */
export function useLibraryView(pipeline: PipelineResult) {
  const { query, setQuery, coverFilter, setCoverFilter, informationFilter, setInformationFilter,
    reviewFilter, setReviewFilter, tab, setTab, checkedIds, setCheckedIds,
    batchScope, setBatchScope, page, setPage } = useFolioSlice("view");

  const toggleBook = useCallback((id: string) => { setCheckedIds(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); }, [setCheckedIds]);

  const derived = useMemo(() => deriveLibraryView(pipeline, {
    query, coverFilter, informationFilter, reviewFilter, tab, checkedIds, batchScope, page,
  }), [pipeline, query, coverFilter, informationFilter, reviewFilter, tab, checkedIds, batchScope, page]);

  useEffect(() => { setPage(1); }, [query, coverFilter, informationFilter, reviewFilter, tab]);
  useEffect(() => { const ids = new Set(pipeline.books.map(book => book.id)); setCheckedIds(previous => [...previous].every(id => ids.has(id)) ? previous : new Set([...previous].filter(id => ids.has(id)))); }, [pipeline.books]);

  return useMemo(() => ({
    query, setQuery, coverFilter, setCoverFilter, informationFilter, setInformationFilter,
    reviewFilter, setReviewFilter, tab, setTab, checkedIds, setCheckedIds,
    batchScope, setBatchScope, page, setPage, toggleBook, ...derived,
  }), [query, setQuery, coverFilter, setCoverFilter, informationFilter, setInformationFilter,
    reviewFilter, setReviewFilter, tab, setTab, checkedIds, setCheckedIds,
    batchScope, setBatchScope, page, setPage, toggleBook, derived]);
}

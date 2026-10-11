import type { DerivedBook, DuplicateGroup } from "./types";

export function currentViewBooks(filtered: DerivedBook[], all: DerivedBook[], groups: DuplicateGroup[], view: "audit" | "rename" | "dedupe"): DerivedBook[] {
  if (view === "audit") return filtered;
  if (view === "rename") return filtered.filter(book => book.nameChanged && (book.role === "unique" || book.role === "keep"));
  // Duplicate comparisons display whole groups, including members outside a search match.
  const matches = new Set(filtered.map(book => book.id));
  const members = new Set(groups.filter(group => group.bookIds.some(id => matches.has(id))).flatMap(group => group.bookIds));
  return all.filter(book => members.has(book.id));
}

/** Continue at the vacated position after a reviewed book leaves a filtered list. */
export function reviewNeighbors(books: DerivedBook[], selectedId: string | undefined, lastPosition: number) {
  const index = books.findIndex(book => book.id === selectedId);
  const position = index >= 0 ? index : Math.min(lastPosition, books.length);
  return { index, previous: books[position - 1], next: books[index >= 0 ? index + 1 : position] };
}

/** Counts and group visibility share the same view rules as batch actions. */
export function viewSummary(filtered: DerivedBook[], books: DerivedBook[], groups: DuplicateGroup[]) {
  const visibleIds = new Set(filtered.map(book => book.id));
  return {
    renameBooks: currentViewBooks(filtered, books, groups, "rename"),
    duplicateBooks: books.filter(book => book.groupId !== null),
    visibleGroups: groups.filter(group => group.bookIds.some(id => visibleIds.has(id))),
  };
}

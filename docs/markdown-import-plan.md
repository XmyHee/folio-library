# Markdown import and refactoring plan

Status: implemented locally; release validation and online publication must be verified separately. This document records the user-approved scope.

## Delivery sequence

1. Extract presentation components and decouple affected source-text tests. First extraction: ImportArea, BookCover, LibraryStats, ExportReviewPanel, ExportResultPanel, BookDetailsPanel and LibraryResults. View summary tests now exercise the exported selector.
2. Separate persistence, view state, detail drafts and shared task state with one owner per resource. Implemented as useLibraryState, useLibraryView, useBookDetails, useTaskState and useFileIntake. Preserve restoration-before-write, serialized saves, cancellation, object URL cleanup. The clear-undo behavior was superseded on 2026-10-13 by confirmed permanent clear. Selected and pending books are IDs resolved from the current pipeline. Module boundaries are documented in architecture.md.
3. Feature command extraction implemented in commands/import, catalog, library, metadata, covers and export. App connects the exported factories to existing state owners and UI. The four remaining App source-extraction tests now exercise those APIs with their original assertions. Cross-feature command regression tests cover shared locks, cancellation and result preservation. Browser layout/download completion is separate from these automated checks.
4. Markdown conversion is integrated into existing file/folder/drop import. No separate Markdown workspace or conversion button. Implementation and supported limits are documented in markdown-to-pdf.md.

## Approved Markdown behavior

- PDF and EPUB imports retain existing behavior. Markdown converts to PDF before entering normal PDF workflows.
- One batch may contain books, Markdown and relative-path image assets; assets are not standalone book records.
- Preserve Markdown originals and required local assets under Originals; processed PDFs go under Library. Retain the existing four top-level export items and no JSON export.
- Titles, lists, quotations, code blocks, tables and clickable links; selectable/searchable PDF text.
- Chinese fonts embedded where feasible, with explicit font fallback behavior.
- Relative-path and base64 images; missing attachments are visible conversion issues.
- Pagination avoids orphan headings where feasible; long tables span pages with repeated headings.
- Custom CSS themes with a documented support range; headers, footers and page numbers.
- YAML front matter supplies metadata to both PDF properties and Folio. Do not print raw front matter by default.
- No automatic generated cover. Existing Folio cover actions remain available.
- Batch progress, cancellation, observable failures and retry. Successful books survive failures in other items.
- Preserve confirmed metadata and review records on reconversion. Source identity must remain stable across equivalent conversions; generated PDF bytes alone must not define source identity.

## Renderer decision

User decision: pure web generation, no book uploads, with an explicitly documented CSS support subset. No local helper. The renderer uses pdfmake in a dedicated worker, with embedded Noto Sans SC regular/bold fonts. The supported CSS subset and limits are documented in markdown-to-pdf.md. Automated renderer acceptance includes real Chinese text, long tables, code, links, images, front matter and page numbering; browser and online verification remain separate release checks.

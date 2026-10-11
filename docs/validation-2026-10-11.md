# Three-stage release validation (2026-10-11)

Scope: the browser EPUB/PDF workbench, existing first-stage changes, second-stage review workflow, third-stage storage and performance changes, and README replacement. No private book files are publication inputs.

## Automated checks

Run `npm run check` to reproduce TypeScript checking, 19 regression suites and production compilation. Checks cover signatures, Chinese author naming, title-page extraction, paper authors, fuzzy-match boundaries, cover layout/embedding, append imports, manual review, draft comparison, view scope, compact exports, storage migration and cancellation.

Storage tests seed an IndexedDB v1 snapshot, upgrade to v2, preserve manual fields and undo originals, update one metadata row without rewriting blobs, recover 600 synthetic PDFs (~38 MiB), abort a write transaction without losing the previous commit, and reject a stale-tab overwrite. This uses fake-indexeddb; it is not a browser quota or crash-recovery test.

The 600-book synthetic benchmark originally spent about 7.3 seconds in the fuzzy pipeline. Precomputing author, title, volume and series features reduced sampled pipeline execution to about 0.10–0.14 seconds in the same local Node environment. Grouping was compared with the previous implementation on controlled threshold, author, ISBN, series and volume cases. Timings vary; no hard timing limit is asserted in CI.

## Browser checks

An isolated localhost origin with 85 synthetic PDF records was used. Verified: three-page navigation; final five rows; continuous previous/next review; draft prompt on navigation and preserved draft on return; next-book navigation after a confirmed item leaves the pending filter; refresh recovery; cross-page selection retained through filtering; actual CSV containing exactly the two selected books; actual ZIP containing two books and two notes, four top-level entries, and no JSON. Checked desktop sidebar and 390 px mobile layout. A further synthetic PDF was imported through the real file chooser: title, author and first-page preview were recovered without removing the 85 existing records.

Import cancellation retains completed files; ZIP cancellation rejects before download. Network failure/retry, timeout through response-body reading, bounded concurrency and cancellation are checked with mocked providers. Batch cover cancellation retains completed covers. Genuine large scanned/encrypted books, Safari/Firefox, browser storage quota exhaustion, operating-system crash recovery and real provider availability are not established by these tests.

## Deployment gate

GitHub Pages workflow requires type checks, regression tests and production build before deployment. Publication success must additionally be confirmed from the workflow conclusion and the actual target HTML/assets. A Git push alone is not deployment evidence.

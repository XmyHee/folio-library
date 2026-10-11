# Markdown → PDF

Status: implemented in v1.2.0. Files are processed in the browser; no local helper and no book uploads.

## Use

Use the existing Add Books, Add Folder or page-wide drop entry. `.md` and `.markdown` files convert before entering the normal PDF library. A mixed batch can contain PDF, EPUB, Markdown and bitmap assets. Image files in a Markdown batch support the documents and do not become library records. Unsupported book files still show their existing failure records.

For relative images, import the containing folder, or select the Markdown and images together when they are in the same directory. Folder paths disambiguate matching filenames. Dragged folders retain their relative paths. A browser cannot read an unselected local path. Missing/ambiguous images produce a failed conversion record; import the complete folder to retry, or use **重新转换 PDF** when the needed assets were retained. This button uses current print settings and the saved source bytes. It does not reread an edited disk file: import the edited file to create a new source revision.

The existing import area includes **MD 转 PDF 排版**: reading/compact theme, A4/A5/Letter, portrait/landscape, header/footer, page numbers and custom CSS. Changing these settings does not alter existing books until reconversion. No separate Markdown workspace is introduced.

The first conversion downloads approximately 13 MB of self-hosted Chinese font data, cached by the browser. It requires that the site/font resources be reachable at least once. Browser cache eviction or clearing site data can require a new download. No runtime request to a third-party font service is made. The parser and PDF worker load on demand.

## Supported content

- Headings 1–6; ordinary and nested ordered/unordered/task lists; block quotations.
- Bold, emphasis, strike-through, inline code and fenced code blocks. Long code lines wrap, indentation is retained, long blocks span pages. No syntax highlighting. Latin code uses the bundled Latin font; CJK code uses the embedded CJK font.
- GFM tables with repeated header rows and splitting of long rows; up to 12 columns. Use landscape for wide tables.
- Clickable HTTP/HTTPS/mailto links and heading anchors. JavaScript/file/other executable links are not enabled.
- Local relative or base64 PNG/JPEG, and browser-decoded WebP/GIF (first frame). Obsidian `![[image.png]]` embeds are accepted. SVG, AVIF, remote images and arbitrary HTML are not rendered. Images inside table cells or nested inline formatting currently show alt text and an explicit review warning; move them to a standalone paragraph for rendering.
- Chinese/Latin selectable text with subset-embedded Noto Sans SC regular/bold. Italic CJK falls back to the corresponding upright CJK font. No dependence on the reader's installed fonts. Rare characters/emoji outside these fonts are not guaranteed; inspect the generated PDF.
- Heading orphan prevention and `<!-- pagebreak -->` explicit page breaks. No automatic generated cover. The PDF's actual first page is previewed; existing cover actions remain available after conversion.
- Math formulas are retained as ordinary text, not LaTeX/MathJax rendering. Obsidian plugins, callouts, transclusions and arbitrary HTML/CSS layout are outside the supported subset. HTML is never executed and produces a visible conversion warning.

## YAML metadata and print overrides

```yaml
---
title: 中文笔记标题
authors:
  - 张三
  - Simon J. D. Prince
language: zh
date: 2026-10-11
publisher: Example
description: 可选简介
tags: [笔记, 论文]
isbn: "9780131103627"
folio:
  theme: reading
  pageSize: A4
  orientation: portrait
  header: "{title}"
  footer: "第 {page} 页 / 共 {pages} 页"
  pageNumbers: true
  css: |
    h1 { color: #183c60; }
    body { font-size: 11pt; line-height: 1.45; }
---
```

`author` or `authors`, including `{name: ...}` author objects, are accepted. `lang`, `abstract` and `keywords` are accepted aliases. Title falls back to the first H1, then filename; unknown authors remain empty and go through the normal review workflow. YAML is not printed as body content. Malformed/duplicate keys, aliases or non-mapping roots are explicit conversion failures. `folio` values override the page settings. Human corrections remain higher priority than Markdown metadata; ISBN lookup cannot silently replace an explicit Markdown title/author.

Header/footer variables are `{title}`, `{author}`, `{page}`, `{pages}`. Blank text disables the relevant bar. Turning off page numbers suppresses a header/footer that contains page variables, avoiding orphan separators or counter labels. Long headers/footers should be kept short enough for the page margin.

## CSS contract

This is an element-style mapping to the PDF layout engine, not a browser CSS implementation. Supported selectors: `body`, `p`, `h1`–`h6`, `blockquote`, `pre`, `code`, `table`, `th`, `td`, `a`. Comma-separated selectors work. No classes, descendants, pseudo-selectors, `@page`, imports, external fonts, positioning, flex or grid.

| Property | Range |
| --- | --- |
| `color`, `background-color` | `#RGB` / `#RRGGBB`; table cells use background fill, other text uses text background |
| `font-size` | 6–48 pt, px (0.75 pt/px), or unitless points |
| `line-height` | unitless 1–2.5 |
| `text-align` | left, right, center, justify |
| `font-weight` | normal, bold, 400, 700 |
| `font-style` | normal, italic (CJK upright fallback) |
| `margin-top`, `margin-bottom` | 0–72 pt/px or unitless points |

Unsupported rules are listed in conversion warnings and the normal review queue. Page dimensions/orientation are configured with controls or YAML rather than CSS. There is no promise of pixel-identical Obsidian theme output.

## Source, identity, persistence and export

The working `book.file` is always a PDF after successful conversion. `markdownSource` separately retains original UTF-8 bytes, original relative path, SHA-256, referenced local images and their hashes, renderer version and print settings. Conversion failures retain the Markdown and successfully resolved assets so they remain inspectable/retryable. Source blobs are kept in the existing IndexedDB assets store; changing ordinary metadata does not rewrite them.

The book fingerprint is SHA-256 of the versioned `folio-md-source-v1` manifest (Markdown hash plus sorted source-relative image paths/hashes). It does not depend on renderer output bytes, timestamps, font settings or imported folder name. Reconversion keeps the existing Book ID, manual metadata, review key and chosen generated cover. Normal review validity rules still apply if the visible metadata/issues change. Errors/cancellation preserve the prior book record.

The ZIP still has only `README.md`, `folio-export-result.csv`, `Library/`, `Originals/`. The processed PDF goes under `Library` (duplicate PDFs under `Originals/Duplicates` when enabled). Original Markdown plus referenced image paths go under a per-book directory in `Originals`; generated-cover exports additionally retain the pre-cover PDF there. Each source/asset is verified before the per-book files are added to the ZIP. CSV source hash is the actual MD hash, output hash is the exported PDF hash; the identity fingerprint is separate from both. No JSON file is exported. Failed MD conversions cannot be mislabeled/exported as PDF bytes.

MD limit: 5 MiB, 30,000 block tokens; each bitmap at most 20 MiB/40 million pixels. Markdown batches run serially to bound font/layout memory. The worker has a 90-second layout timeout; Stop terminates it. Already completed batch items remain; incomplete work is not saved as success. Font loading has a 120-second timeout and is retryable.

## Implementation and verification

- `lib/markdown/settings`, `model`, `assets`, `definition`, `render` and `render.worker`: preferences, YAML/token model, safe local assets, PDF definition, cancellable worker.
- `lib/markdown/import`, `lib/import-batch`: source/PDF separation and shared intake.
- `commands/markdown`: reconversion using the existing task lock and state owner.
- `check-markdown.cjs`: actual generated PDF/CJK text/fonts/pages/table headers/links, YAML/CSS/images, source identity, persistence, compact export integrity, failed exports, review/cover preservation and cancellation. Browser worker/picker/download checks complement this suite.

Renderer: pdfmake 0.2.20 ([layout documentation](https://pdfmake.github.io/docs/0.1/document-definition-object/page/)); Markdown: marked 17.0.1; YAML: yaml 2.8.3. Font source: [Google Fonts Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc), SIL Open Font License, retained in `public/fonts`. The upstream variable font was instantiated at weights 400 and 700 with fonttools 4.66.1 and losslessly compressed with gzip and decompressed once with the browser native stream API; complete CJK coverage is retained and PDF embedding subsets used glyphs.

The default header is empty; the old automatic `{title}` header preference is migrated to empty. Existing PDFs require reconversion to remove their already rendered headers. Explicit custom/YAML headers remain supported. Font gzip bytes are decompressed once before worker layout; PDF embedding uses the original TTF data.

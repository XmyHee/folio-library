import { createImportBatchParser } from "./import-batch";
import { revokeCovers } from "./book-assets";
import { applyBookPageMetadata, extractPdfBookMetadata, extractEpubBookMetadata } from "./book-metadata";
import { applyPaperMetadata, extractPaperMetadata } from "./paper-metadata";
import { addDocumentCover, paperEvidence } from "./document-cover";
import { epubFirstPage } from "./epub-first-page";
import { readPdfFrontMatter } from "./pdf-cover";
import JSZip from "jszip";
import { detectBookKind } from "./detect";
import { hasZlibTag, primaryIsbn } from "./normalize";
import type { ParsedBook } from "./types";

function uid(): string {
  return crypto.randomUUID();
}

function localName(el: Element): string {
  return el.localName || el.tagName.replace(/^.*:/, "");
}

function byLocal(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter((el) => localName(el) === name);
}

function textOf(el: Element | undefined | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function attr(el: Element | undefined | null, name: string): string {
  if (!el) return "";
  return el.getAttribute(name) || el.getAttribute(name.toLowerCase()) || "";
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("OPF / container XML 解析失败");
  return doc;
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

function joinPath(base: string, rel: string): string {
  const cleaned = rel.replace(/\\/g, "/");
  if (!base) return cleaned.replace(/^\.\//, "");
  const parts = `${base}/${cleaned}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function guessImageType(path: string, blob: Blob): string {
  if (blob.type && blob.type.startsWith("image/")) return blob.type;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    svg: "image/svg+xml",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
  };
  return map[ext] ?? "image/jpeg";
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function relativePathOf(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return rel && rel.length > 0 ? rel : file.name;
}

function findCoverPath(opf: Document, opfDir: string, metas: Element[]): string | null {
  const items = byLocal(opf, "item");
  const byId = new Map<string, Element>();
  for (const item of items) {
    const id = attr(item, "id");
    if (id) byId.set(id, item);
  }

  const coverProp = items.find((item) =>
    (attr(item, "properties") || "").split(/\s+/).includes("cover-image"),
  );
  if (coverProp) return joinPath(opfDir, attr(coverProp, "href"));

  for (const meta of metas) {
    if (attr(meta, "name").toLowerCase() === "cover") {
      const item = byId.get(attr(meta, "content"));
      if (item) return joinPath(opfDir, attr(item, "href"));
    }
  }

  const guideCover = byLocal(opf, "reference").find((ref) =>
    (attr(ref, "type") || "").toLowerCase().includes("cover"),
  );
  if (guideCover) {
    const href = attr(guideCover, "href");
    if (href && !/\.x?html?$/i.test(href)) return joinPath(opfDir, href);
  }

  const named = items.find((item) => {
    const id = attr(item, "id").toLowerCase();
    const href = attr(item, "href").toLowerCase();
    const type = attr(item, "media-type").toLowerCase();
    return type.startsWith("image/") && (id.includes("cover") || href.includes("cover"));
  });
  if (named) return joinPath(opfDir, attr(named, "href"));
  return null;
}

export async function parseEpub(file: File): Promise<ParsedBook> {
  const id = uid();
  const originalName = file.name;
  const relativePath = relativePathOf(file);
  const size = file.size;
  const zlib = hasZlibTag(originalName) || hasZlibTag(relativePath);

  const base: ParsedBook = {
    id,
    file,
    originalName,
    relativePath,
    size,
    hash: "",
    status: "ok",
    rawTitle: "",
    authors: [],
    publisher: "",
    language: "",
    identifiers: [],
    description: "",
    date: "",
    subjects: [],
    series: "",
    spineCount: 0,
    hasZlibTag: zlib,
    kind: "epub",
  };

  try {
    const buffer = await file.arrayBuffer();
    base.hash = await sha256Hex(buffer);
    const zip = await JSZip.loadAsync(buffer);
    const containerFile =
      zip.file("META-INF/container.xml") || zip.file("meta-inf/container.xml");
    if (!containerFile) throw new Error("缺少 META-INF/container.xml，不是标准 EPUB");

    const containerDoc = parseXml(await containerFile.async("string"));
    const rootfile = byLocal(containerDoc, "rootfile")[0];
    const opfPath = attr(rootfile, "full-path").replace(/\\/g, "/");
    if (!opfPath) throw new Error("container.xml 未声明 OPF 路径");

    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error(`找不到 OPF 文件: ${opfPath}`);
    const opf = parseXml(await opfFile.async("string"));
    const opfDir = dirname(opfPath);

    base.rawTitle = byLocal(opf, "title").map(textOf).filter(Boolean)[0] ?? "";
    base.authors = Array.from(new Set(byLocal(opf, "creator").map(textOf).filter(Boolean)));
    base.publisher = byLocal(opf, "publisher").map(textOf).filter(Boolean)[0] ?? "";
    base.language = byLocal(opf, "language").map(textOf).filter(Boolean)[0] ?? "";
    base.identifiers = byLocal(opf, "identifier").map(textOf).filter(Boolean);
    base.isbn = primaryIsbn(base.identifiers);
    base.description = byLocal(opf, "description").map(textOf).filter(Boolean)[0] ?? "";
    base.date = (byLocal(opf, "date").map(textOf).filter(Boolean)[0] ?? "").slice(0, 10);
    base.subjects = byLocal(opf, "subject").map(textOf).filter(Boolean);
    base.spineCount = byLocal(opf, "itemref").length;

    base.epubEmbeddedTitle = base.rawTitle;
    base.epubEmbeddedAuthors = [...base.authors];
    const metas = byLocal(opf, "meta");
    for (const meta of metas) {
      const property = attr(meta, "property").toLowerCase();
      const name = attr(meta, "name").toLowerCase();
      if (property.includes("belongs-to-collection") || name === "calibre:series") {
        const series = textOf(meta) || attr(meta, "content");
        if (series) base.series = series;
      }
    }

    const coverPath = findCoverPath(opf, opfDir, metas);
    if (coverPath) {
      const coverFile = zip.file(coverPath);
      if (coverFile) {
        const blob = await coverFile.async("blob");
        const typed = new Blob([blob], { type: guessImageType(coverPath, blob) });
        base.coverBlob = typed;
        base.coverUrl = URL.createObjectURL(typed);
      }
    }

    if (!base.coverBlob) {
      const first = byLocal(opf, "itemref")[0];
      const item = byLocal(opf, "item").find(item => attr(item, "id") === attr(first, "idref"));
      if (item) try {
        base.coverBlob = await epubFirstPage(zip, joinPath(opfDir, attr(item, "href")).split("#")[0]!);
        base.coverUrl = URL.createObjectURL(base.coverBlob);
        base.coverIsFirstPage = true;
      } catch (error) { base.warnings = [...(base.warnings ?? []), "EPUB 首页预览失败：" + String(error)]; }
    }
    // Read a bounded sample of front matter; never execute EPUB content.
    let sample = "";
    let frontPage = 0;
    for (const reference of byLocal(opf, "itemref").slice(0, 5)) {
      frontPage++;
      const item = byLocal(opf, "item").find(item => attr(item, "id") === attr(reference, "idref"));
      if (!item) continue;
      const chapter = zip.file(joinPath(opfDir, attr(item, "href")).split("#")[0]!);
      if (!chapter) continue;
      try {
        const markup = (await chapter.async("string")).slice(0, 80000);
        const front = new DOMParser().parseFromString(markup, "text/html");
        sample += front.body.textContent ?? "";
        const found = extractEpubBookMetadata(front, originalName, base.epubEmbeddedTitle || "", frontPage);
        if (found && (!base.bookPageMetadata || (!base.bookPageMetadata.authors.length && found.authors.length))) applyBookPageMetadata(base, found);
      } catch (error) {
        base.warnings = [...(base.warnings ?? []), "论文线索读取失败：" + String(error)];
      }
    }
    base.paperReasons = paperEvidence(sample, base.subjects);

    if (!base.rawTitle && base.authors.length === 0) {
      base.status = "error";
      base.error = "EPUB 内部缺少书名与作者";
    }
    return base;
  } catch (err) {
    if (!base.hash) {
      try {
        base.hash = await sha256Hex(await file.arrayBuffer());
      } catch {
        base.hash = `fallback-${id}`;
      }
    }
    return {
      ...base,
      status: "error",
      error: err instanceof Error ? err.message : "读取解析失败",
    };
  }
}

export const parseEpubBatch = createImportBatchParser({ parseBook, addDocumentCover, revokeCovers });

export { revokeCovers } from "./book-assets";


/** Read first chunk of a PDF and pull Info dict Title/Author + ISBN-like strings */

/** Extract ISBN-10/13 candidates from plain text (same patterns as rename_pdf_isbn.py) */
/**
 * Lightweight PDF parse (no pdf.js dependency):
 *  - Info dict Title/Author
 *  - ISBN from first ~1.5MB binary/text (covers most front-matter)
 * Full-file hash only when size is moderate (memory-safe).
 */

function findIsbnInText(text: string): string | null {
  const patterns = [
    /978[-0-9\s]{10,16}/g,
    /979[-0-9\s]{10,16}/g,
    /ISBN(?:-1[03])?:?\s*([0-9X][0-9X\-\s]{9,17})/gi,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const raw of matches) {
      const digits = String(raw).replace(/[^0-9X]/gi, "").toUpperCase().replace(/^ISBN/, "");
      if (digits.length === 13 && /^97[89]/.test(digits)) return digits;
      if (digits.length === 10) return digits;
    }
  }
  return null;
}

function decodePdfLiteral(s: string): string {
  let out = s.replace(/\\(\d{1,3})/g, (_, n) => String.fromCharCode(parseInt(n, 8)));
  out = out.replace(/\\n/g, " ").replace(/\\r/g, " ");
  return out.replace(/\0/g, "").replace(/\s+/g, " ").trim();
}

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** PDF via pdf.js (first pages text + metadata + optional cover) */
export async function parsePdf(file: File): Promise<ParsedBook> {
  const id = crypto.randomUUID();
  const originalName = file.name;
  const relativePath =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

  const base: ParsedBook = {
    id,
    file,
    originalName,
    relativePath,
    size: file.size,
    hash: "",
    status: "ok",
    rawTitle: "",
    authors: [],
    publisher: "",
    language: "",
    identifiers: [],
    description: "",
    date: "",
    subjects: [],
    series: "",
    spineCount: 0,
    hasZlibTag: /z-library/i.test(originalName),
    kind: "pdf",
  };

  try {
    // Hash (full file only if not huge)
    if (file.size <= 40 * 1024 * 1024) {
      base.hash = await hashBuffer(await file.arrayBuffer());
    } else {
      base.hash = "partial-" + (await hashBuffer(await file.slice(0, 2 * 1024 * 1024).arrayBuffer()));
    }

    // Dynamic pdf.js — only loaded when a PDF is opened
    const pdfjs = await import("pdfjs-dist");
    // Vite worker
    try {
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    } catch {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    try {
    const meta = await readPdfFrontMatter(base, doc);
    const info = (meta as { info?: Record<string, string> } | null)?.info;
    const xmp = meta?.metadata;
    if (xmp) {
      const value = (key: string) => {
        const v = xmp.get(key);
        return Array.isArray(v) ? v.map(String).join("; ") : typeof v === "string" ? v : "";
      };
      base.rawTitle = value("dc:title");
      base.authors = value("dc:creator").split(";").map(v => v.trim()).filter(Boolean);
      base.publisher = value("dc:publisher");
      base.language = value("dc:language");
      base.description = value("dc:description");
      base.date = value("dc:date");
      const identifier = value("dc:identifier");
      if (identifier) base.identifiers.push(identifier);
    }
    if (info) {
      if (info.Title && !base.rawTitle) base.rawTitle = String(info.Title).trim();
      if (info.Author && !base.authors.length) base.authors = [String(info.Author).trim()].filter(Boolean);
      if (info.Subject) base.subjects = [String(info.Subject).trim()].filter(Boolean);
      if (info.Keywords) {
        const kw = String(info.Keywords);
        const isbn = findIsbnInText(kw);
        if (isbn) base.identifiers.push(isbn);
      }
    }

    base.pdfEmbeddedTitle = base.rawTitle;
    base.pdfEmbeddedAuthors = [...base.authors];
    let firstPageItems: unknown[] = [];
    const frontPages: { number: number; items: unknown[] }[] = [];
    // First 5 pages text for ISBN (same idea as rename_pdf_isbn.py)
    const maxPages = Math.min(doc.numPages, 5);
    let text = "";
    for (let i = 1; i <= maxPages; i++) {
      try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      if (i === 1) firstPageItems = content.items;
      frontPages.push({ number: i, items: content.items });
      const pageText = content.items
        .map((it) => ("str" in it ? String((it as { str: string }).str) : ""))
        .join(" ");
      text += pageText + "\n";
      } catch (error) {
        base.warnings = [...(base.warnings ?? []), `第 ${i} 页文字读取失败：${String(error)}`];
      }
    }

    base.paperReasons = paperEvidence(text, base.subjects);
    if (base.paperReasons.length) {
      const paper = extractPaperMetadata(firstPageItems, originalName);
      if (paper) applyPaperMetadata(base, paper);
      else base.warnings = [...(base.warnings ?? []), "已发现论文线索，但首页标题作者尚未可靠提取，请人工核对。"];
    }
    if (!base.paperMetadata) {
      const found = extractPdfBookMetadata(frontPages, originalName, base.pdfEmbeddedTitle || "");
      if (found) applyBookPageMetadata(base, found);
      if (!base.authors.filter(author => !/^(?:unknown|anonymous)$/i.test(author)).length) base.warnings = [...(base.warnings ?? []), "未从内置书目或前页可靠识别作者，可在详情中核对或补充。"];
    }
    const isbn = primaryIsbn(base.identifiers) || findIsbnInText(text) || findIsbnInText(originalName);
    if (isbn) {
      base.identifiers = [...new Set([...base.identifiers, isbn])];
      base.isbn = isbn;
    }

    return base;
    } finally {
      await doc.destroy();
    }
  } catch (err) {
    // Fallback: binary scan (no pdf.js)
    try {
      const scan = await file.slice(0, Math.min(file.size, 1536 * 1024)).arrayBuffer();
      if (!base.hash) base.hash = "partial-" + (await hashBuffer(scan));
      const bytes = new Uint8Array(scan);
      let raw = "";
      for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]!);
      const titleM = raw.match(/\/Title\s*\(([^\)]{1,300})\)/);
      const authorM = raw.match(/\/Author\s*\(([^\)]{1,200})\)/);
      if (titleM?.[1]) base.rawTitle = decodePdfLiteral(titleM[1]);
      if (authorM?.[1]) base.authors = [decodePdfLiteral(authorM[1])].filter(Boolean);
      const isbn = findIsbnInText(originalName) || findIsbnInText(raw);
      if (isbn) {
        base.identifiers = [isbn];
        base.isbn = isbn;
      }
      base.status = "error";
      base.error = "PDF 完整解析失败，仅提取部分元数据：" + (err instanceof Error ? err.message : "未知错误");
      return base;
    } catch {
      return {
        ...base,
        status: "error",
        error: err instanceof Error ? err.message : "PDF 读取失败",
        hash: base.hash || "fallback-" + id,
      };
    }
  }
}


export async function parseBook(file: File): Promise<ParsedBook> {
  let kind: "pdf" | "epub" | "other" = "other";
  let detectionError = "";
  try {
    if (file.size > 256 * 1024 * 1024) detectionError = "文件超过 256 MiB 浏览器处理范围，请先拆分或使用本地工具处理";
    else kind = await detectBookKind(file);
  }
  catch (err) { detectionError = err instanceof Error ? err.message : "文件读取失败"; }
  if (kind !== "other") {
    const book = await (kind === "pdf" ? parsePdf(file) : parseEpub(file));
    if (!file.name.toLowerCase().endsWith("." + kind)) {
      book.warnings = [...(book.warnings ?? []), "扩展名与实际格式不符，已按内容识别为 " + kind.toUpperCase()];
    }
    return book;
  }
  // Unsupported — still try filename path later
  return {
    id: crypto.randomUUID(),
    file,
    originalName: file.name,
    relativePath: file.name,
    size: file.size,
    hash: "",
    status: "error",
    error: detectionError || "未识别为有效 EPUB / PDF；不支持的格式或损坏文件需人工检查",
    rawTitle: "",
    authors: [],
    publisher: "",
    language: "",
    identifiers: [],
    description: "",
    date: "",
    subjects: [],
    series: "",
    spineCount: 0,
    hasZlibTag: false,
    kind: "other",
  };
}

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ParsedBook } from "./types";

/** Preview errors and metadata errors are independent and remain visible on the source record. */
export async function readPdfFrontMatter(
  base: ParsedBook,
  doc: PDFDocumentProxy,
  render = pdfFirstPage,
  createUrl: (blob: Blob) => string = blob => URL.createObjectURL(blob),
) {
  base.spineCount = doc.numPages;
  try {
    base.coverBlob = await render(doc);
    base.coverUrl = createUrl(base.coverBlob);
  } catch (error) {
    base.warnings = [...(base.warnings ?? []), "PDF 首页生成失败：" + String(error)];
  }
  return doc.getMetadata().catch((error: unknown) => {
    base.warnings = [...(base.warnings ?? []), "PDF 元数据读取失败：" + String(error)];
    return null;
  });
}

/** Render actual first page, independently of metadata and text extraction. */
export async function pdfFirstPage(doc: PDFDocumentProxy): Promise<Blob> {
  if (doc.numPages < 1) throw new Error("PDF 没有可显示的页面");
  const page = await doc.getPage(1);
  const original = page.getViewport({ scale: 1 });
  const longest = Math.max(original.width, original.height);
  if (!Number.isFinite(longest) || longest <= 0) throw new Error("PDF 首页尺寸无效");
  const viewport = page.getViewport({ scale: Math.min(1, 720 / longest) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建 PDF 首页画布");
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("PDF 首页图像生成失败");
    return blob;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

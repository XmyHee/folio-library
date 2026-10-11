import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import type { ParsedBook } from "./types";
import { refreshTitleCover } from "./document-cover";

const elements = (doc: Document | Element, name: string) => Array.from(doc.getElementsByTagName("*")).filter(e => e.localName === name);
function xml(text: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (elements(doc, "parsererror").length) throw new Error("EPUB XML 无法解析");
  return doc;
}
/** Always derive exports from the untouched source; repeated exports cannot accumulate covers. */
export async function embedCover(book: ParsedBook): Promise<Uint8Array> {
  const source = new Uint8Array(await book.file.arrayBuffer());
  if (book.coverPreference !== "title") return source;
  if (!book.titleCoverBlob) throw new Error("生成封面缺失，请重新生成");
  const cover = book.coverStyleVersion === 2 ? book.titleCoverBlob : await refreshTitleCover(book);
  const image = new Uint8Array(await cover.arrayBuffer());
  if (book.kind === "pdf") {
    const pdf = await PDFDocument.load(source);
    const jpg = await pdf.embedJpg(image);
    if (!pdf.getPageCount()) throw new Error("PDF 没有可读取的页面");
    const original = pdf.getPage(0), box = original.getCropBox();
    const rotated = Math.abs(original.getRotation().angle) % 180 === 90;
    const size = rotated ? { width: box.height, height: box.width } : box;
    const page = pdf.insertPage(0, [size.width, size.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: size.width, height: size.height });
    return pdf.save();
  }
  if (book.kind !== "epub") throw new Error("该格式暂不支持写入封面");
  const zip = await JSZip.loadAsync(source);
  if (zip.file("META-INF/signatures.xml") || zip.file("META-INF/encryption.xml")) throw new Error("含签名或加密声明的 EPUB 暂不支持改写封面");
  const container = zip.file("META-INF/container.xml");
  if (!container) throw new Error("缺少 EPUB container.xml");
  const path = elements(xml(await container.async("string")), "rootfile")[0]?.getAttribute("full-path");
  if (!path || !zip.file(path)) throw new Error("缺少 EPUB OPF");
  const opf = xml(await zip.file(path)!.async("string"));
  const manifest = elements(opf, "manifest")[0], spine = elements(opf, "spine")[0], metadata = elements(opf, "metadata")[0];
  if (!manifest || !spine || !metadata) throw new Error("EPUB 结构不完整");
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  let key = "folio-cover", index = 0;
  while (elements(opf, "item").some(e => e.getAttribute("id") === key || e.getAttribute("id") === key + "-page") || zip.file(dir + key + ".jpg") || zip.file(dir + key + ".xhtml")) key = "folio-cover-" + ++index;
  for (const item of elements(opf, "item")) {
    const props = (item.getAttribute("properties") || "").split(/\s+/).filter(p => p && p !== "cover-image");
    if (props.length) item.setAttribute("properties", props.join(" ")); else item.removeAttribute("properties");
  }
  for (const meta of elements(opf, "meta")) if (meta.getAttribute("name") === "cover") meta.parentNode?.removeChild(meta);
  const make = (name: string, attrs: Record<string, string>) => { const e = opf.createElementNS(manifest.namespaceURI, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  manifest.appendChild(make("item", { id: key, href: key + ".jpg", "media-type": "image/jpeg", ...(opf.documentElement.getAttribute("version")?.startsWith("3") ? { properties: "cover-image" } : {}) }));
  manifest.appendChild(make("item", { id: key + "-page", href: key + ".xhtml", "media-type": "application/xhtml+xml" }));
  metadata.appendChild(make("meta", { name: "cover", content: key }));
  spine.insertBefore(make("itemref", { idref: key + "-page" }), spine.firstChild);
  for (const ref of elements(opf, "reference")) if (ref.getAttribute("type") === "cover") ref.parentNode?.removeChild(ref);
  let guide = elements(opf, "guide")[0];
  if (!guide) { guide = make("guide", {}); opf.documentElement.appendChild(guide); }
  guide.appendChild(make("reference", { type: "cover", title: "封面", href: key + ".xhtml" }));
  zip.file(path, new XMLSerializer().serializeToString(opf));
  zip.file(dir + key + ".jpg", image);
  zip.file(dir + key + ".xhtml", `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>封面</title><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#233c50}img{display:block;width:100%;height:100%;object-fit:fill}</style></head><body><img src="${key}.jpg" alt="生成封面"/></body></html>`);
  const output = new JSZip();
  output.file("mimetype", "application/epub+zip", { compression: "STORE" });
  for (const name of Object.keys(zip.files)) if (name !== "mimetype" && !zip.files[name]!.dir) output.file(name, await zip.files[name]!.async("uint8array"));
  return output.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

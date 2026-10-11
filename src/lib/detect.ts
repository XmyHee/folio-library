import JSZip from "jszip";

/** Content is authoritative for format; extensions and MIME are only hints. */
export async function detectBookKind(file: Blob): Promise<"pdf" | "epub" | "other"> {
  const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const text = new TextDecoder("latin1").decode(header);
  if (text.includes("%PDF-")) return "pdf";
  if (header[0] !== 0x50 || header[1] !== 0x4b) return "other";
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const mime = zip.file("mimetype");
    const container = zip.file("META-INF/container.xml") ?? zip.file("meta-inf/container.xml");
    if (!container) return "other";
    if (mime && (await mime.async("string")).trim() !== "application/epub+zip") return "other";
    return "epub";
  } catch {
    return "other";
  }
}

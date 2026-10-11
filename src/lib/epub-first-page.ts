import type JSZip from "jszip";
/** Reflowable EPUB has no fixed page: render a safe first-screen layout, never run book HTML. */
export async function epubFirstPage(zip: JSZip, path: string): Promise<Blob> {
  const entry = zip.file(path);
  if (!entry) throw new Error("找不到 EPUB 第一章");
  const parsed = new DOMParser().parseFromString((await entry.async("string")).slice(0, 200000), "text/html");
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:1200px;border:0";
  document.body.appendChild(frame);
  try {
    const target = frame.contentDocument;
    if (!target) throw new Error("无法建立 EPUB 首页预览");
    const style = target.createElement("style");
    style.textContent = 'body{margin:64px;color:#222;background:white;font:24px/1.7 "Microsoft YaHei",sans-serif;overflow:hidden}img{max-width:100%;max-height:1000px}h1,h2{line-height:1.4}';
    target.head.appendChild(style);
    const copy = async (node: Node, parent: Node): Promise<void> => {
      if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(target.createTextNode(node.textContent ?? "")); return; }
      if (!(node instanceof Element)) return;
      const tag = node.localName.toLowerCase();
      if (["script", "style", "iframe", "object", "embed", "link", "meta", "form", "audio", "video", "svg"].includes(tag)) return;
      if (tag === "img") {
        const src = node.getAttribute("src") || "";
        if (/^(?:[a-z]+:|\/\/)/i.test(src)) return;
        const parts = (path.slice(0, path.lastIndexOf("/") + 1) + src).split("/");
        const normalized: string[] = [];
        for (const part of parts) { if (part === "..") normalized.pop(); else if (part && part !== ".") normalized.push(part); }
        const image = zip.file(decodeURIComponent(normalized.join("/")).split("#")[0]!);
        if (!image) return;
        const img = target.createElement("img");
        const extension = src.split(".").pop()?.toLowerCase();
        if (!["jpg", "jpeg", "png", "gif", "webp"].includes(extension ?? "")) return;
        img.src = `data:image/${extension === "jpg" ? "jpeg" : extension};base64,${await image.async("base64")}`;
        parent.appendChild(img);
        await img.decode(); return;
      }
      const element = target.createElement(["h1", "h2", "h3", "p", "div", "span", "br", "strong", "em", "ul", "li"].includes(tag) ? tag : "div");
      parent.appendChild(element);
      for (const child of Array.from(node.childNodes)) await copy(child, element);
    };
    for (const node of Array.from(parsed.body.childNodes)) await copy(node, target.body);
    if (!target.body.textContent?.trim() && !target.body.querySelector("img")) throw new Error("首页没有可预览内容");
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(target.body, { width: 800, height: 1200, windowWidth: 800, windowHeight: 1200, scale: 1, backgroundColor: "#fff", logging: false, imageTimeout: 5000 });
    try { return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("EPUB 首页预览生成失败")), "image/jpeg", 0.9)); }
    finally { canvas.width = canvas.height = 0; }
  } finally { frame.remove(); }
}

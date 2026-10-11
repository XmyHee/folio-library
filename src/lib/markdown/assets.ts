export type MarkdownAsset = { path: string; file: File; hash: string };
export function sourcePath(file: File): string {
  return ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, "/").normalize("NFC");
}
export function normalizePath(value: string): string {
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) throw new Error("图片路径超出导入文件夹"); parts.pop(); }
    else parts.push(part.normalize("NFC"));
  }
  return parts.join("/");
}
export async function sha256(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export function checkCancelled(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException("转换已取消", "AbortError"); }
export function imageDimensions(data:string):[number,number] {
  const bytes=Uint8Array.from(atob(data.split(",")[1]??""),char=>char.charCodeAt(0));
  const view=new DataView(bytes.buffer);
  if(bytes[0]===137&&bytes.length>=24)return [view.getUint32(16),view.getUint32(20)];
  if(bytes[0]===255&&bytes[1]===216){
    for(let offset=2;offset+8<bytes.length;){
      if(bytes[offset]!==255)break;
      const marker=bytes[offset+1]!,length=view.getUint16(offset+2);
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return [view.getUint16(offset+7),view.getUint16(offset+5)];
      if(length<2)break;offset+=length+2;
    }
  }
  throw new Error("无法读取图片尺寸，请将图片重新保存为 PNG 或 JPEG");
}
export class MarkdownAssets {
  private readonly byPath = new Map<string, File[]>();
  readonly used = new Map<string, MarkdownAsset>();
  constructor(private readonly source: File, files: File[], private readonly signal?: AbortSignal) {
    for (const file of files) {
      const key = normalizePath(sourcePath(file));
      this.byPath.set(key, [...(this.byPath.get(key) ?? []), file]);
    }
  }
  async image(href: string): Promise<string> {
    checkCancelled(this.signal);
    let file: Blob;
    if (/^data:/i.test(href)) {
      const match = href.match(/^data:image\/(png|jpe?g|webp|gif);base64,([a-z\d+/=\s]+)$/i);
      if (!match) throw new Error("图片 base64 格式不支持：仅支持 PNG、JPEG、WebP、GIF");
      if (match[2]!.length > 28 * 1024 * 1024) throw new Error("图片超过 20 MB 限制");
      file = new Blob([Uint8Array.from(atob(match[2]!), char => char.charCodeAt(0))], {type:"image/" + match[1]!.toLowerCase().replace("jpg", "jpeg")});
    } else {
      if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(href)) throw new Error("图片需使用本地相对路径或 base64：" + href);
      let decoded: string;
      try { decoded = decodeURIComponent(href.split(/[?#]/)[0]!); } catch { throw new Error("图片路径编码无效：" + href); }
      const dir = sourcePath(this.source).split("/").slice(0, -1).join("/");
      const path = normalizePath((dir ? dir + "/" : "") + decoded);
      const candidates = this.byPath.get(path) ?? [];
      if (candidates.length !== 1) throw new Error(candidates.length ? "图片路径重复，无法确定附件：" + path : "缺少图片，请通过文件夹一起导入：" + path);
      file = candidates[0]!;
      if (!this.used.has(path)) this.used.set(path, {path, file: candidates[0]!, hash:await sha256(file)});
    }
    if (file.size > 20 * 1024 * 1024) throw new Error("图片超过 20 MB 限制");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpeg = bytes[0] === 255 && bytes[1] === 216;
    if (png || jpeg) {
      let binary = "";
      for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
      checkCancelled(this.signal);
      const result=`data:image/${png ? "png" : "jpeg"};base64,${btoa(binary)}`;
      const [width,height]=imageDimensions(result);
      if(!width||!height||width*height>40_000_000)throw new Error("图片像素过大或尺寸无效，请先缩小图片");
      return result;
    }
    // Decode and flatten other browser bitmap formats; SVG/HTML are never executed.
    if (!(bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) && !(bytes[0] === 82 && bytes[8] === 87 && bytes[9] === 69)) throw new Error("图片内容不是支持的 PNG、JPEG、WebP 或 GIF");
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error("图片像素过大，请先缩小图片");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      try {
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建图片画布");
        context.drawImage(bitmap, 0, 0); checkCancelled(this.signal);
        return canvas.toDataURL("image/png");
      } finally { canvas.width = canvas.height = 0; }
    } finally { bitmap.close(); }
  }
}

export function Cover({ src, kind }: { src?: string; kind?: string }) {
  return (
    <div className="cover" aria-hidden>
      {src ? <img src={src} alt="" /> : kind === "pdf" ? "PDF 首页不可用" : kind === "epub" ? "EPUB 无封面" : "无预览"}
    </div>
  );
}

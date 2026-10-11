import type { MarkdownSettings } from "../lib/markdown/model";

export function MarkdownOptions({value,onChange,disabled}:{value:MarkdownSettings;onChange:(value:MarkdownSettings)=>void;disabled:boolean}){
  const update=<K extends keyof MarkdownSettings>(key:K,next:MarkdownSettings[K])=>onChange({...value,[key]:next});
  return <details className="markdown-options">
    <summary>MD 转 PDF 排版</summary>
    <p className="hint">导入 MD 时自动转换；修改后可在详情中重新转换。文件夹中的图片会一起读取。</p>
    <fieldset disabled={disabled} className="markdown-options-grid">
      <label>主题<select value={value.theme} onChange={event=>update("theme",event.target.value as MarkdownSettings["theme"])}><option value="reading">阅读</option><option value="compact">紧凑</option></select></label>
      <label>纸张<select value={value.pageSize} onChange={event=>update("pageSize",event.target.value as MarkdownSettings["pageSize"])}><option>A4</option><option>A5</option><option>LETTER</option></select></label>
      <label>方向<select value={value.orientation} onChange={event=>update("orientation",event.target.value as MarkdownSettings["orientation"])}><option value="portrait">纵向</option><option value="landscape">横向</option></select></label>
      <label className="toggle"><input type="checkbox" checked={value.pageNumbers} onChange={event=>update("pageNumbers",event.target.checked)}/>显示页码</label>
      <label>页眉<input value={value.header} maxLength={500} onChange={event=>update("header",event.target.value)}/></label>
      <label>页脚<input value={value.footer} maxLength={500} onChange={event=>update("footer",event.target.value)}/></label>
      <label className="markdown-css">自定义 CSS<textarea aria-label="MD 自定义 CSS" rows={3} value={value.css} maxLength={20000} placeholder="body { font-size: 11pt; line-height: 1.45; }" onChange={event=>update("css",event.target.value)}/></label>
    </fieldset>
    <p className="hint">页眉页脚可用 {"{title}、{author}、{page}、{pages}"}。CSS 支持 body、p、h1–h6、blockquote、pre、code、table、th、td、a 的字号、颜色、行高、对齐、粗斜体和段前后间距；未支持的规则会提示。YAML 的 folio 配置优先。</p>
  </details>;
}

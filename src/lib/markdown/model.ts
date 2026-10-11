import { Lexer } from "marked";
import { parseDocument } from "yaml";
import type { Style } from "pdfmake/interfaces";

import { defaultMarkdownSettings, markdownSettings, type MarkdownSettings } from "./settings";
export { defaultMarkdownSettings, markdownSettings, type MarkdownSettings } from "./settings";

export type MarkdownDocument = {
  body: string; title: string; authors: string[]; publisher: string; language: string;
  date: string; description: string; subjects: string[]; isbn: string;
  settings: MarkdownSettings; warnings: string[];
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const strings = (value: unknown): string[] => (Array.isArray(value) ? value : [value]).map(item => typeof item === "object" ? string(object(item).name) : string(item)).filter(Boolean);

export function readMarkdown(text: string, filename: string, defaults = defaultMarkdownSettings): MarkdownDocument {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  let data: Record<string, unknown> = {}, body = text;
  if (text.startsWith("---\n")) {
    const match = text.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)\s*(?:\n|$)/);
    if (!match) throw new Error("YAML 元数据缺少结束分隔线 ---");
    const document = parseDocument(match[1]!, { schema: "core", uniqueKeys: true });
    if (document.errors.length) throw new Error("YAML 元数据无效：" + document.errors[0]!.message);
    const value:unknown=document.toJS({ maxAliasCount: 0 });
    if(value!==null&&(!value||typeof value!=="object"||Array.isArray(value)))throw new Error("YAML 元数据必须是键值表");
    data = object(value);
    body = text.slice(match[0].length);
  }
  if (!body.trim()) throw new Error("Markdown 正文为空");
  // Obsidian image embeds; never interpret or execute embedded HTML/JavaScript.
  body = body.replace(/!\[\[([^\]\n]+)\]\]/g, (_, inner: string) => {
    const [target, label] = inner.split("|");
    return `![${(label || target || "").replace(/[\[\]]/g, "")}](${encodeURI(target!.trim()).replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
  });
  const tokens = Lexer.lex(body, { gfm: true });
  const heading = tokens.find(token => token.type === "heading" && token.depth === 1);
  const title = string(data.title) || (heading?.type === "heading" ? heading.text.replace(/[*_`]/g, "").trim() : "") || filename.replace(/\.(?:md|markdown)$/i, "");
  const folio = object(data.folio);
  const settings = markdownSettings({ ...defaults, ...folio });
  return { body, title, authors: strings(data.authors ?? data.author), publisher: string(data.publisher),
    language: string(data.language ?? data.lang) || (/[\u3400-\u9fff]/.test(title + body.slice(0, 1000)) ? "zh" : "en"),
    date: string(data.date), description: string(data.description ?? data.abstract),
    subjects: strings(data.tags ?? data.keywords), isbn: string(data.isbn), settings, warnings: [] };
}

export function markdownStyles(settings: MarkdownSettings) {
  const compact = settings.theme === "compact";
  const styles: Record<string, Style> = {
    body: { fontSize: compact ? 10 : 11, lineHeight: compact ? 1.25 : 1.45, color: "#243247" },
    p: { margin: [0, 0, 0, compact ? 6 : 9] },
    h1: { fontSize: 23, bold: true, color: "#183c60", margin: [0, 14, 0, 12] },
    h2: { fontSize: 17, bold: true, color: "#183c60", margin: [0, 14, 0, 8] },
    h3: { fontSize: 14, bold: true, margin: [0, 12, 0, 6] },
    h4: { fontSize: 12, bold: true, margin: [0, 10, 0, 5] },
    h5: { fontSize: 11, bold: true, margin: [0, 9, 0, 4] },
    h6: { fontSize: 10, bold: true, margin: [0, 8, 0, 4] },
    blockquote: { color: "#526172", italics: true, margin: [15, 3, 0, 10] },
    pre: { font: "Mono", fontSize: 9, lineHeight: 1.15, background: "#eef2f6", margin: [0, 4, 0, 10] },
    code: { font: "Mono", fontSize: 9, color: "#895127", background: "#eef2f6" },
    table: { fontSize: compact ? 9 : 10, margin: [0, 4, 0, 12] },
    th: { bold: true, fillColor: "#e8eef5", margin: [3, 5, 3, 5] },
    td: { margin: [3, 4, 3, 4] }, a: { color: "#1465aa", decoration: "underline" },
  };
  const warnings: string[] = [];
  const css = settings.css.replace(/\/\*[\s\S]*?\*\//g, "");
  let consumed = "";
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    consumed += match[0];
    const selectors = match[1]!.trim().split(",").map(value => value.trim());
    for (const selector of selectors) {
      const style = styles[selector];
      if (!style) { warnings.push("CSS 不支持的选择器：" + selector); continue; }
      for (const rule of match[2]!.split(";")) {
        if (!rule.trim()) continue;
        const [property, ...rest] = rule.split(":");
        const value = rest.join(":").trim(), key = property!.trim().toLowerCase();
        const numeric = value.match(/^(\d+(?:\.\d+)?)(pt|px)?$/);
        if (["color", "background-color"].includes(key) && /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(value)) {
          if (key === "color") style.color = value;
          else if (selector === "th" || selector === "td") style.fillColor = value;
          else style.background = value;
        } else if (key === "font-size" && numeric && +numeric[1]! >= 6 && +numeric[1]! <= 48) style.fontSize = +numeric[1]! * (numeric[2] === "px" ? .75 : 1);
        else if (key === "line-height" && /^\d+(?:\.\d+)?$/.test(value) && +value >= 1 && +value <= 2.5) style.lineHeight = +value;
        else if (key === "text-align" && ["left", "right", "center", "justify"].includes(value)) style.alignment = value as Style["alignment"];
        else if (key === "font-weight" && ["normal", "bold", "400", "700"].includes(value)) style.bold = value === "bold" || value === "700";
        else if (key === "font-style" && ["normal", "italic"].includes(value)) style.italics = value === "italic";
        else if (["margin-top", "margin-bottom"].includes(key) && numeric && +numeric[1]! <= 72) {
          const margin = Array.isArray(style.margin) && style.margin.length === 4 ? [...style.margin] : [0, 0, 0, 0];
          margin[key === "margin-top" ? 1 : 3] = +numeric[1]! * (numeric[2] === "px" ? .75 : 1);
          style.margin = margin as [number, number, number, number];
        } else warnings.push(`CSS 未应用：${selector} { ${key}: ${value} }`);
      }
    }
  }
  if (css.trim() && !consumed.trim()) warnings.push("CSS 无有效规则；仅支持文档元素选择器与已列出的属性");
  return { styles, warnings: [...new Set(warnings)] };
}

import type { ParsedBook } from "./types";

type TextItem = { str: string; transform: number[]; width: number; height: number };
export type PaperMetadata = {
  title: string;
  authors: string[];
  titleEvidence: string[];
  authorEvidence: string[];
  arxivId?: string;
};
type Line = { text: string; y: number; size: number; items: TextItem[] };

function normalized(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function pdfHeaderLines(items: unknown[]): Line[] {
  const lines: Line[] = [];
  for (const raw of items) {
    const item = raw as Partial<TextItem>;
    if (typeof item.str !== "string" || !item.str.trim() || !Array.isArray(item.transform) || item.transform.length < 6) continue;
    // Sideways arXiv stamps must not become titles or authors.
    if (Math.abs(item.transform[1]!) > Math.abs(item.transform[0]!) * 0.25) continue;
    const size = item.height || Math.abs(item.transform[3]!) || 10;
    const line = lines.find(line => Math.abs(line.y - item.transform![5]!) <= Math.max(2, Math.min(line.size, size) * 0.3));
    if (line) { line.items.push(item as TextItem); line.size = Math.max(line.size, size); }
    else lines.push({ text: "", y: item.transform[5]!, size, items: [item as TextItem] });
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.transform[4]! - b.transform[4]!);
    let end = -Infinity;
    line.text = line.items.map(item => {
      const gap = item.transform[4]! - end;
      end = item.transform[4]! + (item.width || 0);
      return (Number.isFinite(gap) && gap > line.size * 2 ? "; " : gap > line.size * 0.16 && Number.isFinite(gap) ? " " : "") + item.str;
    }).join("").replace(/\s+/g, " ").trim();
  }
  return lines.sort((a, b) => b.y - a.y);
}

export function namesInLine(text: string): string[] {
  if (/@|\b(?:university|department|institute|laboratory|abstract|introduction|received|revised|accepted|copyright|arxiv)\b|大学|学院|摘要|研究所/i.test(text)) return [];
  const cleaned = text.replace(/^\s*(?:authors?\s*[:：]|作者\s*[:：])/i, "").replace(/[\d*†‡§¶♠♣♥♦]+/g, "").trim();
  const parts = cleaned.split(/\s*[,;，；、&]\s*|\s+(?:and|AND)\s+/).map(s => s.replace(/^(?:and\s+)/i, "").trim()).filter(Boolean);
  if (!parts.length || parts.length > 30) return [];
  const isName = (name: string) => {
    if (/^[\p{Script=Han}]{2,5}$/u.test(name)) return true;
    const words = name.split(/\s+/);
    return words.length >= 2 && words.length <= 6 && words.every(word => /^[\p{L}][\p{L}.'’\-]*$/u.test(word))
      && (words.every(word => /^(?:\p{Lu}|[a-z]{1,3}$)/u.test(word)) || name === name.toUpperCase());
  };
  return parts.every(isName) ? parts : [];
}

/** First-page header only. References and later-page citations cannot supply metadata. */
export function extractPaperMetadata(items: unknown[], filename: string): PaperMetadata | undefined {
  const all = pdfHeaderLines(items);
  const abstractIndex = all.findIndex(line => /^(?:abstract\b|摘\s*要)/i.test(line.text));
  if (abstractIndex < 1) return undefined;
  const header = all.slice(0, abstractIndex).filter(line => !/^(?:arxiv\b|https?:|doi\b|\d+$|preprint\b|submitted\b|received\b|revised\b)|@/i.test(line.text));
  if (header.length < 2 || header.length > 35) return undefined;
  const stem = normalized(filename.replace(/\.pdf$/i, "").split(" - ")[0]!);
  let best: { start: number; end: number; score: number } | undefined;
  const tokens = new Set(stem.split(" ").filter(t => t.length > 2));
  // Filename corroborates title boundaries; a multi-line title is kept as one title.
  for (let start = 0; start < Math.min(header.length, 12); start++) {
    for (let end = start + 1; end <= Math.min(header.length - 1, start + 8); end++) {
      const candidate = normalized(header.slice(start, end).map(line => line.text).join(" "));
      const candidateTokens = new Set(candidate.split(" ").filter(t => t.length > 2));
      const common = [...tokens].filter(t => candidateTokens.has(t)).length;
      const score = tokens.size ? 2 * common / (tokens.size + candidateTokens.size) : 0;
      if (score >= 0.72 && (!best || score > best.score)) best = { start, end, score };
    }
  }
  if (!best) {
    // With an opaque filename, accept only an isolated largest-font title block.
    const largest = Math.max(...header.map(line => line.size));
    const start = header.findIndex(line => line.size >= largest * 0.94);
    let end = start + 1;
    while (end < header.length && header[end]!.size >= largest * 0.94 && Math.abs(header[end - 1]!.y - header[end]!.y) < largest * 2.5) end++;
    if (end >= header.length || header.slice(end).every(line => line.size >= largest * 0.94)) return undefined;
    best = { start, end, score: 0 };
  }
  const titleLines = header.slice(best.start, best.end);
  const authorLines: string[] = [], authors: string[] = [];
  for (const line of header.slice(best.end)) {
    const names = namesInLine(line.text);
    if (names.length) { authorLines.push(line.text); authors.push(...names); }
    else if (authors.length && /[\p{L}\p{Script=Han}]/u.test(line.text)) break;
  }
  const arxiv = items.map(item => typeof (item as TextItem).str === "string" ? (item as TextItem).str : "").join(" ").match(/arxiv\s*:\s*(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  return { title: titleLines.map(line => line.text).join(" "), authors: [...new Set(authors)], titleEvidence: titleLines.map(line => line.text), authorEvidence: authorLines, arxivId: arxiv?.[1] };
}

export function applyPaperMetadata(book: ParsedBook, paper: PaperMetadata): void {
  book.paperMetadata = paper;
  const title = normalized(book.rawTitle), candidate = normalized(paper.title);
  if (!title || /^(?:untitled|unknown|document|microsoft word)/.test(title) || (candidate.startsWith(title) && candidate.length > title.length)) book.rawTitle = paper.title;
  else if (title !== candidate) book.warnings = [...(book.warnings ?? []), "首页标题与内置标题不同，保留内置标题；可在详情中核对首页识别结果。"];
  const existing = book.authors.filter(author => !/^(?:unknown|anonymous|作者待确认)$/i.test(author.trim()))
    .flatMap(author => { const names = namesInLine(author); return names.length ? names : [author]; });
  if (!existing.length || existing.every(author => paper.authors.some(name => normalized(name) === normalized(author)))) {
    if (paper.authors.length) book.authors = paper.authors;
  } else if (paper.authors.length && normalized(existing.join(" ")) !== normalized(paper.authors.join(" "))) {
    book.warnings = [...(book.warnings ?? []), "首页作者与内置作者不同，保留内置作者；可在详情中核对首页识别结果。"];
  }
  if (!paper.authors.length) book.warnings = [...(book.warnings ?? []), "已识别论文首页标题，但未可靠提取作者，请人工校对。"];
  if (paper.arxivId) book.identifiers = [...new Set([...book.identifiers, "arXiv:" + paper.arxivId])];
}

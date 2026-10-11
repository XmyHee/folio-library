export type MarkdownSettings = {
  theme: "reading" | "compact"; pageSize: "A4" | "A5" | "LETTER";
  orientation: "portrait" | "landscape"; header: string; footer: string;
  pageNumbers: boolean; css: string;
};
export const defaultMarkdownSettings: MarkdownSettings = {
  theme: "reading", pageSize: "A4", orientation: "portrait", header: "",
  footer: "{page} / {pages}", pageNumbers: true, css: "",
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function markdownSettings(value: unknown): MarkdownSettings {
  const input = object(value);
  return {
    theme: input.theme === "compact" ? "compact" : "reading",
    pageSize: input.pageSize === "A5" || input.pageSize === "LETTER" ? input.pageSize : "A4",
    orientation: input.orientation === "landscape" ? "landscape" : "portrait",
    header: typeof input.header === "string" ? input.header.slice(0, 500) : defaultMarkdownSettings.header,
    footer: typeof input.footer === "string" ? input.footer.slice(0, 500) : defaultMarkdownSettings.footer,
    pageNumbers: typeof input.pageNumbers === "boolean" ? input.pageNumbers : true,
    css: typeof input.css === "string" ? input.css.slice(0, 20000) : "",
  };
}

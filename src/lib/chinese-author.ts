/** Display-only conventions. Al Sweigart spelling/nationality follows the user's supplied example. */
const COUNTRIES: Record<string, string> = {
  美国: "美", 英国: "英", 法国: "法", 德国: "德", 日本: "日", 加拿大: "加",
  澳大利亚: "澳", 俄罗斯: "俄", 意大利: "意", 印度: "印", 韩国: "韩", 中国: "中",
};
function clean(raw: string): { country: string; name: string } {
  let name = raw.trim();
  let country = "";
  const prefix = name.match(/^[\[［【(（]([^\]］】)）]+)[\]］】)）]\s*/);
  if (prefix && (COUNTRIES[prefix[1]!] || /^[美英法德日加澳俄意印韩中]$/.test(prefix[1]!))) {
    country = COUNTRIES[prefix[1]!] ?? prefix[1]!;
    name = name.slice(prefix[0].length);
  }
  name = name.replace(/\s*(?:著|编著|编写|编)\s*$/, "").trim();
  if (/[\u3400-\u9fff]/.test(name)) {
    name = name.replace(/[（(]\s*[A-Za-z][A-Za-z\s.,'’\-]*\s*[）)]/g, "").trim();
  }
  return { country, name };
}

export function chineseAuthorNames(authors: string[], originalName: string): string[] {
  const filenameAuthor = originalName.replace(/\.(epub|pdf)$/i, "").split(" - ").slice(1).join(" - ");
  const hint = clean(filenameAuthor);
  return authors.map((raw) => {
    let {country, name} = clean(raw);
    if (!country && hint.country && hint.name === name) country = hint.country;
    if (/^(?:阿尔[·・]?斯维加特|Al\s+Sweigart)$/i.test(name)) {
      name = "阿尔·斯维加特";
      country ||= "美";
    }
    return country ? `[${country}] ${name}` : name;
  });
}

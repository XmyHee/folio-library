import type { DerivedBook } from "../lib/types";

export const ROLE_LABEL: Record<DerivedBook["role"], { text: string; cls: string }> = {
  unique: { text: "未见重复", cls: "badge-accent" },
  keep: { text: "保留", cls: "badge-keep" },
  duplicate: { text: "重复候选", cls: "badge-drop" },
  identical: { text: "内容相同", cls: "badge-drop" },
};

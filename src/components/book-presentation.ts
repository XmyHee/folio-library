import type { DerivedBook } from "../lib/types";

export const ROLE_LABEL: Record<DerivedBook["role"], { text: string; cls: string }> = {
  unique: { text: "唯一", cls: "badge-accent" },
  keep: { text: "保留", cls: "badge-keep" },
  duplicate: { text: "重复", cls: "badge-drop" },
  identical: { text: "相同", cls: "badge-drop" },
};

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";
const storageKey = "folio.theme";

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem(storageKey) === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(storageKey, theme); } catch { /* Theme still works without storage. */ }
  }, [theme]);
  const label = theme === "dark" ? "切换为明亮主题" : "切换为深空灰主题";
  const Icon = theme === "dark" ? Sun : Moon;
  return <button
    type="button"
    className="btn btn-secondary theme-switch"
    aria-label={label}
    title={label}
    onClick={() => setTheme(current => current === "dark" ? "light" : "dark")}
  >
    <Icon size={20} aria-hidden="true" focusable="false" />
  </button>;
}

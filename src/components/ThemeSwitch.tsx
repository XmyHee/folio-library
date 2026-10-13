import { useEffect, useState } from "react";

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
  return <div className="seg theme-switch" role="group" aria-label="页面主题">
    <button type="button" className={theme === "dark" ? "active" : ""} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>深空灰</button>
    <button type="button" className={theme === "light" ? "active" : ""} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>明亮</button>
  </div>;
}

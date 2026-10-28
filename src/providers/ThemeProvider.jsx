import { useEffect, useState } from "react";
import { ThemeContext } from "../context";

const KEY = "agrofund.theme";
export default function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem(KEY) ? localStorage.getItem(KEY) === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
  });
  // The class goes on <html> so portaled UI (dialogs, toasts, selects) is themed too.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try { localStorage.setItem(KEY, darkMode ? "dark" : "light"); } catch { /* storage unavailable */ }
  }, [darkMode]);
  return <ThemeContext.Provider value={{ darkMode, setDarkMode }}>{children}</ThemeContext.Provider>;
}

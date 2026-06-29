"use client";

import { useEffect, useState } from "react";

/**
 * Read the active colour theme from the document root, decoupled from any one app's
 * ThemeProvider so the shared field components work in apps/field and apps/admin
 * alike. Apps toggle dark mode by adding `.dark` to <html> (the convention across
 * the uprise Next apps); we observe that class and re-render on change.
 */
export function useTheme(): { theme: "light" | "dark" } {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return { theme: dark ? "dark" : "light" };
}

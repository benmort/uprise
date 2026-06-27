"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

/**
 * Theme system (prog parity). Cookie-persisted light/dark, toggled by adding/removing
 * `.dark` on <html> — the @uprise/ui token layer re-skins off that class. The no-flash
 * script in the root layout applies the class before paint; this provider keeps React
 * state in sync and writes the cookie on change.
 */
type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const COOKIE = "theme";

function readThemeCookie(): Theme | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)theme=([^;]+)/);
  return match && (match[1] === "light" || match[1] === "dark") ? match[1] : null;
}

function writeThemeCookie(theme: Theme) {
  // Parent-domain so it can be shared across the *.uprise apps when SESSION_COOKIE_DOMAIN
  // is set; falls back to host-only on localhost.
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
  const domainPart = domain ? `; domain=${domain}` : "";
  document.cookie = `${COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${domainPart}`;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  // Sync state from the class the no-flash script already applied (avoids a flash).
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(readThemeCookie() ?? (isDark ? "dark" : "light"));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeThemeCookie(theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme, ready]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/** Inline script string for the root layout — sets `.dark` before paint to avoid a flash. */
export const NO_FLASH_THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);if(m&&m[1]==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

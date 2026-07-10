"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Client glue for an embedded insights view (iframed by the action app): syncs the
 * theme from `?theme=` so the charts/map match the host, and reports content height to
 * the parent frame (`postMessage`) so the host iframe can auto-size. Renders nothing.
 */
export function EmbedChrome() {
  const theme = useSearchParams().get("theme");

  useEffect(() => {
    if (theme === "dark" || theme === "light") {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  useEffect(() => {
    const post = () =>
      window.parent?.postMessage(
        { type: "uprise:insights-height", height: Math.ceil(document.documentElement.scrollHeight) },
        "*",
      );
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    window.addEventListener("load", post);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", post);
    };
  }, []);

  return null;
}

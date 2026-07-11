"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Client glue for an embedded insights view (iframed by the action app): syncs the
 * theme from `?theme=` so the charts/map match the host, reports content height to the
 * parent frame (`postMessage`) so the host iframe can auto-size, and signals the host to
 * scroll the frame back to its top on an in-iframe navigation (overview↔question) so the
 * reader lands on the new content, not the whitespace under a now-shorter page. Renders nothing.
 */
export function EmbedChrome() {
  const theme = useSearchParams().get("theme");
  const pathname = usePathname();

  useEffect(() => {
    if (theme === "dark" || theme === "light") {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  // On an in-iframe route change, ask the host to scroll the frame to the top. Skipped on the
  // first render — the initial load must not yank the host page's scroll position.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.parent?.postMessage({ type: "uprise:insights-navigated" }, "*");
  }, [pathname]);

  useEffect(() => {
    // Full document height (the largest of the two roots), so the host iframe is sized to the
    // WHOLE content and never shows its own scrollbar (the double-scroll the host page suffered).
    const measure = () =>
      Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    let last = 0;
    let raf = 0;
    const post = () => {
      const height = measure();
      if (height === last) return;
      last = height;
      window.parent?.postMessage({ type: "uprise:insights-height", height }, "*");
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(post);
    };
    schedule();
    // documentElement catches every layout change; body alone missed fixed-height children.
    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    window.addEventListener("load", post);
    window.addEventListener("resize", schedule);
    // Charts (ApexCharts), the choropleth (mapbox) and images settle asynchronously after the
    // first paint — re-measure across a short window so the frame grows to fit them.
    const timers = [150, 400, 800, 1500, 2500].map((ms) => window.setTimeout(post, ms));
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("load", post);
      window.removeEventListener("resize", schedule);
      timers.forEach(clearTimeout);
    };
    // Keyed on pathname: a route change is a new document height and a fresh set of async
    // charts to wait for, and `last` must reset so an identical height still re-posts.
  }, [pathname]);

  return null;
}

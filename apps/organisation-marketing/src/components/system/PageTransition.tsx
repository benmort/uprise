"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The design's orange page-wipe — on a fresh load AND on every route change. It sits
 * inside the chromed layout, so the header + cream background are already on screen; a
 * full-screen vermilion block then slides up, holds, and exits (wipeIn, .78s) with a
 * mono "UPRISE LABS" label, and the page content is only revealed once the block has
 * fully covered the viewport (~44% into the wipe).
 *
 * The content is always rendered (so it stays in the SSR'd HTML for SEO). On first load
 * it's held invisible behind the wipe with a delayed pageIn — so only the header + cream
 * show, then the block sweeps, then the page fades in as the block exits. On navigation
 * the OUTGOING page is held in place until the block covers, then swapped for the
 * incoming one. Either way the swap + scroll-reset happen behind the full cover and are
 * never seen.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [wiping, setWiping] = useState(false);
  const first = useRef(true);
  const latest = useRef(children);
  latest.current = children;
  const [shown, setShown] = useState<{ node: React.ReactNode; key: string; anim: string }>({
    node: children,
    key: pathname,
    // First load: hold the (SSR'd) content invisible until the block covers (~.35s).
    anim: "pageIn .5s ease .35s both",
  });

  useEffect(() => {
    const wasFirst = first.current;
    first.current = false;
    setWiping(true);
    const swap = setTimeout(() => {
      // Navigation: swap the held outgoing page for the incoming one behind the cover.
      // First load already shows the right page (just hidden), so only reset scroll.
      if (!wasFirst) {
        setShown({ node: latest.current, key: pathname, anim: "pageIn .5s ease both" });
      }
      window.scrollTo(0, 0);
    }, 350);
    const end = setTimeout(() => setWiping(false), 790);
    return () => {
      clearTimeout(swap);
      clearTimeout(end);
    };
  }, [pathname]);

  return (
    <>
      {wiping ? (
        <div
          aria-hidden
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-vermilion"
          style={{ animation: "wipeIn .78s cubic-bezier(.76,0,.24,1) both" }}
        >
          <span className="font-mono text-xs tracking-[0.3em] text-cream">UPRISE LABS</span>
        </div>
      ) : null}
      <div key={shown.key} style={{ animation: shown.anim }}>
        {shown.node}
      </div>
    </>
  );
}

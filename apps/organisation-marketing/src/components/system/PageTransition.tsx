"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The design's orange page-wipe: on every route change a full-screen vermilion
 * overlay slides up, holds, and exits top (wipeIn, .78s) with a mono "UPRISE LABS"
 * label, while the incoming page fades/rises in (pageIn). Scroll resets to top.
 * The first render (fresh load) skips the wipe and just plays pageIn.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [wiping, setWiping] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setWiping(true);
    window.scrollTo(0, 0);
    const t = setTimeout(() => setWiping(false), 790);
    return () => clearTimeout(t);
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
      {/* On a wipe, keep the incoming page hidden (opacity 0 via `both`) until the
          orange block has fully covered the viewport (~.34s into wipeIn's .78s), so
          the content swap + scroll reset happen behind the cover and are never seen.
          The block then exits upward, revealing the settled new page. First load has
          no wipe, so it plays in immediately. */}
      <div
        key={pathname}
        style={{ animation: `pageIn .5s ease ${first.current ? "0s" : "0.36s"} both` }}
      >
        {children}
      </div>
    </>
  );
}

"use client";

// The getting-started deep-link treatment, shared by every step's destination page:
// `?origin=getting-started` renders a back link to the checklist, and a `#hash` scrolls
// to + briefly pulses the matching card (the 2FA card's behaviour, generalised). Give the
// target element the hash's id plus `scroll-mt-24` so it clears the sticky topbar.

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** "← Back to Getting started", shown only when the visit came from the checklist. */
export function OriginBackLink() {
  const searchParams = useSearchParams();
  if (searchParams.get("origin") !== "getting-started") return null;
  return (
    <Link
      href="/getting-started"
      className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Getting started
    </Link>
  );
}

/**
 * Scroll to + pulse the element named by the URL hash once the page's content is mounted.
 * Pass `ready=false` while the page is still loading its cards; the effect re-runs when it
 * flips true so the anchor exists before we look for it.
 */
export function useDeepLinkPulse(ready = true) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    // A frame's delay so layout has settled, then a quick smooth scroll + the primary pulse.
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("animate-pulse-ring");
    });
    const done = setTimeout(() => el.classList.remove("animate-pulse-ring"), 2200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [ready]);
}

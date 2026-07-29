"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Routes that render their own full-screen layout, so the global marketing chrome
// is suppressed: the developers hub (its own sidebar + header), /homepage2 (the
// cinema homepage candidate, which brings a condensing glass header and dark footer)
// and /homepage3 (the editorial candidate, with a sticky glass header and light footer).
const BARE_PREFIXES = ["/developers", "/homepage2", "/homepage3"];

// Routes whose last section already ends with generous padding of its own, so the footer's
// exterior top margin reads as a gap rather than breathing room. "/" closes with the cinema
// panel ("Ready to organise?"), which carries 130px of bottom padding — see
// components/home/Closing.tsx and the `.home-finale` rule.
//
// EXACT paths, for the same reason as the glass list above.
const FLUSH_FOOTER_PATHS = ["/"];

export default function MarketingChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_PREFIXES.some((p) => pathname?.startsWith(p));

  if (bare) {
    return <>{children}</>;
  }

  return (
    <>
      {/* One header treatment on every route — the homepage's condensing glass pill. It used to
          take a `glass` flag so only "/" wore it, but a nav that moves and re-skins depending on
          the page reads as two different sites. */}
      <Header />
      <div className="flex-1">{children}</div>
      <Footer spaced={!FLUSH_FOOTER_PATHS.includes(pathname ?? "")} />
    </>
  );
}

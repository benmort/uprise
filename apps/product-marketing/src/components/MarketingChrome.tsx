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

// The homepage keeps the global chrome — same Header (same nav links), same Footer — but wears the
// condensing glass treatment from /homepage2 so the transparent bar sits over its full-bleed
// cinema opening. Moved here from /homepage4 when that candidate became the live homepage.
//
// EXACT paths, not prefixes: "/" as a prefix matches every route, which would glass the whole site.
const GLASS_HEADER_PATHS = ["/"];

// Routes whose last section already ends with generous padding of its own, so the footer's
// exterior top margin reads as a gap rather than breathing room. "/" closes with the cinema
// panel ("Ready to organise?"), which carries 130px of bottom padding — see
// components/homepage4/Closing.tsx and the `.hp4-finale` rule.
//
// EXACT paths, for the same reason as the glass list above.
const FLUSH_FOOTER_PATHS = ["/"];

export default function MarketingChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_PREFIXES.some((p) => pathname?.startsWith(p));

  if (bare) {
    return <>{children}</>;
  }

  const glass = GLASS_HEADER_PATHS.includes(pathname ?? "");

  return (
    <>
      <Header glass={glass} />
      <div className="flex-1">{children}</div>
      <Footer spaced={!FLUSH_FOOTER_PATHS.includes(pathname ?? "")} />
    </>
  );
}

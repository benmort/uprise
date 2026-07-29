import React from "react";
import Link from "next/link";
import { Button } from "@uprise/ui";
import { authAppUrl } from "@/lib/links";
import MarketingLaunchpad from "../MarketingLaunchpad";
import RevealScope from "./RevealScope";
import { cssVars } from "./parts";
import { SECTION } from "./content";
import { CLOSING } from "./sections";

/**
 * The close. Same aurora as the hero — the page ends where it opened — and no screenshot: by here a
 * visitor has seen the product five ways, and one more picture only competes with the ask.
 */
export default function Closing() {
  return (
    <RevealScope id={SECTION.getStarted} className="home-finale">
      <div className="home-plane home-aurora" aria-hidden>
        <b />
        <b />
        <b />
      </div>
      <div className="home-shell">
        <span className="home-mono home-eyebrow home-rise">{CLOSING.eyebrow}</span>
        <h2 className="home-display home-rise" style={cssVars({ "--d": "80ms" })}>
          {CLOSING.title}
        </h2>
        <p className="home-lede home-rise" style={cssVars({ "--d": "160ms" })}>
          {CLOSING.lede}
        </p>
        <div className="home-rise" style={cssVars({ "--d": "240ms" })}>
          <MarketingLaunchpad tone="light">
            <div className="home-cta">
              <Button asChild variant="cta" size="pill">
                <a href={`${authAppUrl()}/sign-up`}>Start a Campaign</a>
              </Button>
              <Button asChild variant="ctaOutline" size="pill">
                <Link href="/request-demo">Request a Demo</Link>
              </Button>
            </div>
          </MarketingLaunchpad>
        </div>
      </div>
    </RevealScope>
  );
}

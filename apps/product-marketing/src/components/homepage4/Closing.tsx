import React from "react";
import Link from "next/link";
import { Button } from "@uprise/ui";
import { authAppUrl } from "@/lib/links";
import MarketingLaunchpad from "../MarketingLaunchpad";
import RevealScope from "./RevealScope";
import { cssVars } from "./parts";
import { CLOSING } from "./sections";

/**
 * The close. Same aurora as the hero — the page ends where it opened — and no screenshot: by here a
 * visitor has seen the product five ways, and one more picture only competes with the ask.
 */
export default function Closing() {
  return (
    <RevealScope id="hp4-close" className="hp4-finale">
      <div className="hp4-plane hp4-aurora" aria-hidden>
        <b />
        <b />
        <b />
      </div>
      <div className="hp4-shell">
        <span className="hp4-mono hp4-eyebrow hp4-rise">{CLOSING.eyebrow}</span>
        <h2 className="hp4-display hp4-rise" style={cssVars({ "--d": "80ms" })}>
          {CLOSING.title}
        </h2>
        <p className="hp4-lede hp4-rise" style={cssVars({ "--d": "160ms" })}>
          {CLOSING.lede}
        </p>
        <div className="hp4-rise" style={cssVars({ "--d": "240ms" })}>
          <MarketingLaunchpad tone="light">
            <div className="hp4-cta">
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

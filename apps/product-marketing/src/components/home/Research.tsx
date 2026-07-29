import React from "react";
import Link from "next/link";
import RevealScope from "./RevealScope";
import { MockCard, cssVars } from "./parts";
import { RESEARCH } from "./sections";

/**
 * Research partnerships. The wave card is the section's evidence, so it states its own provenance —
 * the feed it came from, when it synced, the sample size and the margin of error — rather than
 * showing bars with no basis.
 */
export default function Research() {
  return (
    <RevealScope className="home-split">
      <div className="home-shell home-sgrid3">
        <div className="home-rise">
          <span className="home-mono home-eyebrow">{RESEARCH.eyebrow}</span>
          <h2 className="home-h2" style={{ marginTop: 18 }}>
            {RESEARCH.title}
          </h2>
          <p className="home-lede" style={{ marginTop: 20 }}>
            {RESEARCH.body}
          </p>

          <div className="home-points">
            {RESEARCH.points.map((pt) => (
              <div key={pt.lead}>
                <i aria-hidden />
                <p>
                  <b>{pt.lead}</b> {pt.body}
                </p>
              </div>
            ))}
          </div>

          <Link className="home-btn home-btn--ghost" href="/contact-us">
            {RESEARCH.cta}
          </Link>
        </div>

        <div className="home-rise home-wave" style={cssVars({ "--d": "120ms" })}>
          <MockCard
            label={RESEARCH.wave.label}
            meta={
              <span className="home-synced">
                <i aria-hidden />
                {RESEARCH.wave.synced}
              </span>
            }
          >
            <div className="home-wavehead">
              <b>{RESEARCH.wave.title}</b>
              <span className="home-mono">{RESEARCH.wave.meta}</span>
            </div>
            <div className="home-waverows">
              {RESEARCH.wave.rows.map((r) => (
                <div key={r.label}>
                  <div className="lbl">
                    <span>{r.label}</span>
                    <span className="pct">{r.pct}%</span>
                  </div>
                  <div className="home-track">
                    <i className={`is-${r.tone}`} style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="home-chiprow">
              {RESEARCH.wave.chips.map((c) => (
                <span className="home-chip" key={c}>
                  {c}
                </span>
              ))}
            </div>
          </MockCard>

          <div className="home-facts3">
            {RESEARCH.facts.map((f) => (
              <div key={f.value}>
                <b>{f.value}</b>
                <span>{f.caption}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </RevealScope>
  );
}

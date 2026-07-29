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
    <RevealScope className="hp4-split">
      <div className="hp4-shell hp4-sgrid3">
        <div className="hp4-rise">
          <span className="hp4-mono hp4-eyebrow">{RESEARCH.eyebrow}</span>
          <h2 className="hp4-h2" style={{ marginTop: 18 }}>
            {RESEARCH.title}
          </h2>
          <p className="hp4-lede" style={{ marginTop: 20 }}>
            {RESEARCH.body}
          </p>

          <div className="hp4-points">
            {RESEARCH.points.map((pt) => (
              <div key={pt.lead}>
                <i aria-hidden />
                <p>
                  <b>{pt.lead}</b> {pt.body}
                </p>
              </div>
            ))}
          </div>

          <Link className="hp4-btn hp4-btn--ghost" href="/contact-us">
            {RESEARCH.cta}
          </Link>
        </div>

        <div className="hp4-rise hp4-wave" style={cssVars({ "--d": "120ms" })}>
          <MockCard
            label={RESEARCH.wave.label}
            meta={
              <span className="hp4-synced">
                <i aria-hidden />
                {RESEARCH.wave.synced}
              </span>
            }
          >
            <div className="hp4-wavehead">
              <b>{RESEARCH.wave.title}</b>
              <span className="hp4-mono">{RESEARCH.wave.meta}</span>
            </div>
            <div className="hp4-waverows">
              {RESEARCH.wave.rows.map((r) => (
                <div key={r.label}>
                  <div className="lbl">
                    <span>{r.label}</span>
                    <span className="pct">{r.pct}%</span>
                  </div>
                  <div className="hp4-track">
                    <i className={`is-${r.tone}`} style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="hp4-chiprow">
              {RESEARCH.wave.chips.map((c) => (
                <span className="hp4-chip" key={c}>
                  {c}
                </span>
              ))}
            </div>
          </MockCard>

          <div className="hp4-facts3">
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

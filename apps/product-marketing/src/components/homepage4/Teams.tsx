import React from "react";
import RevealScope from "./RevealScope";
import { MockCard, cssVars } from "./parts";
import { SECTION } from "./content";
import { TEAMS } from "./sections";

/**
 * Teams & white-label. The mock carries the argument the prose can't: two organisers with different
 * roles and a join request waiting on approval, sitting under someone else's subdomain.
 */
export default function Teams() {
  return (
    <RevealScope id={SECTION.teams} className="hp4-split">
      <div className="hp4-shell hp4-sgrid2">
        <div className="hp4-rise">
          <span className="hp4-mono hp4-eyebrow">{TEAMS.eyebrow}</span>
          <h2 className="hp4-h2" style={{ marginTop: 18 }}>
            {TEAMS.title}
          </h2>
          {TEAMS.body.map((para) => (
            <p className="hp4-lede" key={para} style={{ marginTop: 18 }}>
              {para}
            </p>
          ))}
        </div>

        <div className="hp4-rise" style={cssVars({ "--d": "120ms" })}>
          <MockCard label={TEAMS.mock.label} meta={TEAMS.mock.meta}>
            <div className="hp4-rows">
              {TEAMS.mock.members.map((m) => (
                <div className="hp4-row" key={m.name}>
                  <div>
                    <b>{m.name}</b>
                    <span>{m.role}</span>
                  </div>
                  <span className={`hp4-badge${m.tone === "accent" ? " is-accent" : ""}`}>
                    {m.badge}
                  </span>
                </div>
              ))}
              <div className="hp4-row hp4-row--pending">
                <div>
                  <b>{TEAMS.mock.pending.email}</b>
                  <span>{TEAMS.mock.pending.note}</span>
                </div>
                <span className="hp4-badge is-solid">{TEAMS.mock.pending.action}</span>
              </div>
            </div>
            <div className="hp4-chiprow">
              {TEAMS.mock.chips.map((c) => (
                <span className="hp4-chip" key={c}>
                  {c}
                </span>
              ))}
            </div>
          </MockCard>
        </div>
      </div>
    </RevealScope>
  );
}

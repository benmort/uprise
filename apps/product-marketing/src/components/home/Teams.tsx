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
    <RevealScope id={SECTION.teams} className="home-split">
      <div className="home-shell home-sgrid2">
        <div className="home-rise">
          <span className="home-mono home-eyebrow">{TEAMS.eyebrow}</span>
          <h2 className="home-h2" style={{ marginTop: 18 }}>
            {TEAMS.title}
          </h2>
          {TEAMS.body.map((para) => (
            <p className="home-lede" key={para} style={{ marginTop: 18 }}>
              {para}
            </p>
          ))}
        </div>

        <div className="home-rise" style={cssVars({ "--d": "120ms" })}>
          <MockCard label={TEAMS.mock.label} meta={TEAMS.mock.meta}>
            <div className="home-rows">
              {TEAMS.mock.members.map((m) => (
                <div className="home-row" key={m.name}>
                  <div>
                    <b>{m.name}</b>
                    <span>{m.role}</span>
                  </div>
                  <span className={`home-badge${m.tone === "accent" ? " is-accent" : ""}`}>
                    {m.badge}
                  </span>
                </div>
              ))}
              <div className="home-row home-row--pending">
                <div>
                  <b>{TEAMS.mock.pending.email}</b>
                  <span>{TEAMS.mock.pending.note}</span>
                </div>
                <span className="home-badge is-solid">{TEAMS.mock.pending.action}</span>
              </div>
            </div>
            <div className="home-chiprow">
              {TEAMS.mock.chips.map((c) => (
                <span className="home-chip" key={c}>
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

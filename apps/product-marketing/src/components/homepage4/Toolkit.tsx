import React from "react";
import RevealScope from "./RevealScope";
import { SectionHead, cssVars } from "./parts";
import { SECTION } from "./content";
import {
  CANVASS_TILE,
  DISPOSITION_TILE,
  FEATURE_CARDS,
  INBOX_TILE,
  SMALL_TILES,
  TOOLKIT,
} from "./sections";

/** The door pins on the minimap, in walking order. Staggered so the route draws itself. */
const DOORS: Array<[number, number]> = [
  [120, 62],
  [158, 52],
  [196, 60],
  [232, 76],
  [252, 112],
  [228, 146],
  [188, 162],
  [146, 156],
  [112, 124],
  [104, 90],
];

/**
 * The toolkit: six bento tiles that SHOW three of the systems working (turf drawn on a minimap, a
 * claimed SMS thread, the five-point support meter), then the rest of the platform as numbered
 * cards.
 *
 * The cards deliberately don't repeat what a tile already states — see FEATURE_CARDS in
 * sections.ts. A feature grid that lists "P2P texting" under a tile demonstrating P2P texting reads
 * as padding.
 */
export default function Toolkit() {
  return (
    <RevealScope id={SECTION.toolkit} className="hp4-const">
      <div className="hp4-shell">
        <SectionHead eyebrow={TOOLKIT.eyebrow} title={TOOLKIT.title} lede={TOOLKIT.lede} />

        <div className="hp4-bento">
          {/* Canvassing — the turf outline draws, then the doors land in route order. */}
          <article className="hp4-tile hp4-t7 hp4-ttall hp4-rise">
            <div>
              <span className="hp4-mono hp4-eyebrow">{CANVASS_TILE.eyebrow}</span>
              <h3 className="hp4-h3">{CANVASS_TILE.title}</h3>
              <p>{CANVASS_TILE.body}</p>
            </div>
            <div className="hp4-minimap">
              <svg viewBox="0 0 420 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <g className="roads">
                  <path d="M0 46 H420 M0 104 H420 M0 162 H420" />
                  <path d="M74 0 V230 M158 0 V230 M242 0 V230 M326 0 V230" />
                </g>
                <polygon className="turf" points="96,34 258,26 300,96 254,182 122,190 74,118" />
                <g>
                  {DOORS.map(([cx, cy], i) => (
                    <circle
                      className="door"
                      key={`${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={3.4}
                      style={cssVars({ "--d": `${1500 + i * 80}ms` })}
                    />
                  ))}
                </g>
              </svg>
              <span className="hp4-mono hp4-mapbadge">{CANVASS_TILE.badge}</span>
            </div>
          </article>

          {/* The inbox — a real exchange, claimed, so "shared queue" is shown not asserted. */}
          <article className="hp4-tile hp4-t5 hp4-rise" style={cssVars({ "--d": "80ms" })}>
            <span className="hp4-mono hp4-eyebrow">{INBOX_TILE.eyebrow}</span>
            <h3 className="hp4-h3">{INBOX_TILE.title}</h3>
            <p>{INBOX_TILE.body}</p>
            <div className="hp4-thread">
              {INBOX_TILE.thread.map((m) => (
                <div
                  key={m.text}
                  className={`hp4-msg hp4-msg--${m.dir}`}
                  style={cssVars({ "--d": `${m.d}ms` })}
                >
                  <span className="hp4-mono who">{m.who}</span>
                  {m.text}
                </div>
              ))}
            </div>
          </article>

          <article className="hp4-tile hp4-t5 hp4-rise" style={cssVars({ "--d": "140ms" })}>
            <span className="hp4-mono hp4-eyebrow">{DISPOSITION_TILE.eyebrow}</span>
            <h3 className="hp4-h3">{DISPOSITION_TILE.title}</h3>
            <p>{DISPOSITION_TILE.body}</p>
            <div className="hp4-meter" style={{ marginTop: 16 }}>
              <s style={{ width: 64 }} />
              <s style={{ width: 48 }} />
              <s style={{ width: 34 }} />
              <s style={{ width: 26 }} />
              <s style={{ width: 20 }} />
            </div>
          </article>

          {SMALL_TILES.map((t, i) => (
            <article
              className="hp4-tile hp4-t4 hp4-rise"
              key={t.title}
              style={cssVars({ "--d": `${i * 70}ms` })}
            >
              <span className="hp4-mono hp4-eyebrow">{t.eyebrow}</span>
              <h3 className="hp4-h3">{t.title}</h3>
              <p>{t.body}</p>
            </article>
          ))}
        </div>

        <div className="hp4-subhead hp4-rise">
          <span className="hp4-mono">{TOOLKIT.alsoLabel}</span>
          <i />
        </div>

        <div className="hp4-cards">
          {FEATURE_CARDS.map((c, i) => (
            <article
              className="hp4-card hp4-rise"
              key={c.title}
              style={cssVars({ "--d": `${(i % 4) * 60}ms` })}
            >
              <span className="hp4-mono no">{String(i + 1).padStart(2, "0")}</span>
              <h4>{c.title}</h4>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </div>
    </RevealScope>
  );
}

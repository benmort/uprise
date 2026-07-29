import React from "react";
import { PhoneOff } from "lucide-react";
import RevealScope from "./RevealScope";
import { SectionHead, cssVars } from "./parts";
import { SECTION } from "./content";
import {
  BLAST_TILE,
  CANVASS_TILE,
  DISPOSITION_TILE,
  FEATURE_CARDS,
  INBOX_TILE,
  OUTREACH_TILE,
  SHIFTS_TILE,
  TOOLKIT,
  WHITELABEL_TILE,
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
 * One send batch, as a board: one cell per recipient in the real BlastRecipientStatus vocabulary.
 * Geometry, not copy — so it lives here beside DOORS rather than in sections.ts.
 *
 * Deterministic, using the same hash as the Atlas grid in DataArc, so a server render and a client
 * render agree. Coarse on purpose, like AU_GRID: the cell count is a SHAPE (144) and the batch is
 * 475 — do not try to make them equal.
 */
const CELL: Record<string, string> = {
  q: "var(--home-brand-100)", // QUEUED
  s: "var(--home-brand-300)", // SENT — receipt not back yet
  d: "var(--home-brand)", // DELIVERED
  r: "var(--home-sup-1)", // RESPONDED
  x: "var(--home-seq-1)", // SKIPPED — opted out, checked before every send
  f: "var(--home-sup-5)", // FAILED
  ".": "#e8ebf3", // PENDING — the .home-bar track colour, reused
};

function cellCode(x: number, y: number, cols: number, rows: number): string {
  const n = cols * rows;
  // Recipients resolve in the order the batch dispatches them (row-major), with a couple of cells
  // of ragged edge so the frontier reads as a real send rather than a ruled line.
  const i = y * cols + x + ((x * 7) % 5) - 2;
  if (i > n * 0.88) return ".";
  if (i > n * 0.82) return "q";
  if (i > n * 0.74) return "s";
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  if (h % 19 === 0) return "r";
  if (h % 53 === 0) return "x";
  if (h % 97 === 0) return "f"; // a delivery board with zero failures would be the lie
  return "d";
}

/**
 * The toolkit: seven bento tiles, five of which SHOW a system working (turf drawn on a minimap, a
 * claimed SMS thread, the five-point support meter, the blast composer with its live compliance
 * check, and a send resolving across a recipient board), then the rest of the platform as numbered
 * cards.
 *
 * The cards deliberately don't repeat what a tile already states — see FEATURE_CARDS in
 * sections.ts. A feature grid that lists "P2P texting" under a tile demonstrating P2P texting reads
 * as padding.
 */
export default function Toolkit() {
  return (
    <RevealScope id={SECTION.toolkit} className="home-const">
      <div className="home-shell">
        <SectionHead eyebrow={TOOLKIT.eyebrow} title={TOOLKIT.title} lede={TOOLKIT.lede} />

        <div className="home-bento">
          {/* White-label — three portals on their own slugs, the theme resolving from stock to the
              campaign's own, and the phone a volunteer actually meets. */}
          <article className="home-tile home-t5 home-rise">
            <span className="home-mono home-eyebrow">{WHITELABEL_TILE.eyebrow}</span>
            <h3 className="home-h3">{WHITELABEL_TILE.title}</h3>
            <p>{WHITELABEL_TILE.body}</p>

            <div className="home-portals">
              <div>
                {WHITELABEL_TILE.portals.map((p) => (
                  <div className="home-portal" key={p.slug} style={cssVars({ "--d": `${p.d}ms` })}>
                    <span className="mark" style={cssVars({ "--c": p.c })}>
                      {p.initials}
                    </span>
                    <span className="who">
                      <b>{p.name}</b>
                      <span className="home-mono slug">{p.slug}</span>
                    </span>
                  </div>
                ))}

                <div
                  className="home-portal home-portal--on"
                  style={cssVars({ "--d": `${WHITELABEL_TILE.active.d}ms` })}
                >
                  <span className="mark" style={cssVars({ "--c": "var(--home-brand)" })}>
                    {WHITELABEL_TILE.active.initials}
                  </span>
                  <span className="who">
                    <b>{WHITELABEL_TILE.active.name}</b>
                    <span className="home-mono slug">{WHITELABEL_TILE.active.slug}</span>
                  </span>
                  <span className="home-mono on">{WHITELABEL_TILE.active.badge}</span>
                </div>

                <div className="home-theme home-states">
                  <span className="stock" aria-hidden="true">
                    {WHITELABEL_TILE.theme.stock}
                  </span>
                  <span className="own" style={cssVars({ "--d": `${WHITELABEL_TILE.theme.d}ms` })}>
                    {WHITELABEL_TILE.theme.own}
                  </span>
                </div>

                <div className="home-tokens">
                  {WHITELABEL_TILE.tokens.map((t) => (
                    <span key={t.label} style={cssVars({ "--d": `${t.d}ms` })}>
                      <i style={cssVars({ "--c": t.c })} />
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Drawn, not captured: the point is the branding, and every real capture carries
                  Uprise's own. */}
              <div
                className="home-cmpdev"
                aria-hidden="true"
                style={cssVars({ "--d": `${WHITELABEL_TILE.phone.d}ms` })}
              >
                <div className="home-cmpscr home-brandscr">
                  <div style={cssVars({ "--d": `${WHITELABEL_TILE.phone.screenD}ms` })}>
                    <span className="row">
                      <s className="logo" />
                      <s className="name" />
                    </span>
                    <s className="line" style={{ width: "88%" }} />
                    <s className="line" style={{ width: "72%" }} />
                    <span className="cta">{WHITELABEL_TILE.phone.cta}</span>
                    <s className="line is-faint" style={{ width: "64%" }} />
                    <s className="line is-faint" style={{ width: "80%" }} />
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* Volunteers — the calendar volunteers read, then the join request resolves, then the
              action room: one broadcast out and the roster it went to. Sits second in a 5/7 row, so
              the bento opens narrow and widens rather than leading on its widest tile. */}
          <article className="home-tile home-t7 home-rise" style={cssVars({ "--d": "80ms" })}>
            <span className="home-mono home-eyebrow">{SHIFTS_TILE.eyebrow}</span>
            <h3 className="home-h3">{SHIFTS_TILE.title}</h3>
            <p>{SHIFTS_TILE.body}</p>

            <div className="home-shifts">
              <div className="home-day">
                <div className="home-dayhead">
                  <span className="home-mono">{SHIFTS_TILE.day}</span>
                  <span className="home-claimed">{SHIFTS_TILE.claimed}</span>
                </div>

                <div className="home-slots">
                  {SHIFTS_TILE.shifts.map((s) => (
                    <div className="home-slot" key={s.at} style={cssVars({ "--d": `${s.d}ms` })}>
                      <span className="at">{s.at}</span>
                      <span className="place">{s.place}</span>
                      <span className="home-faces">
                        {s.who.map((w, i) => (
                          <span className="home-face" key={w} style={cssVars({ "--i": i })}>
                            {w}
                          </span>
                        ))}
                      </span>
                      <span className={`fill${s.full ? " is-full" : ""}`} />
                    </div>
                  ))}

                  {/* The open seat: dashed, because it is the one thing on the calendar that is
                      not yet true. */}
                  <div
                    className="home-slot home-slot--open"
                    style={cssVars({ "--d": `${SHIFTS_TILE.open.d}ms` })}
                  >
                    <span className="at">{SHIFTS_TILE.open.at}</span>
                    <span className="place">{SHIFTS_TILE.open.need}</span>
                    <span className="home-claim">{SHIFTS_TILE.open.action}</span>
                    <span className="fill" />
                  </div>
                </div>

                <div className="home-bar home-bar--wide">
                  <i style={cssVars({ "--w": SHIFTS_TILE.fill, "--d": "460ms" })} />
                </div>

                {/* aria-hidden on the pending line, as on the composer's compliance warning:
                    without it a reader announces both states as one contradictory sentence. */}
                <div className="home-approve home-states">
                  <span className="pending" aria-hidden="true">
                    {SHIFTS_TILE.approval.pending}
                  </span>
                  <span className="ok" style={cssVars({ "--d": `${SHIFTS_TILE.approval.d}ms` })}>
                    {SHIFTS_TILE.approval.ok}
                  </span>
                </div>
              </div>

              <div>
                <div
                  className="home-abar"
                  style={cssVars({ "--d": `${SHIFTS_TILE.broadcast.d}ms` })}
                >
                  <span className="dot" aria-hidden="true" />
                  <span className="meta">
                    <b>{SHIFTS_TILE.broadcast.label}</b>
                    <span>{SHIFTS_TILE.broadcast.message}</span>
                  </span>
                  <span className="home-mono when">{SHIFTS_TILE.broadcast.when}</span>
                </div>

                <div className="home-roster">
                  {SHIFTS_TILE.roster.map((r) => (
                    <div className="home-clogrow" key={r.who} style={cssVars({ "--d": `${r.d}ms` })}>
                      <span className="num">{r.who}</span>
                      <span className={`st${r.ok ? " is-ok" : ""}`}>{r.status}</span>
                      <span className="dur">{r.at}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>

          {/* Canvassing — the turf outline draws, then the doors land in route order. */}
          <article className="home-tile home-t7 home-ttall home-rise">
            <div>
              <span className="home-mono home-eyebrow">{CANVASS_TILE.eyebrow}</span>
              <h3 className="home-h3">{CANVASS_TILE.title}</h3>
              <p>{CANVASS_TILE.body}</p>
            </div>
            <div className="home-minimap">
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
              <span className="home-mono home-mapbadge">{CANVASS_TILE.badge}</span>
            </div>
          </article>

          {/* The inbox — a real exchange, claimed, so "shared queue" is shown not asserted. */}
          <article className="home-tile home-t5 home-rise" style={cssVars({ "--d": "80ms" })}>
            <span className="home-mono home-eyebrow">{INBOX_TILE.eyebrow}</span>
            <h3 className="home-h3">{INBOX_TILE.title}</h3>
            <p>{INBOX_TILE.body}</p>
            <div className="home-thread">
              {INBOX_TILE.thread.map((m) => (
                <div
                  key={m.text}
                  className={`home-msg home-msg--${m.dir}`}
                  style={cssVars({ "--d": `${m.d}ms` })}
                >
                  <span className="home-mono who">{m.who}</span>
                  {m.text}
                </div>
              ))}
            </div>
          </article>

          <article className="home-tile home-t5 home-rise" style={cssVars({ "--d": "140ms" })}>
            <span className="home-mono home-eyebrow">{DISPOSITION_TILE.eyebrow}</span>
            <h3 className="home-h3">{DISPOSITION_TILE.title}</h3>
            <p>{DISPOSITION_TILE.body}</p>
            <div className="home-meter" style={{ marginTop: 16 }}>
              <s style={{ width: 64 }} />
              <s style={{ width: 48 }} />
              <s style={{ width: 34 }} />
              <s style={{ width: 26 }} />
              <s style={{ width: 20 }} />
            </div>
          </article>

          {/* Blasts — the lifecycle rail advances, then the recipient board arrives pending and a
              second wave of colour crosses it as each recipient's state resolves. */}
          <article className="home-tile home-t5 home-rise">
            <span className="home-mono home-eyebrow">{BLAST_TILE.eyebrow}</span>
            <h3 className="home-h3">{BLAST_TILE.title}</h3>
            <p>{BLAST_TILE.body}</p>

            <div className="home-blast">
              <div className="home-brail">
                <div className="home-bsteps">
                  {BLAST_TILE.rail.map((s) => (
                    <span
                      className={`home-bstep${s.on ? " is-on" : ""}`}
                      key={s.label}
                      style={cssVars({ "--d": `${s.d}ms` })}
                    >
                      {s.label}
                    </span>
                  ))}
                </div>
                <div className="home-bar">
                  <i style={cssVars({ "--w": BLAST_TILE.railFill.w, "--d": `${BLAST_TILE.railFill.d}ms` })} />
                </div>
              </div>

              <div
                className="home-bboard"
                role="img"
                aria-label="One send batch, each cell a recipient — most delivered, with a few replied, skipped and failed"
              >
                {Array.from({ length: BLAST_TILE.board.cols * BLAST_TILE.board.rows }, (_, n) => {
                  const x = n % BLAST_TILE.board.cols;
                  const y = Math.floor(n / BLAST_TILE.board.cols);
                  return (
                    <s
                      className="home-bcell"
                      key={n}
                      style={cssVars({
                        "--c": CELL[cellCode(x, y, BLAST_TILE.board.cols, BLAST_TILE.board.rows)],
                        "--d": `${BLAST_TILE.board.arriveD + x * 9 + y * 22}ms`,
                        "--d2": `${BLAST_TILE.board.resolveD + x * 11 + y * 26}ms`,
                      })}
                    />
                  );
                })}
              </div>

              <div className="home-bnote">
                <b data-to={BLAST_TILE.batch.to}>0</b> {BLAST_TILE.batch.note}
              </div>
              <div className="home-blegend" style={cssVars({ "--d": `${BLAST_TILE.legendD}ms` })}>
                {BLAST_TILE.legend.map((l) => (
                  <span key={l.label}>
                    <i style={cssVars({ "--c": `var(${l.c})` })} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
          </article>

          {/* Outreach — the composer writes itself and its compliance check clears, then the
              softphone bar arrives and walks its real states. Both surfaces are drawn: no capture
              of either exists. Every string is copied from the product — see OUTREACH_TILE. */}
          <article className="home-tile home-t7 home-rise" style={cssVars({ "--d": "70ms" })}>
            <span className="home-mono home-eyebrow">{OUTREACH_TILE.eyebrow}</span>
            <h3 className="home-h3">{OUTREACH_TILE.title}</h3>
            <p>{OUTREACH_TILE.body}</p>

            <div className="home-outreach">
              <div className="home-cmpgrid">
                <div className="home-cmp" style={cssVars({ "--d": "100ms" })}>
                  <div className="home-cmphead">
                    <span className="home-mono">{OUTREACH_TILE.composer.panel}</span>
                    <span className="home-mono home-cmpcount">
                      <b data-to={OUTREACH_TILE.composer.chars.to}>0</b> /{" "}
                      {OUTREACH_TILE.composer.chars.max} chars
                    </span>
                  </div>
                  <p className="home-cmpbody">
                    {OUTREACH_TILE.composer.runs.map((r) => (
                      <span className="seg" key={r.d} style={cssVars({ "--d": `${r.d}ms` })}>
                        {r.pre}
                        {r.tag ? <b className="tag">{r.tag}</b> : null}
                        {r.post}
                      </span>
                    ))}
                  </p>
                  <div className="home-cmptags">
                    {OUTREACH_TILE.composer.tags.map((t) => (
                      <span className="home-cmptag" key={t.text} style={cssVars({ "--d": `${t.d}ms` })}>
                        {t.text}
                      </span>
                    ))}
                  </div>
                  {/* aria-hidden on the warning: without it a reader announces both states as one
                      contradictory sentence. */}
                  <div className="home-cmpsub home-states">
                    <span className="warn" aria-hidden="true">
                      {OUTREACH_TILE.composer.compliance.warn}
                    </span>
                    <span
                      className="ok"
                      style={cssVars({ "--d": `${OUTREACH_TILE.composer.compliance.d}ms` })}
                    >
                      {OUTREACH_TILE.composer.compliance.ok}
                    </span>
                  </div>
                  <div className="home-cmpact">
                    {OUTREACH_TILE.composer.actions.map((a) => (
                      <span
                        className={`home-cmpbtn home-cmpbtn--${a.tone}`}
                        key={a.label}
                        style={cssVars({ "--d": `${a.d}ms` })}
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* A rendering of text already present above, so it is decorative to a reader. */}
                <div className="home-cmppre" aria-hidden="true">
                  <span className="home-cmpchan">
                    {OUTREACH_TILE.composer.preview.channels.map((c, i) => (
                      <s className={i === 0 ? "is-on" : undefined} key={c}>
                        {c}
                      </s>
                    ))}
                  </span>
                  <div
                    className="home-cmpdev"
                    style={cssVars({ "--d": `${OUTREACH_TILE.composer.preview.deviceD}ms` })}
                  >
                    <div className="home-cmpscr">
                      <div
                        className="home-cmpbub"
                        style={cssVars({ "--d": `${OUTREACH_TILE.composer.preview.bubbleD}ms` })}
                      >
                        {OUTREACH_TILE.composer.preview.rendered}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="home-cbar" style={cssVars({ "--d": `${OUTREACH_TILE.call.d}ms` })}>
                  <span className="home-cbav">
                    <span className="home-states" aria-hidden="true">
                      <svg className="home-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M21 12a9 9 0 1 1-6.2-8.6" />
                      </svg>
                      <svg
                        style={cssVars({ "--d": `${OUTREACH_TILE.call.states[2].d}ms` })}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
                      </svg>
                    </span>
                  </span>
                  <span className="home-cbmeta">
                    <b>{OUTREACH_TILE.call.who}</b>
                    <span className="home-cbsub">
                      <span className="home-cbstat home-states">
                        {OUTREACH_TILE.call.states.map((st, i) => (
                          <s
                            key={st.text}
                            aria-hidden={i < OUTREACH_TILE.call.states.length - 1 ? "true" : undefined}
                            style={cssVars({ "--d": `${st.d}ms` })}
                          >
                            {st.live ? <span className="live">{st.text}</span> : st.text}
                          </s>
                        ))}
                      </span>
                      {/* The bar appends the from-number to EVERY state, so it sits outside the
                          swap — and it is this tile's copy made literal. */}
                      <span>{OUTREACH_TILE.call.from}</span>
                    </span>
                  </span>
                  <span
                    className="home-cbbtn"
                    style={cssVars({ "--d": `${OUTREACH_TILE.call.muteD}ms` })}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <path d="M12 19v3" />
                    </svg>
                  </span>
                  {/* The real lucide `PhoneOff`, the same icon the product's call bar hangs up with
                      (apps/admin/src/components/softphone/call-bar.tsx:66). It was a hand-drawn
                      approximation, and the handset never closed: one path was a loose arc floating
                      inside the outline rather than the receiver's mouthpiece, so the glyph read as
                      a broken squiggle behind the strike-through. Nothing about a 14px icon is worth
                      approximating when the dependency is already here. */}
                  <span className="home-cbbtn home-cbbtn--end" aria-hidden="true">
                    <PhoneOff strokeWidth={2.2} />
                  </span>
                </div>
                <div className="home-clog">
                  {OUTREACH_TILE.call.log.map((row) => (
                    <div className="home-clogrow" key={row.num} style={cssVars({ "--d": `${row.d}ms` })}>
                      <span className="num">{row.num}</span>
                      <span className={`st${row.ok ? " is-ok" : ""}`}>{row.status}</span>
                      <span className="dur">{row.dur}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>

        </div>

        <div className="home-subhead home-rise">
          <span className="home-mono">{TOOLKIT.alsoLabel}</span>
          <i />
        </div>

        <div className="home-cards">
          {FEATURE_CARDS.map((c, i) => (
            <article
              className="home-card home-rise"
              key={c.title}
              style={cssVars({ "--d": `${(i % 4) * 60}ms` })}
            >
              <span className="home-mono no">{String(i + 1).padStart(2, "0")}</span>
              <h4>{c.title}</h4>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </div>
    </RevealScope>
  );
}

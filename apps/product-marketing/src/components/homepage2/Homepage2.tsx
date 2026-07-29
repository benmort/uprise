"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { authAppUrl } from "@/lib/links";
import { screen } from "@/lib/screens";
import {
  ACTS,
  ATLAS_STATS,
  AU_GRID,
  CAMPAIGN_TYPES,
  CHIPS,
  POSTS,
  SCENES,
  SMALL_TILES,
  TICKER,
} from "./content";
import "./homepage2.css";

/** Inline CSS custom properties need a cast — React's CSSProperties has no index signature. */
const cssVars = (vars: Record<string, string | number>) => vars as React.CSSProperties;

const SEQ = ["--hp2-seq-1", "--hp2-seq-2", "--hp2-seq-3", "--hp2-seq-4", "--hp2-seq-5"];

/**
 * The "cinema" homepage candidate. One continuous scroll film in six acts, with a
 * pinned stage in the middle that plays five scenes of a single campaign shift.
 *
 * Everything animated is driven from ONE rAF-throttled scroll handler in the effect
 * below — it paints the progress hairline, the header state, the parallax planes,
 * the hero dissolve, the stage, and the act rail. Adding a second scroll listener
 * here will fight it; extend `paint()` instead.
 */
export default function Homepage2() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;

    const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const smooth = (t: number) => {
      const c = clamp(t, 0, 1);
      return c * c * (3 - 2 * c);
    };
    /**
     * 1 across the middle of scene `i`'s band, crossing to 0 over `w` either side of
     * the boundary. `gap` brings the cross-out forward of the cross-in so two
     * headlines are never legible on top of each other.
     */
    const band = (raw: number, i: number, w: number, gap = 0) =>
      smooth((0.5 - gap + w - Math.abs(raw - (i + 0.5))) / (2 * w));

    const all = <T extends HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));
    const one = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);

    const cleanups: Array<() => void> = [];

    /* ---------------------------------------------------------------- reveals */
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    all(".hp2-rise, .hp2-minimap, .hp2-thread, .hp2-matrix").forEach((n) => io.observe(n));
    cleanups.push(() => io.disconnect());

    // the hero headline plays on mount rather than on scroll
    const raf0 = requestAnimationFrame(() => {
      all(".hp2-heroh .hp2-mask").forEach((m) => m.classList.add("is-in"));
    });
    cleanups.push(() => cancelAnimationFrame(raf0));

    /* -------------------------------------------------------------- count-up */
    const counted = new WeakSet<Element>();
    const countUp = (node: HTMLElement) => {
      if (counted.has(node)) return;
      counted.add(node);
      const to = Number(node.dataset.to);
      if (!Number.isFinite(to)) return;
      const dp = Number(node.dataset.dp ?? 0);
      const suffix = node.dataset.suffix ?? "";
      const fmt = (v: number) => (dp ? v.toFixed(dp) : Math.round(v).toLocaleString("en-AU")) + suffix;
      if (reduce) {
        node.textContent = fmt(to);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const p = clamp((now - t0) / 1400, 0, 1);
        node.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            countUp(e.target as HTMLElement);
            cio.unobserve(e.target);
          }
        });
      },
      { threshold: 0.6 },
    );
    // Stage satellites are excluded: they sit absolutely inside the pinned deck, so
    // they are "in view" for the whole 480vh and an observer fires them all at once,
    // long before their scene arrives. paint() counts them on live-scene change.
    all("[data-to]")
      .filter((n) => !n.closest(".hp2-sat"))
      .forEach((n) => cio.observe(n));
    cleanups.push(() => cio.disconnect());

    /* ---------------------------------------------------------- stage refs */
    const stage = one(".hp2-stage");
    const scenes = all(".hp2-scene");
    const sats = all(".hp2-sat");
    const frame = one(".hp2-frame");
    const phone = one(".hp2-phone");
    const frameUrl = one(".hp2-furl");
    const shots = all<HTMLImageElement>("[data-hp2-shot]");
    const N = SCENES.length;
    let lastLive = -1;

    const paintStage = () => {
      if (!stage || !frame || !phone) return;
      const span = stage.offsetHeight - window.innerHeight;
      const p = clamp(-stage.getBoundingClientRect().top / (span || 1), 0, 1);
      // Map so scene 0 is centred the instant the stage pins and scene N-1 is still
      // centred when it releases. Mapping p straight onto 0..N leaves the first and
      // last scenes half-faded at the pin edges — a void either side.
      const raw = p * (N - 1) + 0.5;
      const live = clamp(Math.round(raw - 0.5), 0, N - 1);

      // copy: hard swap with a beat of blank between scenes
      scenes.forEach((node, i) => {
        const o = band(raw, i, 0.08, 0.08);
        node.style.opacity = String(o);
        node.style.transform = `translate3d(0,${lerp(16, 0, o)}px,0)`;
      });
      // captures: a short cross-dissolve — two dense UI screens overlapping for long
      // reads as a rendering glitch
      shots.forEach((img) => {
        const i = Number(img.dataset.hp2Shot);
        const o = band(raw, i, 0.09);
        img.style.opacity = String(o);
        img.style.transform = `scale(${lerp(1.025, 1, o)})`;
      });
      sats.forEach((node) => {
        const o = band(raw, Number(node.dataset.hp2Sat), 0.12, 0.06);
        node.style.opacity = String(o);
        node.style.transform = `translate3d(0,${lerp(14, 0, o)}px,0) scale(${lerp(0.95, 1, o)})`;
      });

      // scene 02: the phone takes over and the desktop frame recedes behind it
      const po = band(raw, 1, 0.13);
      phone.style.opacity = String(po);
      phone.style.transform =
        `translate(calc(-50% + ${lerp(90, 0, po).toFixed(1)}px), -50%)` +
        ` scale(${lerp(0.72, 1.3, po).toFixed(3)})` +
        ` rotate(${lerp(7, 0, po).toFixed(2)}deg)`;
      frame.style.opacity = (1 - 0.93 * po).toFixed(3);
      frame.style.setProperty("--fs", (1 - 0.12 * po).toFixed(3));

      const f = clamp(raw - 0.5, 0, N - 1);
      const a = Math.floor(f);
      const b = Math.min(a + 1, N - 1);
      frame.style.setProperty(
        "--fw",
        `${Math.round(lerp(SCENES[a].frameWidth, SCENES[b].frameWidth, f - a))}px`,
      );

      if (live !== lastLive) {
        lastLive = live;
        if (frameUrl) frameUrl.textContent = SCENES[live].url;
        root
          .querySelectorAll<HTMLElement>(`[data-hp2-sat="${live}"] [data-to]`)
          .forEach((n) => countUp(n));
        root.querySelectorAll<HTMLElement>(`[data-hp2-sat="${live}"] .hp2-bar i`).forEach((i) => {
          if (i.dataset.w) i.style.setProperty("--w", i.dataset.w);
        });
      }
    };

    /* --------------------------------------------------------- scroll paint */
    const planes = all(".hp2-plane[data-rate]");
    const progress = one(".hp2-progress i");
    const hdr = one(".hp2-hdr");
    const heroIn = one(".hp2-heroin");
    const railLinks = all(".hp2-rail a");
    const actEls = ACTS.map((a) => root.querySelector<HTMLElement>(`#${a.id}`));

    let ticking = false;
    const paint = () => {
      const y = window.scrollY;

      if (progress) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.setProperty("--p", String(max > 0 ? y / max : 0));
      }
      hdr?.classList.toggle("is-stuck", y > 60);

      planes.forEach((pl) => {
        const host = pl.parentElement?.getBoundingClientRect();
        if (!host) return;
        pl.style.transform = `translate3d(0,${(-host.top * Number(pl.dataset.rate)).toFixed(2)}px,0)`;
      });

      if (heroIn) {
        const hp = clamp(y / (window.innerHeight * 0.85), 0, 1);
        heroIn.style.opacity = String(1 - hp);
        heroIn.style.transform = `translate3d(0,${(hp * -40).toFixed(1)}px,0) scale(${(1 - hp * 0.04).toFixed(4)})`;
      }

      if (!reduce) paintStage();

      let best = 0;
      actEls.forEach((sec, i) => {
        if (sec && sec.getBoundingClientRect().top <= window.innerHeight * 0.45) best = i;
      });
      railLinks.forEach((a, i) => a.classList.toggle("is-on", i === best));

      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(paint);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    paint();
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    });

    /* ------------------------------------------- cursor spotlight + tilt */
    if (fine && !reduce) {
      const hero = one(".hp2-hero");
      const spot = one(".hp2-spot");
      if (hero && spot) {
        const onHeroMove = (e: PointerEvent) => {
          const r = hero.getBoundingClientRect();
          spot.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
          spot.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
        };
        hero.addEventListener("pointermove", onHeroMove);
        cleanups.push(() => hero.removeEventListener("pointermove", onHeroMove));
      }

      const deck = one(".hp2-deck");
      if (deck && frame) {
        let tx = 0;
        let ty = 0;
        let cx = 0;
        let cy = 0;
        let tiltRaf = 0;
        const onMove = (e: PointerEvent) => {
          const r = deck.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) return;
          tx = clamp((e.clientX - (r.left + r.width / 2)) / r.width, -0.5, 0.5);
          ty = clamp((e.clientY - (r.top + r.height / 2)) / r.height, -0.5, 0.5);
        };
        const tilt = () => {
          cx = lerp(cx, tx, 0.06);
          cy = lerp(cy, ty, 0.06);
          frame.style.setProperty("--ry", `${(cx * 5).toFixed(2)}deg`);
          frame.style.setProperty("--rx", `${(-cy * 3.4).toFixed(2)}deg`);
          tiltRaf = requestAnimationFrame(tilt);
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        tiltRaf = requestAnimationFrame(tilt);
        cleanups.push(() => {
          window.removeEventListener("pointermove", onMove);
          cancelAnimationFrame(tiltRaf);
        });
      }
    }

    /* ------------------------------------------- horizontal campaign rail */
    const trail = one(".hp2-trail");
    const trailBar = one(".hp2-trailbar i");
    if (trail) {
      const paintTrail = () => {
        const max = trail.scrollWidth - trail.clientWidth;
        const p = max > 0 ? trail.scrollLeft / max : 0;
        trailBar?.style.setProperty("--x", `${(p * (100 / 0.26 - 100)).toFixed(2)}%`);
      };
      trail.addEventListener("scroll", paintTrail, { passive: true });
      paintTrail();

      let down = false;
      let sx = 0;
      let sl = 0;
      const onDown = (e: PointerEvent) => {
        down = true;
        sx = e.clientX;
        sl = trail.scrollLeft;
        trail.classList.add("is-dragging");
        trail.setPointerCapture(e.pointerId);
      };
      const onDrag = (e: PointerEvent) => {
        if (down) trail.scrollLeft = sl - (e.clientX - sx);
      };
      const onUp = () => {
        down = false;
        trail.classList.remove("is-dragging");
      };
      trail.addEventListener("pointerdown", onDown);
      trail.addEventListener("pointermove", onDrag);
      trail.addEventListener("pointerup", onUp);
      trail.addEventListener("pointercancel", onUp);
      cleanups.push(() => {
        trail.removeEventListener("scroll", paintTrail);
        trail.removeEventListener("pointerdown", onDown);
        trail.removeEventListener("pointermove", onDrag);
        trail.removeEventListener("pointerup", onUp);
        trail.removeEventListener("pointercancel", onUp);
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  const signUp = `${authAppUrl()}/sign-up`;

  return (
    <div className="hp2-root" ref={rootRef}>
      <div className="hp2-progress">
        <i />
      </div>

      <nav className="hp2-rail" aria-label="Section progress">
        {ACTS.map((a) => (
          <a key={a.id} href={`#${a.id}`}>
            <span className="dot" />
            <span className="lbl">{a.label}</span>
          </a>
        ))}
      </nav>

      <header className="hp2-hdr">
        <div className="hp2-hdrin">
          <a className="hp2-brand" href="#hp2-act0">
            <span className="hp2-glyph">U</span>Uprise
          </a>
          <nav className="hp2-nav">
            <a href="#hp2-act2">Features</a>
            <a href="#hp2-act3">Data</a>
            <a href="#hp2-act4">Campaigns</a>
            <Link href="/blog">Blog</Link>
            <Link href="/plans">Plans</Link>
          </nav>
          <div className="hp2-hdrcta">
            <a className="hp2-btn hp2-btn--sm hp2-btn--ghost" href={`${authAppUrl()}/sign-in`}>
              Login
            </a>
            <a className="hp2-btn hp2-btn--sm hp2-btn--primary" href={signUp}>
              Start a campaign<span className="arw">→</span>
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* ============ ACT 0 — OPEN ============ */}
        <section className="hp2-hero" id="hp2-act0">
          <div className="hp2-plane hp2-aurora" data-rate="0.06">
            <b />
            <b />
            <b />
          </div>
          <div className="hp2-plane hp2-gridplane" data-rate="0.16" />
          <div className="hp2-plane hp2-spot" />

          <div className="hp2-shell hp2-heroin">
            <span className="hp2-mono hp2-eyebrow">Australia · multichannel organising</span>

            <h1 className="hp2-display hp2-heroh">
              <span className="hp2-mask">
                <span style={cssVars({ "--d": "60ms" })}>Every</span>
              </span>{" "}
              <span className="hp2-mask">
                <span style={cssVars({ "--d": "120ms" })}>person.</span>
              </span>
              <br />
              <span className="hp2-mask">
                <span style={cssVars({ "--d": "220ms" })}>Every</span>
              </span>{" "}
              <span className="hp2-mask">
                <span style={cssVars({ "--d": "280ms" })}>channel.</span>
              </span>
              <br />
              <span className="hp2-mask">
                <span className="hp2-accent" style={cssVars({ "--d": "400ms" })}>
                  One
                </span>
              </span>{" "}
              <span className="hp2-mask">
                <span className="hp2-accent" style={cssVars({ "--d": "460ms" })}>
                  campaign.
                </span>
              </span>
            </h1>

            <p className="hp2-lede hp2-rise" style={cssVars({ "--d": "620ms" })}>
              The all-in-one campaigning platform for progressive organisations – texting, calls,
              doorknocking, surveys, audiences and Australian data in one place.
            </p>

            <div className="hp2-cta hp2-rise" style={cssVars({ "--d": "720ms" })}>
              <a className="hp2-btn hp2-btn--primary" href={signUp}>
                Start a campaign<span className="arw">→</span>
              </a>
              <a className="hp2-btn hp2-btn--ghost" href="#hp2-act1">
                Watch a shift<span className="arw">↓</span>
              </a>
            </div>

            <div className="hp2-ticker hp2-rise" style={cssVars({ "--d": "840ms" })}>
              {TICKER.map((s) => (
                <div key={s.label}>
                  <span
                    className="n"
                    data-to={s.to}
                    data-dp={s.dp ?? 0}
                    data-suffix={s.suffix ?? ""}
                  >
                    0
                  </span>
                  <span className="hp2-mono k">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hp2-cue">
            <span className="hp2-mono">Scroll</span>
            <i />
          </div>
        </section>

        {/* ============ ACT 1 — THE PINNED STAGE ============ */}
        <section className="hp2-stage" id="hp2-act1">
          <div className="hp2-pin">
            <div className="hp2-sgrid">
              <div className="hp2-scenes">
                {SCENES.map((s) => (
                  <article className="hp2-scene" key={s.no}>
                    <div className="hp2-smeta">
                      <span className="hp2-mono num">{s.no}</span>
                      <span className="hp2-mono">One shift, start to finish</span>
                    </div>
                    <h2>{s.heading}</h2>
                    <p className="hp2-lede">{s.body}</p>
                    <div className="hp2-facts">
                      {s.facts.map((f) => (
                        <span className="hp2-pill" key={f}>
                          <i className="tick" />
                          {f}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <div className="hp2-deck">
                <div className="hp2-frame">
                  <div className="hp2-fbar">
                    <s />
                    <s />
                    <s />
                    <em className="hp2-furl">{SCENES[0].url}</em>
                  </div>
                  <div className="hp2-screens">
                    {SCENES.map((s, i) => {
                      const shot = s.shotKey ? screen(s.shotKey) : null;
                      if (!shot) return null;
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={s.no}
                          data-hp2-shot={i}
                          src={shot.file}
                          alt={shot.alt}
                          width={shot.width}
                          height={shot.height}
                        />
                      );
                    })}
                  </div>
                </div>

                {SCENES.flatMap((s, i) =>
                  s.satellites.map((sat) => (
                    <aside
                      className={`hp2-sat hp2-sat--${sat.pos}`}
                      data-hp2-sat={i}
                      key={`${s.no}-${sat.cap}`}
                    >
                      <span className="hp2-mono cap">{sat.cap}</span>
                      {typeof sat.to === "number" && (
                        <span className="big" data-to={sat.to} data-suffix={sat.suffix ?? ""}>
                          0
                        </span>
                      )}
                      {sat.meter && (
                        <div className="hp2-meter">
                          <s />
                          <s />
                          <s />
                          <s />
                          <s />
                        </div>
                      )}
                      {sat.bar && (
                        <div className="hp2-bar">
                          <i data-w={sat.bar} />
                        </div>
                      )}
                    </aside>
                  )),
                )}

                {/* No phone capture exists, so scene 02's subject is drawn. */}
                <div className="hp2-phone">
                  <div className="hp2-pscr">
                    <div className="hp2-ptop">
                      <span className="hp2-mono">Walk list · 14/62</span>
                      <span className="hp2-mono">◐</span>
                    </div>
                    <div className="hp2-pq">
                      <s />
                      Offline · queued 12
                    </div>
                    <div className="hp2-paddr">
                      14 Bell Street
                      <br />
                      Coburg VIC 3058
                    </div>
                    <div className="hp2-popts">
                      <b className="is-on">
                        <s />
                        Strong support
                      </b>
                      <b>
                        <s />
                        Leaning support
                      </b>
                      <b>
                        <s />
                        Undecided
                      </b>
                    </div>
                    <div className="hp2-pbtn">Save &amp; next door</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ ACT 2 — CONSTELLATION ============ */}
        <section className="hp2-const" id="hp2-act2">
          <div className="hp2-shell">
            <header className="hp2-sechead hp2-sechead--mid hp2-rise">
              <span className="hp2-mono hp2-eyebrow">The whole toolkit</span>
              <h2 className="hp2-h2">Everything your campaign runs on</h2>
              <p className="hp2-lede">
                From the first text to the last door knocked – five connected systems, one platform.
              </p>
            </header>

            <div className="hp2-bento">
              <article className="hp2-tile hp2-t7 hp2-ttall hp2-rise">
                <div>
                  <span className="hp2-mono hp2-eyebrow">Field canvassing</span>
                  <h3 className="hp2-h3">Cut turf, then walk it</h3>
                  <p>
                    Draw a boundary, split it into walkable blocks, and send route-ordered lists to
                    volunteers&apos; phones with real walking metrics.
                  </p>
                </div>
                <div className="hp2-minimap">
                  <svg viewBox="0 0 420 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                    <g className="roads">
                      <path d="M0 46 H420 M0 104 H420 M0 162 H420" />
                      <path d="M74 0 V230 M158 0 V230 M242 0 V230 M326 0 V230" />
                    </g>
                    <polygon className="turf" points="96,34 258,26 300,96 254,182 122,190 74,118" />
                    <g>
                      {[
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
                      ].map(([cx, cy], i) => (
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
                  <span className="hp2-mono hp2-mapbadge">18 blocks · route-ordered</span>
                </div>
              </article>

              <article className="hp2-tile hp2-t5 hp2-rise" style={cssVars({ "--d": "80ms" })}>
                <span className="hp2-mono hp2-eyebrow">Multichannel outreach</span>
                <h3 className="hp2-h3">One inbox for every conversation</h3>
                <p>
                  SMS and WhatsApp land in a shared queue your whole team works, with claims so
                  nobody doubles up.
                </p>
                <div className="hp2-thread">
                  <div className="hp2-msg hp2-msg--in" style={cssVars({ "--d": "400ms" })}>
                    <span className="hp2-mono who">+61 4·· ··· 118</span>What time does the Coburg
                    door knock start?
                  </div>
                  <div className="hp2-msg hp2-msg--out" style={cssVars({ "--d": "900ms" })}>
                    <span className="hp2-mono who">Claimed by Sam</span>10am at the Bell St shops –
                    I&apos;ll send the walk list through now.
                  </div>
                  <div className="hp2-msg hp2-msg--in" style={cssVars({ "--d": "1500ms" })}>
                    <span className="hp2-mono who">+61 4·· ··· 118</span>Perfect, count me in 👍
                  </div>
                </div>
              </article>

              <article className="hp2-tile hp2-t5 hp2-rise" style={cssVars({ "--d": "140ms" })}>
                <span className="hp2-mono hp2-eyebrow">Engagement content</span>
                <h3 className="hp2-h3">Dispositions on a five-point scale</h3>
                <p>
                  Map custom outcome codes to strong support through strong oppose, and fire canned
                  replies on the first inbound.
                </p>
                <div className="hp2-meter" style={{ marginTop: 16 }}>
                  <s style={{ width: 64 }} />
                  <s style={{ width: 48 }} />
                  <s style={{ width: 34 }} />
                  <s style={{ width: 26 }} />
                  <s style={{ width: 20 }} />
                </div>
              </article>

              {SMALL_TILES.map((t, i) => (
                <article
                  className="hp2-tile hp2-t4 hp2-rise"
                  key={t.title}
                  style={cssVars({ "--d": `${i * 70}ms` })}
                >
                  <span className="hp2-mono hp2-eyebrow">{t.eyebrow}</span>
                  <h3 className="hp2-h3">{t.title}</h3>
                  <p>{t.body}</p>
                </article>
              ))}

              {CHIPS.map((c, i) => (
                <article
                  className="hp2-tile hp2-t3 hp2-chip hp2-rise"
                  key={c.title}
                  style={cssVars({ "--d": `${i * 60}ms` })}
                >
                  <span className="ic">{c.icon}</span>
                  <span>
                    <b>{c.title}</b>
                    <span>{c.sub}</span>
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ============ ACT 3 — THE ATLAS ============ */}
        <section className="hp2-atlas" id="hp2-act3">
          <div className="hp2-shell hp2-agrid">
            <div>
              <div
                className="hp2-matrix"
                role="img"
                aria-label="Australia, shaded by census indicator"
              >
                {AU_GRID.flatMap((row, y) =>
                  row.split("").map((ch, x) => {
                    if (ch !== "#") {
                      return <s className="sea" key={`${x}-${y}`} style={cssVars({ "--d": "0ms" })} />;
                    }
                    // stable pseudo-random band, so server and client render identically
                    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
                    const bandIdx = Math.min(4, Math.floor(((h % 1000) / 1000) * 5));
                    // stagger from the south-east, so the fill sweeps up the continent
                    const delay = (Math.abs(x - 27) + Math.abs(y - 19)) * 16;
                    return (
                      <s
                        key={`${x}-${y}`}
                        style={cssVars({ "--c": `var(${SEQ[bandIdx]})`, "--d": `${delay}ms` })}
                      />
                    );
                  }),
                )}
              </div>
              <div className="hp2-legend">
                <span className="hp2-mono">Low</span>
                <span className="ramp">
                  {SEQ.map((v) => (
                    <s key={v} style={{ background: `var(${v})` }} />
                  ))}
                </span>
                <span className="hp2-mono">High</span>
                <span className="hp2-mono" style={{ marginLeft: "auto" }}>
                  ABS Census 2021 · median age
                </span>
              </div>
            </div>

            <div>
              <span className="hp2-mono hp2-eyebrow hp2-rise">Audience, data &amp; insights</span>
              <h2 className="hp2-h2 hp2-rise" style={cssVars({ "--d": "80ms", marginTop: "18px" })}>
                <span className="hp2-mask">
                  <span>The whole country,</span>
                </span>
                <br />
                <span className="hp2-mask">
                  <span style={cssVars({ "--d": "140ms" })}>already loaded.</span>
                </span>
              </h2>
              <p className="hp2-lede hp2-rise" style={cssVars({ "--d": "200ms", marginTop: "20px" })}>
                G-NAF addresses, ASGS geography, every federal, state and local division,
                politicians, policies and census demographics – in the workspace on day one, not a
                data project you have to run first.
              </p>
              <div className="hp2-stats hp2-rise" style={cssVars({ "--d": "280ms" })}>
                {ATLAS_STATS.map((s) => (
                  <div key={s.label}>
                    <span className="n" data-to={s.to} data-dp={s.dp ?? 0}>
                      0
                    </span>
                    <span className="hp2-mono k">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============ ACT 4 — CAMPAIGN TYPES ============ */}
        <section className="hp2-types" id="hp2-act4">
          <div className="hp2-shell">
            <header className="hp2-sechead hp2-rise">
              <span className="hp2-mono hp2-eyebrow">Built for the work</span>
              <h2 className="hp2-h2">Built for every kind of campaign</h2>
              <p className="hp2-lede">
                Electoral, advocacy, community organising, union, GOTV, referendum – and more.
              </p>
            </header>
          </div>

          <div className="hp2-shell">
            <div className="hp2-trail">
              {CAMPAIGN_TYPES.map((t) => (
                <article className="hp2-tcard" key={t.no}>
                  <span className="no">{t.no}</span>
                  <div>
                    <h3 className="hp2-h3">{t.title}</h3>
                    <p>{t.body}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="hp2-trailbar">
              <i />
            </div>
          </div>
        </section>

        {/* ============ ACT 5 — PROOF ============ */}
        <section className="hp2-proof" id="hp2-act5">
          <div className="hp2-shell">
            <div className="hp2-logos hp2-rise">
              <span className="hp2-mono" style={{ color: "var(--hp2-muted)" }}>
                Trusted by
              </span>
              <b>Australian Progress</b>
              <b>Common Threads</b>
            </div>

            <header
              className="hp2-sechead hp2-rise"
              style={{ marginTop: "clamp(56px,7vw,88px)" }}
            >
              <span className="hp2-mono hp2-eyebrow">From the blog</span>
              <h2 className="hp2-h2">Playbooks from the field</h2>
            </header>

            <div className="hp2-posts">
              {POSTS.map((p, i) => (
                <Link
                  className="hp2-post hp2-rise"
                  href={p.href}
                  key={p.title}
                  style={cssVars({ "--d": `${i * 80}ms` })}
                >
                  <div className="thumb" />
                  <div className="meta">
                    <span className="hp2-mono" style={{ color: "var(--hp2-brand)" }}>
                      {p.category}
                    </span>
                    <span className="hp2-mono">{p.minutes}</span>
                  </div>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="hp2-finale">
          <div className="hp2-plane hp2-aurora" data-rate="0.06">
            <b />
            <b />
            <b />
          </div>
          <div className="hp2-shell">
            <span className="hp2-mono hp2-eyebrow hp2-rise">Ready when you are</span>
            <h2 className="hp2-display hp2-rise" style={cssVars({ "--d": "80ms", maxWidth: "14ch" })}>
              Ready to organise?
            </h2>
            <p className="hp2-lede hp2-rise" style={cssVars({ "--d": "160ms" })}>
              Every channel, every door, every volunteer – run your whole campaign from one place.
            </p>
            <div className="hp2-cta hp2-rise" style={cssVars({ "--d": "240ms" })}>
              <a className="hp2-btn hp2-btn--primary" href={signUp}>
                Start a campaign<span className="arw">→</span>
              </a>
              <Link className="hp2-btn hp2-btn--ghost" href="/request-demo">
                Request a demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="hp2-ftr">
        <div className="hp2-shell">
          <div className="hp2-fgrid">
            <div>
              <a className="hp2-brand" href="#hp2-act0">
                <span className="hp2-glyph">U</span>Uprise
              </a>
              <p style={{ marginTop: 14, maxWidth: "34ch", fontSize: "14.5px" }}>
                SMS, calls, canvassing and Australian data in one platform. Built by campaigners,
                for campaigners.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li>
                  <a href="#hp2-act2">Features</a>
                </li>
                <li>
                  <a href="#hp2-act3">Data</a>
                </li>
                <li>
                  <Link href="/integrations">Integrations</Link>
                </li>
                <li>
                  <Link href="/plans">Plans</Link>
                </li>
              </ul>
            </div>
            <div>
              <h4>Resources</h4>
              <ul>
                <li>
                  <Link href="/blog">Blog</Link>
                </li>
                <li>
                  <Link href="/docs">Docs</Link>
                </li>
                <li>
                  <Link href="/campaigners">Campaigners</Link>
                </li>
                <li>
                  <Link href="/about-us">About</Link>
                </li>
              </ul>
            </div>
            <div>
              <h4>Community</h4>
              <ul>
                <li>
                  <Link href="/contact-us">Contact us</Link>
                </li>
                <li>
                  <Link href="/support-centre">Support centre</Link>
                </li>
                <li>
                  <Link href="/developers">Developers</Link>
                </li>
                <li>
                  <Link href="/request-demo">Request a demo</Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="hp2-flegal">
            <span className="hp2-mono">© 2026 Uprise Labs · Naarm / Melbourne</span>
            <span className="hp2-mono">
              <Link href="/privacy-policy">Privacy</Link> ·{" "}
              <Link href="/terms-of-service">Terms</Link> · <Link href="/security">Security</Link> ·{" "}
              <Link href="/compliance">Compliance</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

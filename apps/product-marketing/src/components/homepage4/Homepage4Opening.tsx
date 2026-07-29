"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@uprise/ui";
import { authAppUrl } from "@/lib/links";
import { screen } from "@/lib/screens";
import MarketingLaunchpad from "../MarketingLaunchpad";
import { countUp } from "./count-up";
import { HERO, SCENES, SECTION, TICKER } from "./content";
import "./homepage4.css";

/** Inline CSS custom properties need a cast — React's CSSProperties has no index signature. */
const cssVars = (vars: Record<string, string | number>) => vars as React.CSSProperties;

/**
 * The /homepage4 opening: the live homepage's hero copy played with the /homepage2 "cinema"
 * treatment — a masked headline reveal, parallax planes, a counting coverage ticker, and a
 * pinned stage that walks five scenes of one campaign shift in place of the showreel.
 *
 * The client boundary stops here. Everything below the opening on /homepage4 is the live
 * homepage's own server-rendered sections (see app/homepage4/page.tsx), so the blog strip can
 * still read posts off disk.
 *
 * Everything animated is driven from ONE rAF-throttled scroll handler in the effect below — it
 * paints the parallax planes, the hero dissolve and the stage. Adding a second scroll listener
 * here will fight it; extend `paint()` instead. The glass header condenses on its own (see
 * components/Header.tsx `glass`), so nothing here touches it.
 */
export default function Homepage4Opening() {
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
     * 1 across the middle of scene `i`'s band, crossing to 0 over `w` either side of the
     * boundary. `gap` brings the cross-out forward of the cross-in so two headlines are never
     * legible on top of each other.
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
    all(".hp4-rise").forEach((n) => io.observe(n));
    cleanups.push(() => io.disconnect());

    // the hero headline plays on mount rather than on scroll
    const heroH = one(".hp4-heroh");
    const raf0 = requestAnimationFrame(() => {
      all(".hp4-heroh .hp4-mask").forEach((m) => m.classList.add("is-in"));
    });
    // Then unclip the masks — see .hp4-heroh.is-clear: while overflow is hidden the accent
    // line's glow is cut square at each word's box.
    const clearT = window.setTimeout(() => heroH?.classList.add("is-clear"), reduce ? 0 : 1800);
    cleanups.push(() => {
      cancelAnimationFrame(raf0);
      window.clearTimeout(clearT);
    });

    /* -------------------------------------------------------------- count-up */
    // Shared with the sections below (see count-up.ts) so a figure counts identically
    // wherever it appears.
    const count = (node: HTMLElement) => countUp(node, reduce);
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            count(e.target as HTMLElement);
            cio.unobserve(e.target);
          }
        });
      },
      { threshold: 0.6 },
    );
    // Stage satellites are excluded: they sit absolutely inside the pinned deck, so they are
    // "in view" for the whole 480vh and an observer fires them all at once, long before their
    // scene arrives. paint() counts them on live-scene change.
    all("[data-to]")
      .filter((n) => !n.closest(".hp4-sat"))
      .forEach((n) => cio.observe(n));
    cleanups.push(() => cio.disconnect());

    /* ---------------------------------------------------------- stage refs */
    const stage = one(".hp4-stage");
    const scenes = all(".hp4-scene");
    const sats = all(".hp4-sat");
    const frame = one(".hp4-frame");
    const phone = one(".hp4-phone");
    const frameUrl = one(".hp4-furl");
    const stageCue = one(".hp4-cue--stage");
    const shots = all<HTMLImageElement>("[data-hp4-shot]");
    const N = SCENES.length;
    let lastLive = -1;

    const paintStage = () => {
      if (!stage || !frame || !phone) return;
      const span = stage.offsetHeight - window.innerHeight;
      const p = clamp(-stage.getBoundingClientRect().top / (span || 1), 0, 1);
      // Map so scene 0 is centred the instant the stage pins and scene N-1 is still centred
      // when it releases. Mapping p straight onto 0..N leaves the first and last scenes
      // half-faded at the pin edges — a void either side.
      const raw = p * (N - 1) + 0.5;
      const live = clamp(Math.round(raw - 0.5), 0, N - 1);

      // The stage cue: in fast as the pin takes hold, out once the visitor is clearly
      // moving through the scenes. Two ramps, whichever is lower.
      if (stageCue) {
        stageCue.style.opacity = String(
          Math.min(smooth(p / 0.03), 1 - smooth((p - 0.14) / 0.1)),
        );
      }

      // copy: hard swap with a beat of blank between scenes
      scenes.forEach((node, i) => {
        const o = band(raw, i, 0.08, 0.08);
        node.style.opacity = String(o);
        node.style.transform = `translate3d(0,${lerp(16, 0, o)}px,0)`;
      });
      // captures: a short cross-dissolve — two dense UI screens overlapping for long reads as
      // a rendering glitch
      shots.forEach((img) => {
        const i = Number(img.dataset.hp4Shot);
        const o = band(raw, i, 0.09);
        img.style.opacity = String(o);
        img.style.transform = `scale(${lerp(1.025, 1, o)})`;
      });
      sats.forEach((node) => {
        const o = band(raw, Number(node.dataset.hp4Sat), 0.12, 0.06);
        node.style.opacity = String(o);
        node.style.transform = `translate3d(0,${lerp(14, 0, o)}px,0) scale(${lerp(0.95, 1, o)})`;
      });

      // scene 02: the phone takes over and the desktop frame recedes behind it
      const po = band(raw, 1, 0.13);
      phone.style.opacity = String(po);
      phone.style.transform =
        `translate(calc(-50% + ${lerp(90, 0, po).toFixed(1)}px), -50%)` +
        // Peak 1.06, not 1.3: the phone now has a true 486/1024 screen, so at 264px wide
        // it is already ~556px tall and a big scale-up would overflow the 100svh pin.
        ` scale(${lerp(0.8, 1.06, po).toFixed(3)})` +
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
          .querySelectorAll<HTMLElement>(`[data-hp4-sat="${live}"] [data-to]`)
          .forEach((n) => count(n));
        root.querySelectorAll<HTMLElement>(`[data-hp4-sat="${live}"] .hp4-bar i`).forEach((i) => {
          if (i.dataset.w) i.style.setProperty("--w", i.dataset.w);
        });
      }
    };

    /* --------------------------------------------------------- scroll paint */
    const planes = all(".hp4-plane[data-rate]");
    const heroIn = one(".hp4-heroin");

    let ticking = false;
    const paint = () => {
      const y = window.scrollY;

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
      const hero = one(".hp4-hero");
      const spot = one(".hp4-spot");
      if (hero && spot) {
        const onHeroMove = (e: PointerEvent) => {
          const r = hero.getBoundingClientRect();
          spot.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
          spot.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
        };
        hero.addEventListener("pointermove", onHeroMove);
        cleanups.push(() => hero.removeEventListener("pointermove", onHeroMove));
      }

      const deck = one(".hp4-deck");
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

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <div className="hp4-root" ref={rootRef}>
      {/* ============ HERO ============ */}
      <section className="hp4-hero" id={SECTION.overview}>
        <div className="hp4-plane hp4-aurora" data-rate="0.06">
          <b />
          <b />
          <b />
        </div>
        <div className="hp4-plane hp4-gridplane" data-rate="0.16" />
        <div className="hp4-plane hp4-spot" />

        <div className="hp4-shell hp4-heroin">
          {/* Beat zero of the hero cascade. Without a reveal the eyebrow sat fully painted while
              everything under it rose, which read as a static label above an animating page; at 0ms
              it overlaps the headline's first word (60ms) closely enough to land as one movement. */}
          <span className="hp4-mono hp4-eyebrow hp4-rise" style={cssVars({ "--d": "0ms" })}>
            {HERO.eyebrow}
          </span>

          <h1 className="hp4-display hp4-heroh">
            {HERO.titleLines.map((line, i) => {
              const accent = i === HERO.titleLines.length - 1;
              return (
                <React.Fragment key={line}>
                  {/* Word-masked so each word rises out of its own clip box. */}
                  {line.split(" ").map((word, w) => (
                    <React.Fragment key={`${line}-${word}`}>
                      <span className="hp4-mask">
                        <span
                          className={accent ? "hp4-accent" : undefined}
                          style={cssVars({ "--d": `${i * 160 + w * 60 + 60}ms` })}
                        >
                          {word}
                        </span>
                      </span>{" "}
                    </React.Fragment>
                  ))}
                  {accent ? null : <br />}
                </React.Fragment>
              );
            })}
          </h1>

          <p className="hp4-lede hp4-rise" style={cssVars({ "--d": "620ms" })}>
            {HERO.lede}
          </p>

          {/* Session-aware, exactly as on the live homepage: signed-in visitors get the
              launchpad instead of the sign-up pair. */}
          <div className="hp4-rise" style={cssVars({ "--d": "720ms" })}>
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

          <div className="hp4-ticker hp4-rise" style={cssVars({ "--d": "840ms" })}>
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
                <span className="hp4-mono k">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hp4-cue">
          <span className="hp4-mono">Scroll</span>
          <i />
        </div>
      </section>

      {/* ============ THE PINNED STAGE ============ */}
      <section className="hp4-stage" id={SECTION.oneShift}>
        <div className="hp4-pin">
          {/* The second cue — see .hp4-cue--stage. Driven by paintStage(), not CSS, because it
              has to answer the pin's progress rather than the page's. */}
          <div className="hp4-cue hp4-cue--stage">
            <span className="hp4-mono">Keep scrolling</span>
            <i />
          </div>

          <div className="hp4-sgrid">
            <div className="hp4-scenes">
              {SCENES.map((s) => (
                <article className="hp4-scene" key={s.no}>
                  <div className="hp4-smeta">
                    <span className="hp4-mono num">{s.no}</span>
                    <span className="hp4-mono">One shift, start to finish</span>
                  </div>
                  <h2>{s.heading}</h2>
                  <p className="hp4-lede">{s.body}</p>
                  <div className="hp4-facts">
                    {s.facts.map((f) => (
                      <span className="hp4-pill" key={f}>
                        <i className="tick" />
                        {f}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="hp4-deck">
              <div className="hp4-frame">
                <div className="hp4-fbar">
                  <s />
                  <s />
                  <s />
                  <em className="hp4-furl">{SCENES[0].url}</em>
                </div>
                <div className="hp4-screens">
                  {SCENES.map((s, i) => {
                    const shot = s.shotKey ? screen(s.shotKey) : null;
                    if (!shot) return null;
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={s.no}
                        data-hp4-shot={i}
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
                    className={`hp4-sat hp4-sat--${sat.pos}`}
                    data-hp4-sat={i}
                    key={`${s.no}-${sat.cap}`}
                  >
                    <span className="hp4-mono cap">{sat.cap}</span>
                    {typeof sat.to === "number" && (
                      <span className="big" data-to={sat.to} data-suffix={sat.suffix ?? ""}>
                        0
                      </span>
                    )}
                    {sat.meter && (
                      <div className="hp4-meter">
                        <s />
                        <s />
                        <s />
                        <s />
                        <s />
                      </div>
                    )}
                    {sat.bar && (
                      <div className="hp4-bar">
                        <i data-w={sat.bar} />
                      </div>
                    )}
                  </aside>
                )),
              )}

              {/* No phone capture exists, so scene 02's subject is drawn. The device shell
                  follows the admin composer's Live Preview mock (blasts/[id]/composer):
                  black bezel, notch pill with camera dot, and a 486/1024 screen — so the
                  marketing site and the product show a phone the same way.

                  The status bar carries the scene's whole point: no signal, and a queue
                  that has kept counting anyway. */}
              <div className="hp4-phone">
                <div className="hp4-pscr">
                  <div className="hp4-pnotch" aria-hidden>
                    <s />
                  </div>

                  <div className="hp4-pstatus">
                    <span className="hp4-mono">9:41</span>
                    {/* Dimmed signal bars rather than the words "No service": any label long
                        enough to read collides with the notch. The offline state is stated
                        outright in the queue pill below, where it carries more weight. */}
                    <span className="hp4-pstatus-r">
                      <s className="hp4-psig" aria-hidden>
                        <i />
                        <i />
                        <i />
                        <i />
                      </s>
                      <s className="hp4-pbatt" aria-hidden />
                    </span>
                  </div>

                  <div className="hp4-pbody">
                    <div className="hp4-ptop">
                      <span className="hp4-mono">Walk list · 14/62</span>
                      <span className="hp4-mono">◐</span>
                    </div>
                    <div className="hp4-pq">
                      <s />
                      Offline · queued 12
                    </div>
                    <div className="hp4-paddr">
                      14 Bell Street
                      <br />
                      Coburg VIC 3058
                    </div>
                    <div className="hp4-popts">
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
                    {/* Fills the screen the way the real app does rather than leaving a void
                        under the options. Both are genuine field-app affordances — the
                        installed PWA queues notes and photos to the same on-device outbox. */}
                    <div className="hp4-pnote">Add a note…</div>
                  </div>

                  <div className="hp4-pfoot">
                    <div className="hp4-pbtn">Save &amp; next door</div>
                    <span className="hp4-phome" aria-hidden />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

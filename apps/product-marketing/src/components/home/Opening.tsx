"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@uprise/ui";
import { authAppUrl } from "@/lib/links";
import { screen } from "@/lib/screens";
import MarketingLaunchpad from "../MarketingLaunchpad";
import { countUp, resetCount } from "./count-up";
import { HERO, SCENES, SECTION, TICKER } from "./content";
import "./home.css";

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
export default function Opening() {
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
    // Reversed on exit, matching RevealScope — see REVERSE_ON_SCROLL_UP there for why, and for the
    // `home-reveal` marker that keeps a band from staggering itself apart on the way out.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          e.target.classList.toggle("is-in", e.isIntersecting);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    all(".home-rise").forEach((n) => {
      n.classList.add("home-reveal");
      io.observe(n);
    });
    cleanups.push(() => io.disconnect());

    // the hero headline plays on mount rather than on scroll
    const heroH = one(".home-heroh");
    const raf0 = requestAnimationFrame(() => {
      all(".home-heroh .home-mask").forEach((m) => m.classList.add("is-in"));
    });
    // Then unclip the masks — see .home-heroh.is-clear: while overflow is hidden the accent
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
          if (e.isIntersecting) count(e.target as HTMLElement);
          else resetCount(e.target as HTMLElement);
        });
      },
      { threshold: 0.6 },
    );
    // Stage satellites are excluded: they sit absolutely inside the pinned deck, so they are
    // "in view" for the whole 480vh and an observer fires them all at once, long before their
    // scene arrives. paint() counts them on live-scene change.
    all("[data-to]")
      .filter((n) => !n.closest(".home-sat"))
      .forEach((n) => cio.observe(n));
    cleanups.push(() => cio.disconnect());

    /* ---------------------------------------------------------- stage refs */
    const stage = one(".home-stage");
    const scenes = all(".home-scene");
    const sats = all(".home-sat");
    const frame = one(".home-frame");
    const phone = one(".home-phone");
    const frameUrl = one(".home-furl");
    const stageCue = one(".home-cue--stage");
    const shots = all<HTMLImageElement>("[data-home-shot]");
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
        const i = Number(img.dataset.homeShot);
        const o = band(raw, i, 0.09);
        img.style.opacity = String(o);
        img.style.transform = `scale(${lerp(1.025, 1, o)})`;
      });
      sats.forEach((node) => {
        const o = band(raw, Number(node.dataset.homeSat), 0.12, 0.06);
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
        // Reset the outgoing scene's figures so they count again when it comes back — scrolling
        // back up through the stage otherwise leaves them at their final value while the satellites
        // around them fade in fresh. lastLive is -1 on the first paint, which matches nothing.
        root
          .querySelectorAll<HTMLElement>(`[data-home-sat="${lastLive}"] [data-to]`)
          .forEach((n) => resetCount(n));
        lastLive = live;
        if (frameUrl) frameUrl.textContent = SCENES[live].url;
        root
          .querySelectorAll<HTMLElement>(`[data-home-sat="${live}"] [data-to]`)
          .forEach((n) => count(n));
        root.querySelectorAll<HTMLElement>(`[data-home-sat="${live}"] .home-bar i`).forEach((i) => {
          if (i.dataset.w) i.style.setProperty("--w", i.dataset.w);
        });
      }
    };

    /* --------------------------------------------------------- scroll paint */
    const planes = all(".home-plane[data-rate]");
    const heroIn = one(".home-heroin");

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
      const hero = one(".home-hero");
      const spot = one(".home-spot");
      if (hero && spot) {
        const onHeroMove = (e: PointerEvent) => {
          const r = hero.getBoundingClientRect();
          spot.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
          spot.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
        };
        hero.addEventListener("pointermove", onHeroMove);
        cleanups.push(() => hero.removeEventListener("pointermove", onHeroMove));
      }

      const deck = one(".home-deck");
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
    <div className="home-root" ref={rootRef}>
      {/* ============ HERO ============ */}
      <section className="home-hero" id={SECTION.overview}>
        <div className="home-plane home-aurora" data-rate="0.06">
          <b />
          <b />
          <b />
        </div>
        <div className="home-plane home-gridplane" data-rate="0.16" />
        <div className="home-plane home-spot" />

        <div className="home-shell home-heroin">
          {/* Beat zero of the hero cascade. Without a reveal the eyebrow sat fully painted while
              everything under it rose, which read as a static label above an animating page; at 0ms
              it overlaps the headline's first word (60ms) closely enough to land as one movement. */}
          <span className="home-mono home-eyebrow home-rise" style={cssVars({ "--d": "0ms" })}>
            {HERO.eyebrow}
          </span>

          <h1 className="home-display home-heroh">
            {HERO.titleLines.map((line, i) => {
              const accent = i === HERO.titleLines.length - 1;
              return (
                <React.Fragment key={line}>
                  {/* Word-masked so each word rises out of its own clip box. */}
                  {line.split(" ").map((word, w) => (
                    <React.Fragment key={`${line}-${word}`}>
                      <span className="home-mask">
                        <span
                          className={accent ? "home-accent" : undefined}
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

          <p className="home-lede home-rise" style={cssVars({ "--d": "620ms" })}>
            {HERO.lede}
          </p>

          {/* Session-aware, exactly as on the live homepage: signed-in visitors get the
              launchpad instead of the sign-up pair. */}
          <div className="home-rise" style={cssVars({ "--d": "720ms" })}>
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

          <div className="home-ticker home-rise" style={cssVars({ "--d": "840ms" })}>
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
                <span className="home-mono k">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="home-cue">
          <span className="home-mono">Scroll</span>
          <i />
        </div>
      </section>

      {/* ============ THE PINNED STAGE ============ */}
      <section className="home-stage" id={SECTION.oneShift}>
        <div className="home-pin">
          {/* The second cue — see .home-cue--stage. Driven by paintStage(), not CSS, because it
              has to answer the pin's progress rather than the page's. */}
          <div className="home-cue home-cue--stage">
            <span className="home-mono">Keep scrolling</span>
            <i />
          </div>

          <div className="home-sgrid">
            <div className="home-scenes">
              {SCENES.map((s) => (
                <article className="home-scene" key={s.no}>
                  <div className="home-smeta">
                    <span className="home-mono num">{s.no}</span>
                    <span className="home-mono">One shift, start to finish</span>
                  </div>
                  <h2>{s.heading}</h2>
                  <p className="home-lede">{s.body}</p>
                  <div className="home-facts">
                    {s.facts.map((f) => (
                      <span className="home-pill" key={f}>
                        <i className="tick" />
                        {f}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="home-deck">
              <div className="home-frame">
                <div className="home-fbar">
                  <s />
                  <s />
                  <s />
                  <em className="home-furl">{SCENES[0].url}</em>
                </div>
                <div className="home-screens">
                  {SCENES.map((s, i) => {
                    const shot = s.shotKey ? screen(s.shotKey) : null;
                    if (!shot) return null;
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={s.no}
                        data-home-shot={i}
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
                    className={`home-sat home-sat--${sat.pos}`}
                    data-home-sat={i}
                    key={`${s.no}-${sat.cap}`}
                  >
                    <span className="home-mono cap">{sat.cap}</span>
                    {typeof sat.to === "number" && (
                      <span className="big" data-to={sat.to} data-suffix={sat.suffix ?? ""}>
                        0
                      </span>
                    )}
                    {sat.meter && (
                      <div className="home-meter">
                        <s />
                        <s />
                        <s />
                        <s />
                        <s />
                      </div>
                    )}
                    {sat.bar && (
                      <div className="home-bar">
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
              <div className="home-phone">
                <div className="home-pscr">
                  <div className="home-pnotch" aria-hidden>
                    <s />
                  </div>

                  <div className="home-pstatus">
                    <span className="home-mono">9:41</span>
                    {/* Dimmed signal bars rather than the words "No service": any label long
                        enough to read collides with the notch. The offline state is stated
                        outright in the queue pill below, where it carries more weight. */}
                    <span className="home-pstatus-r">
                      <s className="home-psig" aria-hidden>
                        <i />
                        <i />
                        <i />
                        <i />
                      </s>
                      <s className="home-pbatt" aria-hidden />
                    </span>
                  </div>

                  <div className="home-pbody">
                    <div className="home-ptop">
                      <span className="home-mono">Walk list · 14/62</span>
                      <span className="home-mono">◐</span>
                    </div>
                    <div className="home-pq">
                      <s />
                      Offline · queued 12
                    </div>
                    <div className="home-paddr">
                      14 Bell Street
                      <br />
                      Coburg VIC 3058
                    </div>
                    <div className="home-popts">
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
                    <div className="home-pnote">Add a note…</div>
                  </div>

                  <div className="home-pfoot">
                    <div className="home-pbtn">Save &amp; next door</div>
                    <span className="home-phome" aria-hidden />
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

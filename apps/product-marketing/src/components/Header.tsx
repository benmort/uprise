"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleIcon, ChevronDown, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import MobileMenu from "./MobileMenu";
import { authAppUrl, adminAppUrl } from "@/lib/links";
import { useSession } from "@/lib/session";

/**
 * useLayoutEffect on the client, useEffect on the server — the server variant is a no-op, which
 * keeps React from warning about useLayoutEffect during SSR. Used for the initial scroll sync,
 * which has to land BEFORE the browser paints to avoid a visible jump.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * The global marketing header: a floating pill, transparent at rest and condensing into a centred
 * glass bar once scrolled.
 *
 * One treatment on every route. This used to take a `glass` flag so the homepage could wear the
 * condensing pill while every other route got a plain full-width white bar — but a nav that moves
 * and re-skins depending on which page you are on reads as two different sites, so the homepage's
 * treatment is now simply the header.
 */
/**
 * THE TOGGLE. Hold the pill at one width and one height off the homepage, so the nav stays put
 * whatever the scroll position.
 *
 * The condense (max-w 1320px → 1100px, pt-5 → pt-3) belongs to the homepage's opening: it answers
 * a full-bleed hero wash that scrolls away beneath it. On an ordinary page there is nothing for it
 * to answer, so all it does is slide the logo and nav 110px sideways and 8px up while someone is
 * reading — movement with no meaning behind it.
 *
 * Only the GEOMETRY is held. The glass skin still arrives on scroll everywhere, because that one
 * does have a job: it keeps the nav legible once content is passing under it.
 *
 * Set to false to condense on every route, as it did before.
 */
const NORMALISE_INNER_HEADER = true;

export default function Header() {
  const pathname = usePathname();
  // EXACT match: "/" as a prefix matches every route, which would opt the whole site out.
  const condenses = pathname === "/" || !NORMALISE_INNER_HEADER;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  /**
   * Gates the shell's width/padding transition. Off until the initial scroll position has been
   * read, so that first correction is instant rather than a 500ms slide.
   *
   * Why this matters: the pill goes max-w-[1320px] → max-w-[1100px] when scrolled,
   * and because it is mx-auto that 220px narrowing moves the logo and nav 110px to the right.
   * `isScrolled` has to start false to match the server HTML, so a page loaded ALREADY scrolled
   * (a reload part-way down, or a restored scroll position) painted the wide bar and then slid the
   * whole left side 110px across — the jank this pair of flags removes.
   */
  const [scrollSynced, setScrollSynced] = useState(false);
  const { user, loading: sessionLoading } = useSession();
  const sessionHint = user?.email ? { email: user.email } : null;

  // Don't flash the logged-out CTAs and then snap to "Continue" once /auth/check resolves.
  // While the session is unknown we show a neutral placeholder; once resolved we reveal ONLY the
  // correct set, eased in via opacity (revealed flips a tick after loading ends so the transition runs).
  const [revealed, setRevealed] = useState(false);
  React.useEffect(() => {
    if (sessionLoading) return;
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [sessionLoading]);

  // Read the real scroll position before the first paint, so a page that loads already scrolled
  // paints the condensed bar straight away instead of correcting into it.
  useIsomorphicLayoutEffect(() => {
    setIsScrolled(window.scrollY > 50);
  }, []);

  // Enable the transition in a LATER task, not alongside the sync above. React batches state set
  // in the same effect into one render, so setting both together would put the transition class on
  // the very commit that corrects the width — animating the correction, which is the jank. A
  // separate task guarantees the corrected shell has committed and painted first.
  React.useEffect(() => {
    const id = window.setTimeout(() => setScrollSynced(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  React.useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      setIsScrolled(scrollTop > 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Animate scroll-driven changes, but never the initial sync above.
  const shellTransition = scrollSynced ? "transition-all duration-500" : "";

  /**
   * The homepage's top-left cluster – wordmark and nav list – rises with the act rail's label
   * instead of being painted flat before the splash has animated. Deliberately the SAME motion as
   * home.css `.home-rail .lbl`: a 0.35s opacity + 6px inward slide on --home-ease. Both start on
   * the frame after mount, which is the frame <Chrome /> marks its first rail stop `is-on`, so the
   * two land together.
   *
   * Glass mode only — every other route keeps a header that is simply there on arrival. The
   * wordmark and the nav are driven from one flag rather than a shared wrapper because the nav's
   * parent also holds the session-gated CTAs, which own their own separate fade (`revealed` above).
   */
  const [chromeRevealed, setChromeRevealed] = useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setChromeRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Transitions `translate`, NOT `transform`: Tailwind v4's translate-x-* utilities set the
  // standalone `translate` property (via --tw-translate-x), so a transition naming `transform`
  // fades the opacity while the 6px slide snaps in one frame.
  //
  // motion-reduce keeps the cluster present and still: this is chrome a visitor navigates with, so
  // it must never depend on a transition they've asked not to run.
  const railReveal = `transition-[opacity,translate] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
    chromeRevealed ? "translate-x-0 opacity-100" : "-translate-x-1.5 opacity-0"
  }`;

  // select-none matters most on the homepage, where the bar sits over a splash that is itself
  // unselectable (see home.css `.home-hero`) and a drag started on the headline shouldn't pick up
  // the nav on its way past. Applied everywhere now that there is one treatment — chrome is not
  // text a visitor needs to copy. Inherited, so it also covers the mobile drawer; <MobileMenu />
  // renders inside this header element.
  // At rest the pill rides half as far from the top edge as it used to (pt-5 → pt-2.5), sitting
  // over the hero wash that runs edge to edge behind it.
  //
  // Scrolled, the top gap closes to nothing (pt-0): that is the state where the page is travelling
  // up behind the bar, and any gap above the pill is a strip of content sliding past over its top
  // edge. Keyed on isScrolled, NOT on `condenses` — the glass arrives on scroll on every route (only
  // the narrowing is homepage-only), so every route has content passing behind it to hide.
  //
  // What comes off the top goes onto the bottom, so the header's box stays about where it was. That
  // box is only the band this fixed element covers and intercepts pointers over; pages clear the
  // header with their own pt-17.5 rather than by measuring it.
  const headerClasses = `fixed left-0 top-0 z-9999 flex w-full select-none justify-center px-4 sm:px-8 xl:px-12.5 ${shellTransition} ${
    isScrolled ? "pt-0 pb-5" : "pt-2.5 pb-4.5"
  }`;

  // Skin and geometry are separate so NORMALISE_INNER_HEADER can hold one and keep the other: the
  // glass arrives on scroll everywhere, the narrowing only where the pill condenses.
  const skin = isScrolled
    ? "border-stroke-secondary bg-white/75 shadow-xl backdrop-blur-[18px] backdrop-saturate-150"
    : "border-transparent bg-transparent";
  // The pill narrows as you scroll on the homepage; at rest it is invisible so the hero
  // wash runs edge to edge behind it.
  const width = condenses && isScrolled ? "max-w-[1100px]" : "max-w-[1320px]";
  const innerClasses = `relative mx-auto w-full items-center justify-between rounded-full border px-4 py-3 xl:flex xl:gap-7 xl:py-1 xl:pl-7 xl:pr-4 ${shellTransition} ${width} ${skin}`;

  return (
    <header className={headerClasses}>
      {/* The logo column is content-width rather than a 3/12 fraction so the nav starts
          immediately after the wordmark (left-aligned) instead of being pushed toward the
          centre by a reserved column. The nav block then takes the remaining space and its
          justify-between keeps the CTAs hard right. */}
      <div className={innerClasses}>
        <div className="flex w-full items-center justify-between xl:w-auto xl:shrink-0">
          <div className={`inline-flex items-center gap-1 z-[9999] ${railReveal}`}>
            <Link aria-label="Uprise logo" href="/">
              <div className="flex items-center gap-2">
                {/* The mark wears the /homepage2 treatment on every route: the brand ramp on a
                    diagonal with a soft glow, so it reads as lit rather than pasted on.

                    Drawn in CSS rather than loading uprise-icon.svg so it can track
                    var(--color-brand-*) and carry the glow — an <img>-loaded SVG is an isolated
                    document and can do neither. The asset is otherwise a faithful copy of this
                    square (same ramp, rx 9, and the Outfit 700 U as an outline), and it is what
                    the footer, /homepage3, the favicon and the PWA manifest render. Change the
                    ramp or the radius here and you have to change it there too. */}
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-[9px] bg-[linear-gradient(150deg,var(--color-brand-400),var(--color-brand-500)_55%,var(--color-brand-700))] text-base font-bold tracking-[-0.02em] text-white shadow-[0_6px_16px_-6px] shadow-brand-500/70"
                >
                  U
                </span>
                <span className="text-xl font-bold text-gray-900">Uprise</span>
              </div>
            </Link>

          </div>
          <div className="xl:hidden">
            <button
              className="ml-auto block p-2 cursor-pointer hover:bg-gray-100 rounded-lg transition-colors duration-200"
              type="button"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <span className="relative block h-6 w-6 z-[9999]">
                {/* Hamburger mobile menu icon */}
                <span className={`absolute right-0 block h-0.5 w-6 rounded-full bg-slate-600 transition-all duration-200 ${isMobileMenuOpen ? 'top-[13px] opacity-0' : 'top-[3px] opacity-100'}`}></span>
                <span className={`absolute right-0 block h-0.5 w-6 rounded-full bg-slate-600 transition-all duration-200 ${isMobileMenuOpen ? 'opacity-0' : 'top-[11px] opacity-100'}`}></span>
                <span className={`absolute right-0 block h-0.5 w-6 rounded-full bg-slate-600 transition-all duration-200 ${isMobileMenuOpen ? 'bottom-[13px] opacity-0' : 'bottom-[3px] opacity-100'}`}></span>
                {/* "<" chevron when open — the bars fade out and this rotates/fades in. */}
                <ChevronLeft
                  className={`absolute inset-0 h-6 w-6 text-slate-600 transition-all duration-200 ${isMobileMenuOpen ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0'}`}
                  aria-hidden
                />
              </span>
            </button>
          </div>
        </div>

        <div className="invisible hidden h-0 w-full items-center justify-between xl:visible xl:flex xl:h-auto xl:flex-1">
          <nav className={railReveal}>
            <ul className="flex flex-col gap-5 xl:flex-row xl:items-center 2xl:gap-8">
              <li className="nav__menu group relative xl:py-4">
                <button className="inline-flex items-center gap-1.5 font-medium text-text-color group-hover:text-primary dark:text-white/60 dark:group-hover:text-white">
                  Resources
                  <span className="duration-200 xl:group-hover:-scale-100">
                    <ChevronDown className="h-5 w-5" />
                  </span>
                </button>
                <div className="invisible absolute left-[120%] top-full w-[270px] -translate-x-1/2 rounded-2xl border bg-white p-3 opacity-0 shadow-lg group-hover:visible group-hover:opacity-100">
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/docs">
                    Handbook
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/about-us">
                    About Us
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/plans">
                    Plans
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/campaigners">
                    Campaigners
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/integrations">
                    Integrations
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/comparison">
                    Comparison
                  </Link>
                  {/* "Developers" (/developers) is hidden for now – see
                      (community)/developers/page.tsx for what to restore. */}
                </div>
              </li>
              <li className="nav__menu group relative xl:py-4">
                <button className="inline-flex items-center gap-1.5 font-medium text-text-color group-hover:text-primary dark:text-white/60 dark:group-hover:text-white">
                  Community
                  <span className="duration-200 xl:group-hover:-scale-100">
                    <ChevronDown className="h-5 w-5" />
                  </span>
                </button>
                <div className="invisible absolute left-[120%] top-full w-[270px] -translate-x-1/2 rounded-2xl border bg-white p-3 opacity-0 shadow-lg group-hover:visible group-hover:opacity-100">
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/support-centre">
                    Support Centre
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/contact-us">
                    Contact Us
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/request-demo">
                    Request a Demo
                  </Link>
                </div>
              </li>
              <li className="nav__menu group relative xl:py-4">
                <button className="inline-flex items-center gap-1.5 font-medium text-text-color group-hover:text-primary dark:text-white/60 dark:group-hover:text-white">
                  Policies
                  <span className="duration-200 xl:group-hover:-scale-100">
                    <ChevronDown className="h-5 w-5" />
                  </span>
                </button>
                <div className="invisible absolute left-[120%] top-full w-[270px] -translate-x-1/2 rounded-2xl border bg-white p-3 opacity-0 shadow-lg group-hover:visible group-hover:opacity-100">
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/privacy-policy">
                    Privacy
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/terms-of-service">
                    Terms of Service
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/security">
                    Security
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/compliance">
                    Compliance
                  </Link>
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/donations-policy">
                    Donations
                  </Link>
                </div>
              </li>
              <li className="nav__menu group xl:py-4">
                <Link className="font-medium text-text-color group-hover:text-primary dark:text-white/60 dark:group-hover:text-white" href="/blog">
                  Blog
                </Link>
              </li>
            </ul>
          </nav>

          {/* The CTA slot reserves BOTH axes before the session is known, so nothing in the bar
              moves when /auth/check resolves. Two separate reservations, both needed:

              WIDTH (xl:min-w-[23rem]) — the placeholder used to be w-44 (176px) against a resolved
              logged-out set of ~368px, so the slot grew 191px and the buttons popped in from
              nowhere.

              HEIGHT (min-h-[4.375rem] = 70px) — this is the one that moved the LEFT side. The old
              floor was 3.25rem (52px), but the resolved content is 68px logged out and 70px logged
              in: the `py-3` wrapper on Get Started below makes that one button 24px taller than its
              View Plans / Login siblings. So the row grew 16px on resolve, the pill 12px, and
              because the row is items-center that halved into the logo and the whole nav dropping
              6px. 70px is the taller of the two resolved states, so neither grows the row.

              Reserving rather than trimming the stray py-3 keeps the settled header exactly the
              height it is today — trimming it would be the cleaner fix but shrinks the bar 12px. */}
          <div className="mt-7 flex min-h-[4.375rem] items-center justify-end gap-3 xl:mt-0 xl:min-w-[23rem]">
            {sessionLoading ? (
              // Fills the reserved slot rather than sitting at 176px inside it, so the skeleton is
              // the shape of what arrives. A neutral black tint rather than bg-gray-100 so it reads
              // the same faint grey on a white page and on the homepage's pale hero wash — the grey
              // token disappeared entirely against the wash, leaving what looked like a broken gap.
              <div className="h-11 w-full animate-pulse rounded-lg bg-black/[0.045]" aria-hidden />
            ) : (
            <div
              className={`flex flex-col gap-3.5 transition-opacity duration-300 xl:flex-row xl:items-center ${
                revealed ? "opacity-100" : "opacity-0"
              }`}
            >
              {sessionHint ? (
                <div className="flex items-center gap-3 py-3">
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-stroke-tertiary bg-white px-4 py-3 text-sm font-medium text-text-color shadow-xs duration-200 hover:bg-gray-50 hover:text-gray-800 max-xl:h-13 max-xl:flex-1 max-xl:rounded-full"
                    href={`${authAppUrl()}/sign-in`}
                  >
                    Switch account
                  </a>
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white duration-200 max-xl:h-13 max-xl:flex-1 max-xl:rounded-full"
                    href={adminAppUrl()}
                  >
                    Continue as {sessionHint.email}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <>
                  <Link
                    href="/plans"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-[rgb(52,64,84)] px-4 py-3 text-sm font-medium text-white shadow-theme-xs duration-200 hover:bg-[#1e293b] max-xl:h-13 max-xl:w-full max-xl:rounded-full"
                  >
                    View Plans
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                  <div className="py-3">
                    <a
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white duration-200 max-xl:h-13 max-xl:w-full max-xl:rounded-full"
                      href={`${authAppUrl()}/sign-up`}
                    >
                      <span>
                        <CircleIcon className="h-5 w-5" />
                      </span>
                      Get Started
                    </a>
                  </div>
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-stroke-tertiary bg-white px-4 py-3 text-sm font-medium text-text-color shadow-xs duration-200 hover:bg-gray-50 hover:text-gray-800 max-xl:h-13 max-xl:w-full max-xl:rounded-full"
                    href={`${authAppUrl()}/sign-in`}
                  >
                    Login
                  </a>
                </>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} sessionHint={sessionHint} />
    </header>
  );
}

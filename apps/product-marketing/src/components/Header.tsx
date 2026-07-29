"use client";

import React, { useState } from "react";
import Link from "next/link";
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
 * The global marketing header. `glass` swaps the solid white bar for the /homepage2 treatment —
 * transparent over the hero, condensing into a centred glass pill once scrolled. Only the shell
 * changes: the nav links, the dropdowns and the session-aware CTAs are the same in both modes, so
 * a candidate homepage can restyle the chrome without forking the navigation.
 */
export default function Header({ glass = false }: { glass?: boolean } = {}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  /**
   * Gates the shell's width/padding transition. Off until the initial scroll position has been
   * read, so that first correction is instant rather than a 500ms slide.
   *
   * Why this matters: in glass mode the pill goes max-w-[1320px] → max-w-[1100px] when scrolled,
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
   * homepage4.css `.hp4-rail .lbl`: a 0.35s opacity + 6px inward slide on --hp4-ease. Both start on
   * the frame after mount, which is the frame <Chrome /> marks its first rail stop `is-on`, so the
   * two land together.
   *
   * Glass mode only — every other route keeps a header that is simply there on arrival. The
   * wordmark and the nav are driven from one flag rather than a shared wrapper because the nav's
   * parent also holds the session-gated CTAs, which own their own separate fade (`revealed` above).
   */
  const [chromeRevealed, setChromeRevealed] = useState(false);
  React.useEffect(() => {
    if (!glass) return;
    const id = requestAnimationFrame(() => setChromeRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [glass]);

  // Transitions `translate`, NOT `transform`: Tailwind v4's translate-x-* utilities set the
  // standalone `translate` property (via --tw-translate-x), so a transition naming `transform`
  // fades the opacity while the 6px slide snaps in one frame.
  //
  // motion-reduce keeps the cluster present and still: this is chrome a visitor navigates with, so
  // it must never depend on a transition they've asked not to run.
  const railReveal = glass
    ? `transition-[opacity,translate] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
        chromeRevealed ? "translate-x-0 opacity-100" : "-translate-x-1.5 opacity-0"
      }`
    : "";

  // select-none in glass mode only, i.e. on the homepage: the bar sits over the splash, which is
  // deliberately unselectable (see homepage4.css `.hp4-hero`), and a drag that started on the
  // headline shouldn't pick up the nav on its way past. Inherited, so it also covers the mobile
  // drawer — <MobileMenu /> renders inside this header element. Every other route keeps its nav
  // selectable.
  const headerClasses = glass
    ? `fixed left-0 top-0 z-9999 flex w-full select-none justify-center px-4 pb-2 sm:px-8 xl:px-12.5 ${shellTransition} ${
        isScrolled ? "pt-3" : "pt-5"
      }`
    : isScrolled
      ? "fixed left-0 top-0 z-9999 w-full bg-white dark:bg-black-dark shadow transition duration-400"
      : "fixed left-0 top-0 z-9999 w-full bg-white transition duration-400";

  // The pill narrows and picks up its glass as you scroll; at rest it is invisible so the hero
  // wash runs edge to edge behind it.
  const innerClasses = glass
    ? `relative mx-auto w-full items-center justify-between rounded-full border px-4 py-3 xl:flex xl:gap-7 xl:py-1 xl:pl-7 xl:pr-4 ${shellTransition} ${
        isScrolled
          ? "max-w-[1100px] border-stroke-secondary bg-white/75 shadow-xl backdrop-blur-[18px] backdrop-saturate-150"
          : "max-w-[1320px] border-transparent bg-transparent"
      }`
    : "relative items-center justify-between px-4 py-4 sm:px-8 xl:flex xl:gap-7 xl:px-12.5 xl:py-0";

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
                {/* On the homepage the mark wears the /homepage2 treatment: the flat brand-500
                    square becomes the brand ramp on a diagonal with a soft glow, so it reads as
                    lit against the hero wash rather than pasted onto it. Same geometry and letter
                    as uprise-icon.svg — drawn in CSS because an <img> can't carry a gradient.
                    Every other route keeps the flat asset. */}
                {glass ? (
                  <span
                    aria-hidden
                    className="grid h-8 w-8 place-items-center rounded-[9px] bg-[linear-gradient(150deg,var(--color-brand-400),var(--color-brand-500)_55%,var(--color-brand-700))] text-base font-bold tracking-[-0.02em] text-white shadow-[0_6px_16px_-6px] shadow-brand-500/70"
                  >
                    U
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/uprise-icon.svg" alt="" className="h-8 w-8" />
                )}
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
                  <Link className="nested-group flex w-full items-center gap-3 rounded-lg p-3 text-sm font-medium text-text-color-secondary duration-200 hover:bg-gray-100 hover:text-text-color" href="/developers">
                    Developers
                  </Link>
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
                    Privacy Policy
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
                    Donations Policy
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

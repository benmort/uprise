import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import SCREENS from "../../../public/images/marketing/screens/screens.json";
import { authAppUrl } from "@/lib/links";
import { formatPostDate, getAllPosts } from "@/lib/blog";
import Showreel from "../marketing/Showreel";
import LogoCarousel from "../LogoCarousel";
import Footer from "../Footer";
import { Reveal, ScrollProgress } from "./motion";
import {
  CLOSING,
  DEMOGRAPHICS,
  ENGAGEMENT,
  FEATURES,
  GALLERY,
  HERO,
  NAV_LINKS,
  PILLARS,
  RESEARCH,
  ROADMAP,
  STATS,
  TEAMS,
  USE_CASES,
} from "./content";

/**
 * /homepage3 — the "editorial" homepage candidate, built from the standalone design handoff
 * (`Uprise Homepage (standalone).html`). It runs alongside the live `/` and `/homepage2` so all
 * three can be compared on the same content.
 *
 * Like homepage2 it brings its own chrome (a sticky glass header and a light footer), so
 * MarketingChrome suppresses the global Header/Footer for this path.
 *
 * This variant carries its own palette rather than the shared design tokens — that is the point of
 * a candidate, and it is why the colours are written as literals here. If it wins, the palette gets
 * promoted into `@uprise/ui` and these literals go away.
 *
 * Server component by design: only the scroll rail, the reveals and the showreel are client
 * boundaries, so the page stays statically renderable and the real blog posts can be read directly.
 */

/** IBM Plex Mono, loaded by app/homepage3/page.tsx. Every eyebrow, label and figure caption uses it. */
const MONO = "font-[family-name:var(--font-ibm-plex-mono)]";
/** The page gutter. The handoff is a fixed 72px desktop canvas; these are its responsive steps. */
const GUTTER = "px-6 md:px-12 lg:px-[72px]";

type ScreenMeta = { file: string; width: number | null; height: number | null; alt: string };
// The manifest carries a leading `_comment`, so go via unknown and guard on width/height.
const screens = SCREENS as unknown as Record<string, ScreenMeta | undefined>;

/**
 * A capture from `screens.json`, or nothing. Alt text comes from the manifest so it cannot claim
 * one surface while showing another; a missing capture renders no element at all rather than a
 * developer-facing placeholder.
 */
function Shot({
  screen,
  className = "",
  priority = false,
  sizes = "(min-width: 1024px) 60vw, 100vw",
}: {
  screen: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const meta = screens[screen];
  if (!meta?.file || !meta.width || !meta.height) return null;
  return (
    <Image
      src={meta.file}
      alt={meta.alt}
      width={meta.width}
      height={meta.height}
      priority={priority}
      sizes={sizes}
      className={className}
    />
  );
}

function Eyebrow({ children, tone = "faint" }: { children: ReactNode; tone?: "faint" | "accent" | "onDark" }) {
  const colour =
    tone === "accent" ? "text-[#2F6BFF]" : tone === "onDark" ? "text-[#7FA3FF]" : "text-[#9AA0AA]";
  return (
    <div className={`${MONO} text-xs uppercase tracking-[0.14em] ${colour}`}>{children}</div>
  );
}

function SectionHead({
  eyebrow,
  title,
  lede,
  tone = "faint",
  maxWidth = "max-w-[52ch]",
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  tone?: "faint" | "accent";
  maxWidth?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${maxWidth}`}>
      <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      <h2 className="m-0 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-balance md:text-[40px] lg:text-[46px]">
        {title}
      </h2>
      {lede ? <p className="m-0 text-[17px] leading-relaxed text-[#5B6270] text-pretty md:text-lg">{lede}</p> : null}
    </div>
  );
}

/** The soft grey pill used for feature tags throughout the handoff. */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-lg bg-[#F0F0EC] px-3 py-[7px] text-sm font-medium text-[#4B5563]">{children}</span>
  );
}

/** A white card with the handoff's mono label/meta strip across the top. */
function MockCard({ label, meta, children }: { label: string; meta: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E4E4DF] bg-white shadow-[0_40px_70px_-50px_rgba(12,14,18,0.45)]">
      <div className="flex items-center justify-between gap-4 border-b border-[#EFEFEB] bg-[#F7F7F5] px-5 py-4">
        <div className={`${MONO} text-[11px] uppercase tracking-[0.12em] text-[#8A8F98]`}>{label}</div>
        <div className={`${MONO} text-[11px] text-[#8A8F98]`}>{meta}</div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-6">{children}</div>
    </div>
  );
}

/** The pill CTA pair used in the hero and the closing panel. */
function CtaPair({ tone = "light" }: { tone?: "light" | "onAccent" }) {
  const primary =
    tone === "onAccent"
      ? "bg-white text-[#2F6BFF]"
      : "bg-[#2F6BFF] text-white shadow-[0_12px_28px_-10px_rgba(47,107,255,0.7)] hover:bg-[#1F52D6]";
  const secondary =
    tone === "onAccent"
      ? "border border-white/45 text-white hover:bg-white/10"
      : "border border-[#D8D8D2] bg-white hover:border-[#0C0E12]";
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <a
        href={`${authAppUrl()}/sign-up`}
        className={`rounded-full px-7 py-[15px] text-base font-semibold transition-all hover:-translate-y-0.5 ${primary}`}
      >
        Start a campaign
      </a>
      <Link
        href="/request-demo"
        className={`rounded-full px-7 py-[15px] text-base font-semibold transition-all hover:-translate-y-0.5 ${secondary}`}
      >
        Request a demo
      </Link>
    </div>
  );
}

export default function Homepage3() {
  const posts = getAllPosts().slice(0, 3);

  return (
    <div className="overflow-x-hidden bg-[#FBFBFA] text-[#0C0E12]">
      <ScrollProgress />

      {/* ── Sticky glass header ─────────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-50 flex items-center justify-between gap-8 border-b border-[#E8E8E4] bg-[#FBFBFA]/80 py-[18px] backdrop-blur-[14px] ${GUTTER}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-6 lg:gap-9">
          <a href="#top" className="flex flex-none items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/uprise-icon.svg" alt="Uprise" className="h-[26px] w-[26px]" />
            <span className="text-[21px] font-bold tracking-[-0.02em]">Uprise</span>
          </a>
          <nav className="hidden min-w-0 gap-6 overflow-x-auto text-[15px] font-medium text-[#4B5563] [scrollbar-width:none] lg:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.label} href={l.href} className="whitespace-nowrap hover:text-[#2F6BFF]">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="ml-auto flex flex-none items-center gap-3.5 whitespace-nowrap">
          <a href={`${authAppUrl()}/sign-in`} className="hidden text-[15px] font-medium text-[#4B5563] hover:text-[#2F6BFF] sm:block">
            Sign in
          </a>
          <a
            href={`${authAppUrl()}/sign-up`}
            className="rounded-full bg-[#0C0E12] px-5 py-2.5 text-[15px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[#2F6BFF]"
          >
            Start a campaign
          </a>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section id="top" className={`flex flex-col items-center gap-6 pt-16 text-center md:pt-24 ${GUTTER}`}>
        <Reveal>
          <div className="inline-flex items-center gap-2.5 rounded-full border border-[#E1E1DC] bg-white px-3.5 py-[7px] text-[13px] font-medium text-[#4B5563]">
            {HERO.eyebrow}
          </div>
        </Reveal>
        <Reveal delayMs={90}>
          <h1 className="m-0 max-w-[15ch] text-[46px] font-bold leading-[0.97] tracking-[-0.038em] text-balance sm:text-[64px] lg:text-[86px]">
            {HERO.titleLines.map((line, i) => (
              <span key={line} className={`block ${i === HERO.titleLines.length - 1 ? "text-[#2F6BFF]" : ""}`}>
                {line}
              </span>
            ))}
          </h1>
        </Reveal>
        <Reveal delayMs={180}>
          <p className="m-0 max-w-[60ch] text-lg leading-relaxed text-[#5B6270] text-pretty md:text-[21px]">
            {HERO.lede}
          </p>
        </Reveal>
        <Reveal delayMs={270} className="pt-1.5">
          <CtaPair />
        </Reveal>
      </section>

      {/* ── The showreel, in its browser frame ──────────────────────────────── */}
      <div className={`pb-16 pt-14 md:pt-16 lg:pb-[72px] ${GUTTER}`}>
        <Showreel />
      </div>

      {/* ── Supporters ──────────────────────────────────────────────────────── */}
      <div className={`flex flex-col items-center gap-6 pb-20 ${GUTTER}`}>
        <div className={`${MONO} text-xs uppercase tracking-[0.14em] text-[#9AA0AA]`}>
          Trusted by Australian campaigns, unions and causes
        </div>
        {/* The handoff hard-codes seven marks; `logos.ts` keeps five of them `hidden` until each org
            confirms we may use their brand, so this reuses the shared carousel (which falls back to
            a static row when there are too few to scroll honestly). */}
        <div className="w-full">
          <LogoCarousel />
        </div>
      </div>

      {/* ── Stat band ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 border-y border-[#E8E8E4] bg-[#F5F5F2] lg:grid-cols-4">
        {STATS.map((s, i) => (
          <div
            key={s.caption}
            className={`px-8 py-8 md:px-10 md:py-9 ${i % 2 === 0 ? "border-r border-[#E8E8E4]" : ""} ${
              i < 2 ? "border-b border-[#E8E8E4] lg:border-b-0" : ""
            } ${i === 2 ? "lg:border-r lg:border-[#E8E8E4]" : ""} ${i === 1 ? "lg:border-r lg:border-[#E8E8E4]" : ""}`}
          >
            <div className="text-[34px] font-bold tracking-[-0.03em] [font-variant-numeric:tabular-nums] md:text-[46px]">
              {s.value}
            </div>
            <div className="mt-1 text-sm text-[#6B7280]">{s.caption}</div>
          </div>
        ))}
      </div>

      {/* ── Core features ───────────────────────────────────────────────────── */}
      <section id="features" className={`flex flex-col gap-11 py-24 lg:pt-28 ${GUTTER}`}>
        <Reveal>
          <SectionHead
            eyebrow="Core features"
            title="A fully featured campaigning platform, crafted for modern organisations"
            lede="Everything a modern campaign needs to reach people, knock doors, run volunteers and turn conversations into wins."
          />
        </Reveal>
        <div className="grid gap-px overflow-hidden rounded-[14px] border border-[#E4E4DF] bg-[#E4E4DF] sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="flex flex-col gap-[7px] bg-white p-7">
              <div className={`${MONO} text-[11px] tracking-[0.1em] text-[#2F6BFF]`}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="text-lg font-semibold">{f.title}</div>
              <div className="text-sm leading-[1.55] text-[#6B7280]">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Alternating pillars ─────────────────────────────────────────────── */}
      {PILLARS.map((p, i) => (
        <section
          key={p.id}
          id={p.id}
          className={`grid items-center gap-10 lg:gap-16 ${
            p.shotFirst ? "lg:grid-cols-[1.15fr_0.85fr]" : "lg:grid-cols-[0.85fr_1.15fr]"
          } ${i === 0 ? "pt-4" : ""} ${i === PILLARS.length - 1 ? "pb-24 lg:pb-28" : "pb-14"} ${GUTTER}`}
        >
          {p.shotFirst ? (
            <Reveal className="order-last lg:order-first">
              <Shot
                screen={p.screen}
                className="h-auto w-full rounded-[14px] border border-[#E4E4DF] shadow-[0_40px_70px_-40px_rgba(12,14,18,0.45)]"
              />
            </Reveal>
          ) : null}

          <Reveal>
            <div className="flex flex-col gap-4.5">
              <Eyebrow tone="accent">{p.eyebrow}</Eyebrow>
              <h2 className="m-0 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-balance md:text-[40px] lg:text-[46px]">
                {p.title}
              </h2>
              {p.body.map((para) => (
                <p key={para} className="m-0 text-[17px] leading-relaxed text-[#5B6270] text-pretty md:text-lg">
                  {para}
                </p>
              ))}
              <div className="flex flex-wrap gap-2 pt-1.5">
                {p.chips.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </div>
            </div>
          </Reveal>

          {!p.shotFirst ? (
            <Reveal>
              <Shot
                screen={p.screen}
                priority={i === 0}
                className="h-auto w-full rounded-[14px] border border-[#E4E4DF] shadow-[0_40px_70px_-40px_rgba(12,14,18,0.45)]"
              />
            </Reveal>
          ) : null}
        </section>
      ))}

      {/* ── Engagement content: the survey-builder mock ─────────────────────── */}
      <section
        id={ENGAGEMENT.id}
        className={`grid items-center gap-10 pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 ${GUTTER}`}
      >
        <Reveal className="order-last lg:order-first">
          <MockCard label={ENGAGEMENT.mock.label} meta={ENGAGEMENT.mock.meta}>
            <div className="flex flex-col gap-2.5 rounded-[10px] border border-[#EAEAE5] px-4.5 py-4">
              <div className="text-[15px] font-semibold">{ENGAGEMENT.mock.q1}</div>
              <div className="flex flex-wrap gap-2">
                {ENGAGEMENT.mock.options.map((o, i) => (
                  <span
                    key={o}
                    className={`rounded-[7px] px-3 py-1.5 text-[13px] ${
                      i === 0
                        ? "bg-[#E8F0FF] font-semibold text-[#2F6BFF]"
                        : "bg-[#F0F0EC] font-medium text-[#4B5563]"
                    }`}
                  >
                    {o}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2.5 pl-4.5">
              <span className={`${MONO} text-[11px] text-[#2F6BFF]`}>{ENGAGEMENT.mock.branch}</span>
              <span aria-hidden className="h-px flex-1 bg-[#EAEAE5]" />
            </div>
            <div className="ml-4.5 flex flex-col gap-2 rounded-[10px] border border-[#D9E4FF] bg-[#FAFCFF] px-4.5 py-4">
              <div className="text-[15px] font-semibold">{ENGAGEMENT.mock.q2}</div>
              <div className="text-[13px] text-[#6B7280]">
                {ENGAGEMENT.mock.q2Note}{" "}
                <strong className="font-semibold text-[#0C0E12]">{ENGAGEMENT.mock.q2Disposition}</strong>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-[#EFEFEB] pt-4">
              {ENGAGEMENT.mock.chips.map((c) => (
                <span key={c} className="rounded-lg bg-[#F0F0EC] px-3 py-1.5 text-[13px] font-medium text-[#4B5563]">
                  {c}
                </span>
              ))}
            </div>
          </MockCard>
        </Reveal>

        <Reveal>
          <div className="flex flex-col gap-4.5">
            <Eyebrow tone="accent">{ENGAGEMENT.eyebrow}</Eyebrow>
            <h2 className="m-0 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-balance md:text-[40px] lg:text-[46px]">
              {ENGAGEMENT.title}
            </h2>
            {ENGAGEMENT.body.map((para) => (
              <p key={para} className="m-0 text-[17px] leading-relaxed text-[#5B6270] text-pretty md:text-lg">
                {para}
              </p>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Demographics, on ink ────────────────────────────────────────────── */}
      <section
        className={`grid items-center gap-10 overflow-hidden bg-[#0C0E12] py-20 text-white lg:grid-cols-[0.8fr_1.2fr] lg:gap-14 lg:py-24 ${GUTTER}`}
      >
        <Reveal>
          <div className="flex flex-col gap-4">
            <Eyebrow tone="onDark">{DEMOGRAPHICS.eyebrow}</Eyebrow>
            <h2 className="m-0 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[40px] lg:text-[44px]">
              {DEMOGRAPHICS.title}
            </h2>
            <p className="m-0 text-[17px] leading-relaxed text-[#A7ADB8] text-pretty">{DEMOGRAPHICS.body}</p>
          </div>
        </Reveal>
        <Reveal>
          <Shot
            screen={DEMOGRAPHICS.screen}
            className="h-auto w-full rounded-[14px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]"
          />
        </Reveal>
      </section>

      {/* ── Teams & white-label ─────────────────────────────────────────────── */}
      <section
        id={TEAMS.id}
        className={`grid items-center gap-10 py-24 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16 lg:py-28 ${GUTTER}`}
      >
        <Reveal>
          <div className="flex flex-col gap-4.5">
            <Eyebrow tone="accent">{TEAMS.eyebrow}</Eyebrow>
            <h2 className="m-0 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-balance md:text-[40px] lg:text-[46px]">
              {TEAMS.title}
            </h2>
            {TEAMS.body.map((para) => (
              <p key={para} className="m-0 text-[17px] leading-relaxed text-[#5B6270] text-pretty md:text-lg">
                {para}
              </p>
            ))}
          </div>
        </Reveal>
        <Reveal>
          <MockCard label={TEAMS.mock.label} meta={TEAMS.mock.meta}>
            <div className="flex flex-col gap-2.5">
              {TEAMS.mock.members.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-[#EAEAE5] px-4 py-3.5"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{m.name}</span>
                    <span className="text-[13px] text-[#6B7280]">{m.role}</span>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-[5px] text-xs font-semibold ${
                      m.tone === "accent" ? "bg-[#E8F0FF] text-[#2F6BFF]" : "bg-[#F0F0EC] text-[#4B5563]"
                    }`}
                  >
                    {m.badge}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-dashed border-[#D8D8D2] bg-[#FAFAF8] px-4 py-3.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold text-[#4B5563]">
                    {TEAMS.mock.pending.email}
                  </span>
                  <span className="text-[13px] text-[#8A8F98]">{TEAMS.mock.pending.note}</span>
                </div>
                <span className="flex-none rounded-full bg-[#0C0E12] px-2.5 py-[5px] text-xs font-semibold text-white">
                  {TEAMS.mock.pending.action}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-[#EFEFEB] pt-4">
              {TEAMS.mock.chips.map((c) => (
                <span key={c} className="rounded-lg bg-[#F0F0EC] px-3 py-1.5 text-[13px] font-medium text-[#4B5563]">
                  {c}
                </span>
              ))}
            </div>
          </MockCard>
        </Reveal>
      </section>

      {/* ── Research partnerships ───────────────────────────────────────────── */}
      <section
        id={RESEARCH.id}
        className={`grid items-center gap-10 pb-24 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:pb-28 ${GUTTER}`}
      >
        <Reveal>
          <div className="flex flex-col gap-4.5">
            <Eyebrow tone="accent">{RESEARCH.eyebrow}</Eyebrow>
            <h2 className="m-0 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-balance md:text-[40px] lg:text-[46px]">
              {RESEARCH.title}
            </h2>
            <p className="m-0 text-[17px] leading-relaxed text-[#5B6270] text-pretty md:text-lg">{RESEARCH.body}</p>
            <div className="flex flex-col gap-3.5 pt-2">
              {RESEARCH.points.map((pt) => (
                <div key={pt.lead} className="flex items-start gap-3">
                  <span aria-hidden className="mt-[7px] h-[7px] w-[7px] flex-none rounded-full bg-[#2F6BFF]" />
                  <div className="text-base leading-[1.55] text-[#4B5563]">
                    <strong className="font-semibold text-[#0C0E12]">{pt.lead}</strong> {pt.body}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2.5">
              <Link
                href="/contact-us"
                className="inline-flex rounded-full border border-[#D8D8D2] bg-white px-6 py-3.5 text-base font-semibold transition-colors hover:border-[#0C0E12]"
              >
                {RESEARCH.cta}
              </Link>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="flex flex-col gap-5">
            <MockCard
              label={RESEARCH.wave.label}
              meta={
                <span className="inline-flex items-center gap-[7px] text-[#22A45D]">
                  <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-[#22C55E]" />
                  {RESEARCH.wave.synced}
                </span>
              }
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[15px] font-semibold">{RESEARCH.wave.title}</div>
                <div className={`${MONO} text-xs text-[#8A8F98]`}>{RESEARCH.wave.meta}</div>
              </div>
              <div className="flex flex-col gap-2.5">
                {RESEARCH.wave.rows.map((r) => (
                  <div key={r.label} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-sm text-[#4B5563]">
                      <span>{r.label}</span>
                      <span className="font-semibold text-[#0C0E12] [font-variant-numeric:tabular-nums]">
                        {r.pct}%
                      </span>
                    </div>
                    <div className="h-[9px] overflow-hidden rounded-full bg-[#F0F0EC]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${r.pct}%`, background: r.bar }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[#EFEFEB] pt-3.5">
                {RESEARCH.wave.chips.map((c) => (
                  <span key={c} className="rounded-lg bg-[#F0F0EC] px-3 py-1.5 text-[13px] font-medium text-[#4B5563]">
                    {c}
                  </span>
                ))}
              </div>
            </MockCard>

            <div className="grid gap-px overflow-hidden rounded-[14px] border border-[#E4E4DF] bg-[#E4E4DF] sm:grid-cols-3">
              {RESEARCH.facts.map((f) => (
                <div key={f.value} className="flex flex-col gap-1.5 bg-white p-5">
                  <div className="text-[26px] font-bold tracking-[-0.02em]">{f.value}</div>
                  <div className="text-[13px] leading-relaxed text-[#6B7280]">{f.caption}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Use cases ───────────────────────────────────────────────────────── */}
      <section id="usecases" className={`flex flex-col gap-10 pb-24 lg:pb-28 ${GUTTER}`}>
        <Reveal>
          <SectionHead
            eyebrow="Built for the work"
            title="Whatever kind of campaign you're running"
            maxWidth="max-w-[46ch]"
          />
        </Reveal>
        <div className="grid gap-px overflow-hidden rounded-[14px] border border-[#E4E4DF] bg-[#E4E4DF] sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((u) => (
            <div key={u.title} className="flex flex-col gap-2 bg-white p-8 transition-colors hover:bg-[#FBFBFA]">
              <div className="text-xl font-semibold">{u.title}</div>
              <div className="text-[15px] leading-[1.55] text-[#6B7280]">{u.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Roadmap ─────────────────────────────────────────────────────────── */}
      <section
        id="roadmap"
        className={`flex flex-col gap-10 border-y border-[#E8E8E4] bg-[#F5F5F2] py-24 lg:py-26 ${GUTTER}`}
      >
        <Reveal>
          <SectionHead
            eyebrow="On the roadmap"
            title="What's coming next"
            lede="We build in the open. These are in active development – not available yet."
            maxWidth="max-w-[50ch]"
          />
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ROADMAP.map((r) => (
            <div
              key={r.title}
              className="flex flex-col gap-2 rounded-xl border border-dashed border-[#D8D8D2] bg-[#FBFBFA] p-6"
            >
              <span
                className={`${MONO} self-start rounded-full bg-[#EDEDE8] px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[#8A8F98]`}
              >
                Coming soon
              </span>
              <div className="text-[17px] font-semibold">{r.title}</div>
              <div className="text-sm leading-relaxed text-[#6B7280]">{r.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Gallery ─────────────────────────────────────────────────────────── */}
      <section id="gallery" className={`flex flex-col gap-11 py-24 lg:py-28 ${GUTTER}`}>
        <Reveal>
          <SectionHead eyebrow={GALLERY.eyebrow} title={GALLERY.title} lede={GALLERY.lede} />
        </Reveal>
        <div className="grid items-stretch gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Reveal className="flex flex-col gap-3.5">
            <Shot
              screen={GALLERY.wide.screen}
              className="h-auto w-full rounded-[14px] border border-[#E4E4DF] shadow-[0_40px_70px_-50px_rgba(12,14,18,0.45)]"
            />
            <div className="text-sm text-[#6B7280]">{GALLERY.wide.caption}</div>
          </Reveal>
          <Reveal className="flex flex-col items-center justify-center gap-3.5 rounded-[14px] border border-[#E4E4DF] bg-[#F5F5F2] p-8">
            <Shot
              screen={GALLERY.phone.screen}
              sizes="(min-width: 1024px) 280px, 60vw"
              className="h-auto w-full max-w-[280px] rounded-[22px] shadow-[0_40px_70px_-30px_rgba(12,14,18,0.55)]"
            />
            <div className="text-center text-sm text-[#6B7280]">{GALLERY.phone.caption}</div>
          </Reveal>
        </div>
      </section>

      {/* ── Blog — the three newest real posts, in the handoff's card ────────── */}
      <section id="blog" className={`flex flex-col gap-9 border-t border-[#E8E8E4] py-24 lg:py-26 ${GUTTER}`}>
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHead
            eyebrow="From the blog"
            title="Latest from the blog"
            lede="Product deep-dives and campaigning playbooks."
          />
          <Link href="/blog" className="whitespace-nowrap text-base font-semibold text-[#2F6BFF]">
            View all posts →
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="flex flex-col gap-3 rounded-[14px] border border-[#E4E4DF] bg-white p-7 transition-all hover:-translate-y-0.5 hover:shadow-[0_30px_60px_-40px_rgba(12,14,18,0.4)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="rounded-full bg-[#E8F0FF] px-2.5 py-[5px] text-xs font-semibold text-[#2F6BFF]">
                  {post.category}
                </span>
                <span className={`${MONO} text-xs text-[#9AA0AA]`}>{post.readingTime}</span>
              </div>
              <div className="text-[22px] font-semibold leading-[1.2] tracking-[-0.015em] text-balance">
                {post.title}
              </div>
              <div className="text-[15px] leading-[1.55] text-[#6B7280]">{post.excerpt}</div>
              <div className="mt-auto flex justify-between gap-3 border-t border-[#EFEFEB] pt-3.5 text-[13px] text-[#8A8F98]">
                <span>{post.author.name}</span>
                <span>{formatPostDate(post.date)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────────────── */}
      <section
        // Inset rather than full-bleed: the handoff floats this panel inside the page gutter, so it
        // takes a margin where every other section takes padding.
        className="mx-6 mb-24 flex flex-col items-center gap-5 rounded-[20px] bg-[#2F6BFF] px-8 py-16 text-center text-white md:mx-12 md:px-16 md:py-20 lg:mx-[72px] lg:mb-26"
      >
        <h2 className="m-0 max-w-[20ch] text-[36px] font-bold leading-[1.02] tracking-[-0.035em] text-balance md:text-[46px] lg:text-[54px]">
          {CLOSING.title}
        </h2>
        <p className="m-0 max-w-[52ch] text-[17px] text-[#D3E0FF] md:text-[19px]">{CLOSING.lede}</p>
        <div className="pt-1.5">
          <CtaPair tone="onAccent" />
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      {/* The site-wide footer (components/Footer.tsx) — this design was promoted out of
          here to serve every route, so the markup now lives in one place. "flush" drops the
          max-w-7xl container and the top margin, because this page's sections are full-bleed
          at a 72px gutter and supply their own vertical rhythm. */}
      <Footer contained={false} spaced={false} />
    </div>
  );
}

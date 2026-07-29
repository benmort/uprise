import React from "react";
import Image from "next/image";
import { screen } from "@/lib/screens";

/**
 * The three product pillars as alternating prose/screenshot rows, each closing with the four
 * capabilities it rests on. Ported from the editorial homepage candidate (/homepage3) into the
 * shared library so /campaigners can carry the same argument.
 *
 * Styled from the design system rather than the candidate's own palette, so it sits correctly on any
 * marketing page. A pillar whose capture is missing renders as prose — never as a placeholder.
 */

export type Pillar = {
  eyebrow: string;
  title: string;
  body: string;
  chips: readonly string[];
  /** A `screens.json` key. */
  screen: string;
  /** Screenshot on the left instead of the right. */
  shotFirst?: boolean;
};

/** `inbox-dark` rather than `inbox`: the light inbox capture is an ngrok error page (screens.json). */
export const DEFAULT_PILLARS: readonly Pillar[] = [
  {
    eyebrow: "01 — Multichannel outreach",
    title: "One inbox for every reply your campaign gets",
    body: "Peer-to-peer SMS with live dual-channel preview and automatic opt-out checks. A browser softphone that dials from your campaign's own number. Every SMS and WhatsApp reply lands in one claimable queue, live, with audible alerts so nothing waits.",
    chips: ["P2P texting", "WebRTC softphone", "Claimable queue", "Canned replies"],
    screen: "inbox-dark",
  },
  {
    eyebrow: "02 — Field canvassing",
    title: "Cut turf at breakfast. Knock it by lunch.",
    body: "Draw turf on the map or pull it straight from meshblocks with live address counts, then build walk lists optimised on real walking distance. Volunteers work offline in an installable app that flushes the outbox the second signal returns.",
    chips: ["Meshblock turf", "Offline PWA", "Live action room", "Route optimisation"],
    screen: "turf",
    shotFirst: true,
  },
  {
    eyebrow: "03 — Data & insight",
    title: "Australian civic data, already loaded",
    body: "G-NAF addresses, ASGS geography, every federal, state and local division, sitting members and their policies – no procurement, no import. Layer your own audiences on top and read the electorate back through crosstabs and choropleth polling maps.",
    chips: ["G-NAF + ASGS", "Electorate polling", "CSV imports", "Action Network sync"],
    screen: "datasets",
  },
];

export default function PillarRows({
  pillars = DEFAULT_PILLARS,
}: {
  pillars?: readonly Pillar[];
}) {
  return (
    <>
      {pillars.map((p, i) => {
        const shot = screen(p.screen);
        const picture = shot ? (
          <Image
            src={shot.file}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            sizes="(min-width: 1024px) 60vw, 100vw"
            className="h-auto w-full rounded-2xl border border-stroke-secondary shadow-feature"
          />
        ) : null;

        return (
          <section key={p.title} className="py-12 md:py-16">
            <div className="container">
              <div
                className={`grid items-center gap-10 lg:gap-16 ${
                  p.shotFirst ? "lg:grid-cols-[1.15fr_0.85fr]" : "lg:grid-cols-[0.85fr_1.15fr]"
                }`}
              >
                {p.shotFirst && picture ? (
                  <div className="order-last lg:order-first">{picture}</div>
                ) : null}

                <div className="flex flex-col gap-4">
                  <span className="text-sm font-semibold uppercase tracking-wide text-primary">
                    {p.eyebrow}
                  </span>
                  <h2 className="text-3xl font-bold !leading-[1.15] text-title-color md:text-[40px]">
                    {p.title}
                  </h2>
                  <p className="text-base !leading-normal text-text-color-secondary md:text-lg">
                    {p.body}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1.5">
                    {p.chips.map((c) => (
                      <span
                        key={c}
                        className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-text-color"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {!p.shotFirst && picture ? <div>{picture}</div> : null}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}

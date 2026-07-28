import React from "react";
import Image from "next/image";
import { Reveal } from "@uprise/ui";
import { screen } from "@/lib/screens";

/**
 * The mapping highlight: the ABS census demographics map with the canvasser PWA inset against it —
 * the pair that used to sit under the hero headline. The hero now leads with the capability
 * showreel, so these move here, to the lower third, under the heading that already framed them
 * ("Real screens from the product — not mockups").
 *
 * The two shots earn their place together: the map is the piece of the product nothing else on the
 * page shows (national data, not a screen of the app), and the phone against it is what says the
 * same data reaches someone standing at a door.
 */
export default function HighlightMapping() {
  // The canvasser-app phone inset, when a real capture exists (see the slot below).
  const fieldShot = screen("field-walk");

  return (
    <section className="bg-[linear-gradient(180deg,#FFF_0%,#F9FAFB_100%)] py-16 md:py-24 lg:py-30">
      <div className="container">
        <Reveal>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-wide text-primary">
              See it working
            </span>
            <h2 className="text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
              The whole campaign, on one screen at a time
            </h2>
            <p className="mt-4 text-base !leading-normal text-text-color-secondary">
              Real screens from the product — not mockups. Every capture comes from a live Uprise
              workspace running on demo data.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="relative mx-auto w-full max-w-[860px]">
            <div className="mx-auto overflow-hidden rounded-t-xl border-[8px] border-white bg-white shadow-feature">
              <Image
                alt="Uprise — ABS census demographics mapped across Australia"
                src="/images/marketing/demographics-screenshot.png"
                width={1720}
                height={1024}
                className="h-auto w-full"
              />
            </div>

            {/* Floating phone — the canvasser PWA, captured at phone size by
                `pnpm marketing:shots`. Rendered ONLY when a real capture exists: the previous
                asset here was labelled "Uprise canvasser app" while actually showing the admin
                dashboard full of leftover template data, and it declared 410×554 for a 770×1490
                file so the frame cropped it. No screenshot beats the wrong screenshot. */}
            {fieldShot ? (
              <div
                className="absolute -bottom-6 right-2 w-[110px] overflow-hidden rounded-t-[14px] border-[6px] border-b-0 border-white bg-white shadow-[-24px_24px_70px_0px_rgba(16,24,40,0.18)] sm:right-4 sm:w-[140px] lg:-right-10 lg:w-[180px]"
                style={{ aspectRatio: `${fieldShot.width} / ${fieldShot.height}` }}
              >
                <Image
                  alt={fieldShot.alt}
                  src={fieldShot.file}
                  width={fieldShot.width}
                  height={fieldShot.height}
                  className="h-auto w-full"
                />
              </div>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

import React from "react";
import Link from "next/link";
import { Button } from "@uprise/ui";
import { authAppUrl } from "@/lib/links";
import MarketingLaunchpad from "./MarketingLaunchpad";

export default function Hero() {
  return (
    <section className="px-4 pt-20 sm:px-8 xl:px-12.5">
      {/* Symmetric padding now the card ends at the CTAs. The showreel that used to close it
          supplied its own pb-14/pb-16, so without this the buttons sit flush to the bottom edge.
          <Showreel /> lives in components/marketing/Showreel.tsx and is still rendered by
          /homepage3 — drop it back in here if the hero should lead with the product again. */}
      <div className="relative z-10 overflow-hidden rounded-3xl border border-stroke-secondary bg-gradient-to-br from-gray-50 via-primary-25 to-pink-50 py-14 md:py-16 lg:pt-24 lg:pb-24">
        {/* Soft blurred gradient blobs — brand blue + pink, kept minimal */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-[#465FFF] opacity-20 blur-[120px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-16 h-[460px] w-[460px] rounded-full bg-[#FFC1DF] opacity-40 blur-[130px]"
        />

        <div className="relative z-10 mx-auto px-4 sm:px-8 xl:px-0">
          <div className="text-center">
            <h1 className="mx-auto mb-5 w-full max-w-[820px] text-4xl font-bold !leading-[1.1] text-title-color sm:text-5xl lg:text-6xl">
              <span className="block">Every person.</span>
              <span className="block">Every channel.</span>
              <span className="block text-primary">One campaign.</span>
            </h1>
            <p className="mx-auto mb-9 w-full max-w-[680px] text-base text-text-color-secondary sm:text-lg">
              The all-in-one campaigning platform for progressive organisations.
            </p>

            <MarketingLaunchpad tone="light">
              <div className="flex flex-wrap justify-center gap-3.5">
                <a href={`${authAppUrl()}/sign-up`}>
                  <Button size="lg" className="cursor-pointer px-6 py-3">
                    Start a Campaign
                  </Button>
                </a>
                <Link href="/request-demo">
                  <Button variant="outline" size="lg" className="cursor-pointer px-6 py-3">
                    Request a Demo
                  </Button>
                </Link>
              </div>
            </MarketingLaunchpad>
          </div>
        </div>
      </div>
    </section>
  );
}

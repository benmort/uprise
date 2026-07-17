import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@uprise/ui";
import { authAppUrl } from "@/lib/links";
import MarketingLaunchpad from "./MarketingLaunchpad";

export default function Hero() {
  return (
    <section className="px-4 pt-20 sm:px-8 xl:px-12.5">
      <div className="relative z-10 overflow-hidden rounded-3xl border border-stroke-secondary bg-gradient-to-br from-gray-50 via-primary-25 to-pink-50 pt-14 md:pt-16 lg:pt-24">
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
              Built for Progress.
              <span className="block text-primary">Ready for Power.</span>
            </h1>
            <p className="mx-auto mb-9 w-full max-w-[680px] text-base text-text-color-secondary sm:text-lg">
              The all-in-one campaigning platform for progressive organisations –
              texting, calls, doorknocking, surveys, audiences and Australian
              data in one place.
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

            {/* Layered product shot */}
            <div className="mt-14 md:mt-16">
              <div className="relative mx-auto w-full max-w-[860px]">
                <div className="mx-auto overflow-hidden rounded-t-xl border-[8px] border-white bg-white shadow-feature">
                  <Image
                    alt="Uprise — ABS census demographics mapped across Australia"
                    src="/images/marketing/demographics-screenshot.png"
                    width={1720}
                    height={1024}
                    className="h-auto w-full"
                    priority
                  />
                </div>

                {/* Floating phone — scaled down and repositioned on small screens */}
                <div className="absolute -bottom-6 right-2 aspect-[204/277] w-[110px] overflow-hidden rounded-t-[14px] border-[6px] border-b-0 border-white bg-white shadow-[-24px_24px_70px_0px_rgba(16,24,40,0.18)] sm:right-4 sm:w-[140px] lg:-right-10 lg:w-[180px]">
                  <Image
                    alt="Uprise canvasser app"
                    src="/images/marketing/mobile-screenshot.png"
                    width={410}
                    height={554}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

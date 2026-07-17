import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@uprise/ui";
import { authAppUrl } from "@/lib/links";
import MarketingLaunchpad from "./MarketingLaunchpad";

export default function CTA() {
  return (
    <section className="overflow-hidden bg-white pt-16 md:pt-14 lg:pt-30">
      <div className="container">
        <div className="relative z-10 w-full justify-between overflow-hidden rounded-3xl bg-gray-800 px-8 pt-20 md:px-15 lg:flex">
          <div className="self-center pb-13 lg:max-w-[470px]">
            <span className="mb-3 block text-base text-gray-400">
              Ready to organise?
            </span>
            <h2 className="mb-9 text-2xl font-semibold text-white md:text-3xl">
              Every channel, every door, every volunteer{" "}
              – run your whole campaign from one place.
            </h2>
            <div className="mb-17.5">
              <MarketingLaunchpad tone="dark">
                <div className="flex flex-wrap gap-3">
                  <a href={`${authAppUrl()}/sign-up`}>
                    <Button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 text-base font-medium text-white shadow-xs duration-200 hover:bg-primary-600 max-sm:w-full cursor-pointer">
                      Start a Campaign
                    </Button>
                  </a>
                  <Link href="/request-demo">
                    <Button variant="outline" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-gray-600 bg-transparent px-5 py-3.5 text-base font-medium text-white shadow-xs duration-200 hover:border-gray-400 max-sm:w-full cursor-pointer">
                      Request a Demo
                    </Button>
                  </Link>
                </div>
              </MarketingLaunchpad>
            </div>

            <div className="flex gap-4 max-sm:flex-col sm:items-center">
              <div className="flex items-center -space-x-4">
                <div className="h-10 w-10 rounded-full border-[3px] border-gray-800 bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold">
                  A
                </div>
                <div className="h-10 w-10 rounded-full border-[3px] border-gray-800 bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-semibold">
                  B
                </div>
                <div className="h-10 w-10 rounded-full border-[3px] border-gray-800 bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                  C
                </div>
              </div>
              <div>
                <h3 className="text-base font-medium text-gray-200">
                  Built by campaigners, for campaigners
                </h3>
                <p className="text-sm text-gray-400">
                  SMS, calls, canvassing and data in one platform
                </p>
              </div>
            </div>
          </div>

          <div className="relative aspect-[540/370] max-w-[540px] self-end rounded-t-xl border-[8px] border-b-0 border-white shadow-[0px_0px_0px_1px_#E4E7EC,0px_18.824px_100px_0px_rgba(16,24,40,0.12)] overflow-hidden">
            <Image
              src="/images/marketing/dashboard-screenshot.png"
              alt="Campaign Dashboard Screenshot"
              width={540}
              height={370}
              className="h-full w-full object-cover object-top-left"
              priority
            />
          </div>

          <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
            <svg width="279" height="54" viewBox="0 0 279 54" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g opacity="0.05">
                <rect x="61.5217" y="1.9043" width="28.2498" height="28.2498" rx="5.02218" fill="#F9FAFB"/>
                <rect x="92.2825" y="1.9043" width="28.2498" height="28.2498" rx="5.02218" fill="white"/>
                <rect x="153.804" y="1.9043" width="28.2498" height="28.2498" rx="5.02218" fill="#F2F4F7"/>
                <rect x="215.326" y="1.9043" width="28.2498" height="28.2498" rx="5.02218" fill="#F9FAFB"/>
                <rect y="32.665" width="28.2498" height="28.2498" rx="5.02218" fill="#E4E7EC"/>
                <rect x="30.7607" y="32.665" width="28.2498" height="28.2498" rx="5.02218" fill="#F9FAFB"/>
                <rect x="61.5217" y="32.665" width="28.2498" height="28.2498" rx="5.02218" fill="white"/>
                <rect x="92.2825" y="32.665" width="28.2498" height="28.2498" rx="5.02218" fill="#F2F4F7"/>
                <rect x="123.043" y="32.665" width="28.2498" height="28.2498" rx="5.02218" fill="white"/>
                <rect x="184.565" y="32.665" width="28.2498" height="28.2498" rx="5.02218" fill="#E4E7EC"/>
                <rect x="246.087" y="32.665" width="28.2498" height="28.2498" rx="5.02218" fill="#F2F4F7"/>
              </g>
            </svg>
          </div>

          <div className="absolute bottom-0 right-0 -z-10">
            <svg width="569" height="431" viewBox="0 0 569 431" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g opacity="0.8" filter="url(#filter0_f_7188_2171)">
                <ellipse cx="206.703" cy="208.457" rx="206.703" ry="208.457" transform="matrix(-4.37114e-08 -1 -1 0.000935518 637.582 633.666)" fill="#465FFF"/>
              </g>
              <defs>
                <filter id="filter0_f_7188_2171" x="0.412903" y="0.2005" width="857.424" height="853.915" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                  <feGaussianBlur stdDeviation="110.127" result="effect1_foregroundBlur_7188_2171"/>
                </filter>
              </defs>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

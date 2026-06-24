import React from "react";
import Link from "next/link";
import { Button } from "@yarns/ui";
import Image from "next/image";
import { authAppUrl } from "@/lib/links";
import MarketingLaunchpad from "./MarketingLaunchpad";

export default function Hero() {
  return (
    <section className="overflow-hidden px-4 pt-20 sm:px-8 xl:px-12.5">
      <div className="relative z-10 overflow-hidden rounded-3xl bg-gradient-to-br from-gray-50 via-purple-50/30 to-pink-50/20 pt-12 md:pt-14 lg:pt-20">
        <div className="relative z-10 mx-auto px-4 sm:px-8 xl:px-0">
          <div className="text-center">
            <h1 className="mx-auto mb-4 w-full max-w-[810px] text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
              Built for Progress.<span className="block text-blue-600">Ready for Power.</span>
            </h1>
            <p className="mx-auto mb-9 w-full max-w-[1090px] text-gray-600">
              Progress is built together. We partner with organisations that drive change - and give them the tools to build the future.
            </p>

            <div className="mt-9">
              <MarketingLaunchpad tone="light">
                <div className="flex flex-wrap justify-center gap-3.5">
                  <a href={`${authAppUrl()}/sign-up`}>
                    <Button size="lg" className="px-6 py-3 cursor-pointer">
                      Start a Campaign
                    </Button>
                  </a>
                  <Link href="/request-demo">
                    <Button variant="outline" size="lg" className="px-6 py-3 cursor-pointer">
                      Request a Demo
                    </Button>
                  </Link>
                </div>
              </MarketingLaunchpad>
            </div>

            <div className="mt-15">
              <div className="relative mx-auto w-full max-w-[745px] max-lg:px-10">
                <div className="mx-auto overflow-hidden rounded-t-xl border-[8px] border-white bg-white shadow-[0px_0px_0px_1px_#E4E7EC,0px_18.824px_100px_0px_rgba(16,24,40,0.12)] transform hover:scale-[1.02] transition-transform duration-300">
                  <Image
                    alt="hero image"
                    src="/images/marketing/dashboard-screenshot.png"
                    width={1491}
                    height={682}
                    className="w-full h-auto"
                    priority
                  />
                </div>
                <div className="absolute -bottom-4 -right-[140px] aspect-[204/277] w-full max-w-[220px] overflow-hidden rounded-t-[12px] border-[1px] border-b-0 border-gray-200 bg-white shadow-[-35px_0px_100px_0px_rgba(16,24,40,0.15)] max-xl:-right-20 max-xl:max-w-[200px] max-lg:-right-16 max-lg:max-w-[160px] max-md:right-0 max-md:max-w-[120px]">
                  <Image
                    alt="mobile screenshot"
                    src="/images/marketing/mobile-screenshot.png"
                    width={410}
                    height={554}
                    className="w-full h-auto"
                  />
                </div>
                <div className="absolute left-0 top-1/2 aspect-[240/110] w-full max-w-[140px] -translate-y-1/2 overflow-hidden rounded-[12px] border border-gray-200 bg-white shadow-[0px_20px_60px_0px_rgba(16,24,40,0.12)] md:max-w-[170px] lg:-left-[120px] lg:max-w-[260px]">
                  <Image
                    alt="dashboard screenshot"
                    src="/images/marketing/demo-screenshot.png"
                    width={485}
                    height={218}
                    className="scale-[1.03] w-full h-auto"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative square lattice elements */}
        <div className="absolute bottom-32 left-0 max-sm:hidden opacity-60">
          <svg width="347" height="259" viewBox="0 0 347 259" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 259.921 2.32037)" fill="#F9FAFB"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 216.666 2.32037)" fill="white" className="drop-shadow-sm"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 130.156 2.32037)" fill="#F2F4F7"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 43.6455 2.32037)" fill="#F9FAFB"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 346.432 45.5755)" fill="#E4E7EC"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 303.177 45.5756)" fill="#F9FAFB"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 259.921 45.5756)" fill="white" className="drop-shadow-sm"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 216.666 45.5756)" fill="#F2F4F7"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 173.411 45.5756)" fill="white" className="drop-shadow-sm"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 86.9006 45.5756)" fill="#E4E7EC"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 0.390137 45.5756)" fill="#F2F4F7"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 303.177 88.8307)" fill="#F9FAFB"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 259.921 88.8307)" fill="#FCFCFD"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 216.666 88.8307)" fill="#E4E7EC"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 130.156 88.8307)" fill="#F2F4F7"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 43.6455 88.8307)" fill="white" className="drop-shadow-sm"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 346.432 132.086)" fill="#FCFCFD"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 303.177 132.086)" fill="#F9FAFB"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 259.921 132.086)" fill="white" className="drop-shadow-sm"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 303.177 175.341)" fill="#F9FAFB"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 259.921 175.341)" fill="#F9FAFB"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 346.432 218.596)" fill="#E4E7EC"/>
          </svg>
        </div>

        <div className="absolute bottom-0 right-0 max-sm:hidden opacity-50">
          <svg width="265" height="254" viewBox="0 0 265 254" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 261.578 2.32037)" fill="white" className="drop-shadow-sm"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 175.067 2.32037)" fill="#F2F4F7"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 88.5571 2.32037)" fill="#F9FAFB"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 304.833 45.5756)" fill="white" className="drop-shadow-sm"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 261.578 45.5756)" fill="#F2F4F7"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 218.323 45.5756)" fill="white" className="drop-shadow-sm"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 131.812 45.5756)" fill="#E4E7EC"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 45.3019 45.5756)" fill="#F2F4F7"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 218.323 88.8307)" fill="#E4E7EC"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 131.812 88.8307)" fill="#F2F4F7"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 45.302 88.8307)" fill="white" className="drop-shadow-sm"/>
            <rect width="39.7241" height="39.7241" rx="7.06207" transform="matrix(-1 0 0 1 304.833 132.086)" fill="white" className="drop-shadow-sm"/>
          </svg>
        </div>

        {/* Gradient background elements */}
        <div className="absolute bottom-0 left-0 max-sm:hidden">
          <svg width="917" height="869" viewBox="0 0 917 869" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g filter="url(#filter0_f_7197_9529)">
              <ellipse cx="323.426" cy="326.376" rx="323.426" ry="326.376" transform="matrix(0.000466991 -1 -1 0.000468476 696.281 1166.6)" fill="#FFC1DF"/>
            </g>
            <g filter="url(#filter1_f_7197_9529)">
              <path d="M-455.306 292.846C-159.037 174.102 205.702 361.709 306.451 898.807C103.14 400.454 -233.88 395.171 -485.042 441.469L-455.306 292.846Z" fill="white" fillOpacity="0.85"/>
            </g>
            <g filter="url(#filter2_f_7197_9529)">
              <path d="M-315.677 172.699C-132.883 41.6477 148.251 108.739 307.461 459.366C84.5756 152.49 -146.949 205.513 -311.049 279.405L-315.677 172.699Z" fill="white" fillOpacity="0.85"/>
            </g>
            <g filter="url(#filter3_f_7197_9529)">
              <path d="M-442.587 575.724C-206.231 484.481 81.3626 637.086 155.88 1064.41C-0.434339 666.798 -267.877 659.186 -467.696 693.385L-442.587 575.724Z" fill="url(#paint0_linear_7197_9529)" fillOpacity="0.7"/>
            </g>
            <g filter="url(#filter4_f_7197_9529)">
              <path d="M-479.618 758.431C-229.782 720.92 16.6685 932.545 -4.12046 1365.8C-69.3864 943.706 -405.532 1296.24 -607.374 1286.05L-479.618 758.431Z" fill="white" fillOpacity="0.8"/>
            </g>
            <defs>
              <filter id="filter0_f_7197_9529" x="-176.575" y="299.645" width="1093.26" height="1087.36" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                <feGaussianBlur stdDeviation="110.127" result="effect1_foregroundBlur_7197_9529"/>
              </filter>
              <filter id="filter1_f_7197_9529" x="-595.169" y="148.507" width="1011.75" height="860.428" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                <feGaussianBlur stdDeviation="55.0636" result="effect1_foregroundBlur_7197_9529"/>
              </filter>
              <filter id="filter2_f_7197_9529" x="-425.804" y="0.362518" width="843.392" height="569.131" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                <feGaussianBlur stdDeviation="55.0636" result="effect1_foregroundBlur_7197_9529"/>
              </filter>
              <filter id="filter3_f_7197_9529" x="-544.785" y="473.227" width="777.754" height="668.27" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                <feGaussianBlur stdDeviation="38.5445" result="effect1_foregroundBlur_7197_9529"/>
              </filter>
              <filter id="filter4_f_7197_9529" x="-739.527" y="622.031" width="868.788" height="875.924" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                <feGaussianBlur stdDeviation="66.0764" result="effect1_foregroundBlur_7197_9529"/>
              </filter>
              <linearGradient id="paint0_linear_7197_9529" x1="-253.223" y1="634.966" x2="467.225" y2="1406.48" gradientUnits="userSpaceOnUse">
                <stop stopColor="white"/>
                <stop offset="1" stopColor="white" stopOpacity="0"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <svg width="1022" height="548" viewBox="0 0 1022 548" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g opacity="0.5" filter="url(#filter0_f_7197_9535)">
              <ellipse cx="312.284" cy="314.935" rx="312.284" ry="314.935" transform="matrix(-4.37114e-08 -1 -1 0.000935518 850.3 845.316)" fill="#465FFF"/>
            </g>
            <defs>
              <filter id="filter0_f_7197_9535" x="0.176331" y="0.787582" width="1070.38" height="1065.08" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                <feGaussianBlur stdDeviation="110.127" result="effect1_foregroundBlur_7197_9535"/>
              </filter>
            </defs>
          </svg>
        </div>

        <div className="absolute bottom-0 right-0 max-sm:hidden">
          <svg width="1302" height="477" viewBox="0 0 1302 477" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g filter="url(#filter0_f_7197_9445)">
              <path d="M425.913 425.13H1289.98V1306.34L902.751 1573.97L425.913 425.13Z" fill="#465FFF"/>
            </g>
            <defs>
              <filter id="filter0_f_7197_9445" x="0.912842" y="0.129944" width="1714.07" height="1998.84" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                <feGaussianBlur stdDeviation="212.5" result="effect1_foregroundBlur_7197_9445"/>
              </filter>
            </defs>
          </svg>
        </div>
      </div>
    </section>
  );
}

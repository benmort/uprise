"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import { LogoMark } from "@uprise/ui";
import { GridShape } from "./grid-shape";

/** Uprise brand mark (the capital-U block + wordmark, for the dark panel). */
function BrandMark() {
  return (
    <div className="flex items-center justify-center gap-2">
      <LogoMark className="h-8 w-8 text-brand-500" />
      <span className="text-2xl font-bold text-white">Uprise</span>
    </div>
  );
}

/**
 * Right-hand brand panel (lg+ only). Dark brand-950 with the grid pattern and the
 * Uprise mark + tagline; on sign-up it shows the onboarding illustration.
 */
export function AuthBrandSidebar() {
  const pathname = usePathname();
  const isSignUp = pathname?.startsWith("/sign-up");

  return (
    <div className="relative hidden w-1/2 items-center justify-center overflow-hidden bg-brand-950 lg:flex">
      <GridShape />
      {/* On sign-up the column widens with the panel so the illustration can grow; the copy keeps
          its own narrow measure so the lines don't stretch with it. w-full matters: as a bare flex
          item the column shrink-wraps to its widest line of text (~274px), and then the
          illustration's own max-widths never bind. */}
      {isSignUp ? (
        <div className="relative z-10 flex w-full max-w-xl flex-col items-center px-6 xl:max-w-2xl">
          <p className="mb-1 max-w-xs text-center font-medium text-gray-300">Welcome to</p>
          <BrandMark />
          {/* Roughly 2× what this rendered at before (274px). No breakpoint below lg is needed —
              the whole panel is `hidden lg:flex` — and the caps only bite on wide screens, since
              w-full already limits the column to half the viewport. */}
          <Image
            src="/images/onboarding-1.png"
            alt=""
            width={548}
            height={561}
            className="h-auto w-full"
          />
          <p className="max-w-xs text-center font-medium text-gray-300">
            Set up your organisation&apos;s account
          </p>
        </div>
      ) : (
        <div className="relative z-10 flex max-w-xs flex-col items-center gap-4">
          <BrandMark />
          <p className="text-center font-medium text-gray-300">
            Built for Progress. Ready for Power.
          </p>
        </div>
      )}
    </div>
  );
}

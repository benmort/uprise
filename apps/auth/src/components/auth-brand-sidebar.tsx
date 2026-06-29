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
      {isSignUp ? (
        <div className="relative z-10 flex max-w-xs flex-col items-center">
          <p className="mb-1 text-center font-medium text-gray-300">Welcome to</p>
          <BrandMark />
          <Image
            src="/images/onboarding-1.png"
            alt=""
            width={548}
            height={561}
            className="h-auto w-auto max-w-full"
          />
          <p className="text-center font-medium text-gray-300">
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

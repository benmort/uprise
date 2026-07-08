'use client';

import Image from 'next/image';
import { LOGOS } from './logos';

/**
 * LogoRow Component
 *
 * Static "trusted by" layout for a SMALL supporter set (~4-5) where a scrolling
 * carousel looks sparse. No animation: logos are laid out centered and evenly
 * spaced, wrapping on narrow screens. Shares the LOGOS list with LogoCarousel.
 *
 * Differences from LogoCarousel:
 * - No scroll animation / no duplicated set
 * - Images render 30% larger (carousel h-8 = 32px -> h-[2.6rem] = 41.6px)
 * - Same grayscale -> colour on hover, same fade... n/a (no edge fade needed)
 *
 * Usage:
 * <LogoRow />
 */

export default function LogoRow() {
  return (
    <section className="pt-16">
      <div className="container">
        <div className="w-full">
          <h2 className="mb-8 text-center text-lg font-medium text-blue-600 dark:text-blue-400">
            Trusted by progressive Australian campaigns, nonprofits, and causes
          </h2>

          <div className="mb-13 flex flex-wrap items-center justify-center gap-x-12 gap-y-8 md:gap-x-16 lg:gap-x-20">
            {LOGOS.map((logo, index) => (
              <div key={index} className="inline-flex items-center justify-center flex-shrink-0">
                <Image
                  alt={logo.alt}
                  src={logo.src}
                  width={logo.width}
                  height={logo.height}
                  className="h-[2.6rem] w-auto opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

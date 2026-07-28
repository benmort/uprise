'use client';

import Image from 'next/image';
import { VISIBLE_LOGOS } from './logos';
import LogoRow from './LogoRow';

/**
 * Below this, scrolling is worse than not scrolling: the loop can only be filled by repeating the
 * same marks, so a visitor watches two supporters cycle past pretending to be many. A centred
 * static row states the same thing honestly — that's <LogoRow />.
 */
const MIN_LOGOS_TO_SCROLL = 4;

/**
 * The loop works by translating the track -50%, which only reads as continuous if a single half
 * already overflows the container — so the half is repeated until it is wide enough. Only reached
 * with four or more supporters; below that the static row runs instead.
 */
const MIN_ITEMS_PER_HALF = 8;
const track = Array.from(
  { length: Math.max(1, Math.ceil(MIN_ITEMS_PER_HALF / Math.max(VISIBLE_LOGOS.length, 1))) },
  () => VISIBLE_LOGOS,
).flat();

/**
 * LogoCarousel Component
 * 
 * A continuous scrolling logo carousel with fade effects on both sides.
 * Features:
 * - Smooth horizontal scrolling animation
 * - Fade effects on left and right edges using CSS mask
 * - Grayscale logos that become colored on hover
 * - Responsive design with proper spacing
 * - Seamless infinite loop with duplicated logos
 * 
 * Usage:
 * <LogoCarousel />
 */

export default function LogoCarousel() {
  // No visible supporters → render nothing rather than an empty animated strip under a heading.
  if (VISIBLE_LOGOS.length === 0) return null;
  // Too few to loop without repeating them → centred row, no animation, no duplicates.
  if (VISIBLE_LOGOS.length < MIN_LOGOS_TO_SCROLL) return <LogoRow />;
  return (
    <section className="pt-16">
      <div className="container">
        <div className="w-full">
          <h2 className="mb-8 text-center text-lg font-medium text-blue-600 dark:text-blue-400">
            Trusted by progressive Australian campaigns, nonprofits, and causes
          </h2>
          
          <div 
            className="relative mb-13 overflow-hidden"
            style={{
              maskImage: 'linear-gradient(to right, transparent, black 20%, black 80%, transparent)',
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 20%, black 80%, transparent)'
            }}
          >
            <div className="flex animate-scroll whitespace-nowrap">
              {/* First half */}
              {track.map((logo, index) => (
                <div key={`first-${index}`} className="inline-flex items-center justify-center px-8 flex-shrink-0">
                  <Image
                    alt={logo.alt}
                    src={logo.src}
                    width={logo.width}
                    height={logo.height}
                    className="h-8 w-auto opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300"
                    loading="lazy"
                    unoptimized={logo.src.endsWith('.svg')}
                  />
                </div>
              ))}
              
              {/* Duplicate half for the seamless loop */}
              {track.map((logo, index) => (
                <div key={`second-${index}`} className="inline-flex items-center justify-center px-8 flex-shrink-0">
                  <Image
                    alt={logo.alt}
                    src={logo.src}
                    width={logo.width}
                    height={logo.height}
                    className="h-8 w-auto opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300"
                    loading="lazy"
                    unoptimized={logo.src.endsWith('.svg')}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

'use client';

import Image from 'next/image';
import { LOGOS } from './logos';

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
              {/* First set of logos */}
              {LOGOS.map((logo, index) => (
                <div key={`first-${index}`} className="inline-flex items-center justify-center px-8 flex-shrink-0">
                  <Image
                    alt={logo.alt}
                    src={logo.src}
                    width={logo.width}
                    height={logo.height}
                    className="h-8 w-auto opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300"
                    loading="lazy"
                  />
                </div>
              ))}
              
              {/* Duplicate set for seamless loop */}
              {LOGOS.map((logo, index) => (
                <div key={`second-${index}`} className="inline-flex items-center justify-center px-8 flex-shrink-0">
                  <Image
                    alt={logo.alt}
                    src={logo.src}
                    width={logo.width}
                    height={logo.height}
                    className="h-8 w-auto opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300"
                    loading="lazy"
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

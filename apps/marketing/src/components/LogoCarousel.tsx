'use client';

import Image from 'next/image';

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

interface Logo {
  alt: string;
  src: string;
  width: number;
  height: number;
}

const LOGOS: Logo[] = [
  { alt: 'Progressive Action Network', src: '/images/logos/progressive-action-network.svg', width: 200, height: 38 },
  { alt: 'Community First Australia', src: '/images/logos/community-first-australia.svg', width: 190, height: 38 },
  { alt: 'Future Forward Foundation', src: '/images/logos/future-forward-foundation.svg', width: 200, height: 38 },
  { alt: 'Equality Now Australia', src: '/images/logos/equality-now-australia.svg', width: 180, height: 38 },
  { alt: 'Climate Action Collective', src: '/images/logos/climate-action-collective.svg', width: 200, height: 38 },
  { alt: 'Social Justice Alliance', src: '/images/logos/social-justice-alliance.svg', width: 170, height: 38 },
  { alt: 'Rights First Australia', src: '/images/logos/rights-first-australia.svg', width: 170, height: 38 },
  { alt: 'Progressive Change Institute', src: '/images/logos/progressive-change-institute.svg', width: 220, height: 38 },
  { alt: 'Community Impact Network', src: '/images/logos/community-impact-network.svg', width: 200, height: 38 },
  { alt: 'Future Generations Fund', src: '/images/logos/future-generations-fund.svg', width: 190, height: 38 },
  { alt: 'Social Progress Australia', src: '/images/logos/social-progress-australia.svg', width: 200, height: 38 },
];

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

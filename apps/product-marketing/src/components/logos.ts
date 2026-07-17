/**
 * Shared supporter logo list, consumed by both LogoCarousel (scrolling, for a
 * large set) and LogoRow (static layout, for ~4-5). Single source of truth so
 * adding/removing a supporter updates both.
 *
 * Real supporters — official brand logos sourced from each org's own site.
 * width/height are the assets' intrinsic pixel sizes (CSS controls display height).
 * To upgrade a logo, drop a new file at the same /images/logos/<slug> path.
 */
export interface Logo {
  alt: string;
  src: string;
  width: number;
  height: number;
}

export const LOGOS: Logo[] = [
  // NB: australian-progress uses the COLOUR .png (white-legible), not the .webp — that
  // variant is white-on-transparent and vanishes on this section's white background.
  { alt: 'Australian Progress', src: '/images/logos/australian-progress.png', width: 1200, height: 295 },
  { alt: 'Climate 200', src: '/images/logos/climate-200.png', width: 1353, height: 293 },
  { alt: 'Common Threads', src: '/images/logos/common-threads.webp', width: 582, height: 311 },
  { alt: 'Democracy in Colour', src: '/images/logos/democracy-in-colour.png', width: 1024, height: 147 },
  { alt: 'Gellung Warl', src: '/images/logos/gellung-warl.png', width: 1128, height: 514 },
  { alt: 'GetUp', src: '/images/logos/getup.png', width: 1024, height: 1024 },
  { alt: 'Victoria Trades Hall', src: '/images/logos/victoria-trades-hall.svg', width: 827, height: 377 },
];

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
  { alt: 'Common Threads', src: '/images/logos/common-threads.webp', width: 582, height: 311 },
  { alt: 'Australian Progress', src: '/images/logos/australian-progress.webp', width: 1200, height: 295 },
  { alt: 'GetUp', src: '/images/logos/getup.png', width: 1024, height: 1024 },
  { alt: 'Climate 200', src: '/images/logos/climate-200.png', width: 1353, height: 293 },
];

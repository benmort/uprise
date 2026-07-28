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
  /**
   * Kept in this list but not rendered. Hidden rather than deleted so the asset paths and
   * intrinsic sizes survive — restoring a supporter is deleting this one line, not re-sourcing
   * the logo. Give a reason when you set it.
   */
  hidden?: boolean;
}

export const LOGOS: Logo[] = [
  // NB: australian-progress uses the COLOUR .png (white-legible), not the .webp — that
  // variant is white-on-transparent and vanishes on this section's white background.
  { alt: 'Australian Progress', src: '/images/logos/australian-progress.png', width: 1200, height: 295 },
  { alt: 'Common Threads', src: '/images/logos/common-threads.webp', width: 582, height: 311 },
  // Hidden until each org has confirmed we may use their mark on the site. The entries stay so
  // showing one again is a one-line change.
  { alt: 'Climate 200', src: '/images/logos/climate-200.png', width: 1353, height: 293, hidden: true },
  { alt: 'Democracy in Colour', src: '/images/logos/democracy-in-colour.png', width: 1024, height: 147, hidden: true },
  { alt: 'Gellung Warl', src: '/images/logos/gellung-warl.png', width: 1128, height: 514, hidden: true },
  { alt: 'GetUp', src: '/images/logos/getup.png', width: 1024, height: 1024, hidden: true },
  { alt: 'Victoria Trades Hall', src: '/images/logos/victoria-trades-hall.svg', width: 827, height: 377, hidden: true },
];

/** The logos actually rendered. Both the carousel and the static row read this, never LOGOS. */
export const VISIBLE_LOGOS: Logo[] = LOGOS.filter((logo) => !logo.hidden);

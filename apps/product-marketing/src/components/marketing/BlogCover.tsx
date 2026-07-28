import React from "react";
import Image from "next/image";
import {
  BarChart3,
  BookOpen,
  MapPin,
  Megaphone,
  MessageSquareText,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { BlogCoverTone } from "@/lib/blog";

/** Per-post colour, now carried by the scrim over the photo rather than by the background
 *  itself. Kept so the six posts still read as distinct and on-brand. */
const TONES: Record<string, string> = {
  blue: "from-brand-900/85",
  violet: "from-violet-900/85",
  pink: "from-rose-900/85",
  green: "from-teal-900/85",
  amber: "from-orange-900/85",
  cyan: "from-sky-900/85",
};

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Product: BookOpen,
  Canvassing: MapPin,
  Outreach: MessageSquareText,
  Playbook: Megaphone,
  Data: BarChart3,
  Organising: Users,
};

/**
 * Category photography, self-hosted in `public/images/blog/` rather than hot-linked, so a cover
 * never depends on a third-party CDN being up and `next/image` can optimise it. All six are
 * Unsplash, whose licence allows commercial use without attribution; the source photo ids are
 * recorded here so a cover can be traced or re-cropped later.
 *   canvassing  photo-1524813686514-a57563d77965   aerial suburban street
 *   outreach    photo-1522125670776-3c7abb882bc2   texting on a phone
 *   product     photo-1754548930574-6a995e5eb5a7   ticking boxes on a tablet
 *   playbook    photo-1743385779431-45d26d9775b1   clipboard, pencil and marker
 *   data        photo-1642948327606-72537526c82b   people reading a street map
 *   organising  photo-1560220604-1985ebfe28b1      volunteers in branded shirts
 */
const CATEGORY_IMAGE: Record<string, { src: string; alt: string }> = {
  Canvassing: { src: "/images/blog/canvassing.jpg", alt: "Aerial view of a suburban street" },
  Outreach: { src: "/images/blog/outreach.jpg", alt: "Someone sending a text message" },
  Product: { src: "/images/blog/product.jpg", alt: "Ticking boxes on a tablet" },
  Playbook: { src: "/images/blog/playbook.jpg", alt: "A clipboard, pencil and marker on a desk" },
  Data: { src: "/images/blog/data.jpg", alt: "People reading a street map" },
  Organising: { src: "/images/blog/organising.jpg", alt: "Volunteers in branded shirts" },
};

const FALLBACK_IMAGE = CATEGORY_IMAGE.Canvassing;

/**
 * Blog cover keyed by tone + category: a category photograph behind a tone-tinted scrim, with
 * the same soft shapes, icon tile and title the gradient covers had. `size="card"` for grid
 * thumbnails, `size="hero"` for the post detail banner.
 *
 * The scrim is not decoration – it is what keeps the white text and shapes legible over an
 * arbitrary photo. Both the card and hero crops rely on it, so a photo swap needs no other change.
 */
export default function BlogCover({
  tone,
  category,
  title,
  size = "card",
  priority,
}: {
  tone: BlogCoverTone | string;
  category: string;
  title?: string;
  size?: "card" | "hero";
  /** Eager-load this cover. Defaults on for the hero; set it on any card that lands above the
   *  fold (the blog index's featured post), which would otherwise lazy-load the LCP image. */
  priority?: boolean;
}) {
  const scrim = TONES[tone] ?? TONES.blue;
  const Icon = CATEGORY_ICON[category] ?? BookOpen;
  const image = CATEGORY_IMAGE[category] ?? FALLBACK_IMAGE;
  const isHero = size === "hero";
  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-slate-900 ${
        isHero ? "p-10 md:p-16" : "p-8"
      }`}
    >
      <Image
        src={image.src}
        alt={image.alt}
        fill
        // Cards sit in a 3-up grid, the hero spans the article column – so a card never
        // downloads the hero-sized crop.
        sizes={isHero ? "(min-width: 768px) 800px, 100vw" : "(min-width: 768px) 400px, 100vw"}
        className="object-cover"
        priority={priority ?? isHero}
      />
      {/* Legibility scrim, in two layers. The flat one knocks the whole photo back so the icon
          tile and the soft shapes read against a bright frame; the tone gradient then weights the
          bottom, where the title and category sit. */}
      <div className="absolute inset-0 bg-slate-950/35" />
      <div className={`absolute inset-0 bg-gradient-to-t ${scrim} via-transparent to-transparent`} />

      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-10 -left-6 h-32 w-32 rotate-12 rounded-2xl bg-white/10" />
      <div
        className={`relative inline-flex items-center justify-center rounded-2xl bg-white/15 backdrop-blur ${
          isHero ? "h-16 w-16" : "h-12 w-12"
        }`}
      >
        <Icon className={isHero ? "h-8 w-8 text-white" : "h-6 w-6 text-white"} />
      </div>
      {isHero && title ? (
        <p className="relative mt-6 max-w-3xl text-2xl font-bold !leading-tight text-white drop-shadow-sm md:text-4xl">
          {title}
        </p>
      ) : (
        <span className="relative text-sm font-semibold uppercase tracking-wide text-white/90 drop-shadow-sm">
          {category}
        </span>
      )}
    </div>
  );
}

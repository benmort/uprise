import React from "react";
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

const TONES: Record<string, string> = {
  blue: "from-brand-500 to-brand-700",
  violet: "from-violet-500 to-violet-700",
  pink: "from-pink-500 to-rose-600",
  green: "from-emerald-500 to-teal-600",
  amber: "from-amber-400 to-orange-500",
  cyan: "from-cyan-500 to-sky-600",
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
 * Self-contained gradient blog cover (no external images) keyed by tone + category.
 * `size="card"` for grid thumbnails, `size="hero"` for the post detail banner.
 */
export default function BlogCover({
  tone,
  category,
  title,
  size = "card",
}: {
  tone: BlogCoverTone | string;
  category: string;
  title?: string;
  size?: "card" | "hero";
}) {
  const grad = TONES[tone] ?? TONES.blue;
  const Icon = CATEGORY_ICON[category] ?? BookOpen;
  const isHero = size === "hero";
  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br ${grad} ${
        isHero ? "p-10 md:p-16" : "p-8"
      }`}
    >
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
        <p className="relative mt-6 max-w-3xl text-2xl font-bold !leading-tight text-white md:text-4xl">
          {title}
        </p>
      ) : (
        <span className="relative text-sm font-semibold uppercase tracking-wide text-white/90">
          {category}
        </span>
      )}
    </div>
  );
}

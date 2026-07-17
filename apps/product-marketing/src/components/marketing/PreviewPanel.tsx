import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * On-brand abstract product preview — a browser-framed gradient panel with an icon,
 * label and capability chips. Deliberately NOT a fabricated screenshot with fake
 * data; it represents a feature honestly where no real screenshot fits.
 */
const TONES: Record<string, string> = {
  blue: "from-brand-500 to-brand-700",
  violet: "from-violet-500 to-violet-700",
  pink: "from-pink-500 to-rose-600",
  green: "from-emerald-500 to-teal-600",
  amber: "from-amber-400 to-orange-500",
  cyan: "from-cyan-500 to-sky-600",
};

export default function PreviewPanel({
  tone = "blue",
  icon: Icon,
  label,
  chips = [],
  className = "",
}: {
  tone?: string;
  icon: LucideIcon;
  label: string;
  chips?: string[];
  className?: string;
}) {
  const grad = TONES[tone] ?? TONES.blue;
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-stroke-secondary bg-white shadow-feature ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b border-[#F2F4F7] bg-gray-50 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <span className="h-3 w-3 rounded-full bg-[#28C840]" />
      </div>
      <div className={`relative bg-gradient-to-br ${grad} p-8`}>
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <Icon className="h-7 w-7 text-white" />
        </div>
        <p className="text-xl font-bold text-white">{label}</p>
        {chips.length ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium text-white backdrop-blur"
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-6 space-y-2">
          <div className="h-2.5 w-3/4 rounded-full bg-white/25" />
          <div className="h-2.5 w-1/2 rounded-full bg-white/20" />
          <div className="h-2.5 w-2/3 rounded-full bg-white/15" />
        </div>
      </div>
    </div>
  );
}

"use client";

import type { TurfUniverse } from "@/lib/api/geo";
import { SectionCard } from "@uprise/field";

/** The three cut-with universes – previously copy-pasted on every cut surface. */
export const UNIVERSE_OPTIONS: Array<{ id: TurfUniverse; label: string; desc: string }> = [
  { id: "hybrid", label: "Hybrid – recommended", desc: "Existing contacts plus cold addresses." },
  { id: "none", label: "Addresses without contacts", desc: "Cold doors with no prior record." },
  { id: "existing", label: "Existing contacts only", desc: "Bucket only people already in your data." },
];

/** Compact `<select>` variant (list-mode toolbars). */
export function UniverseSelect({
  value,
  onChange,
  className,
}: {
  value: TurfUniverse;
  onChange: (u: TurfUniverse) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cut with</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TurfUniverse)}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
        title="Which addresses land in the turf when you cut it"
      >
        <option value="hybrid">Existing + cold doors</option>
        <option value="none">Cold doors only</option>
        <option value="existing">Existing contacts only</option>
      </select>
    </div>
  );
}

/** Card variant (map-mode sidebars). */
export function UniverseCards({
  value,
  onChange,
}: {
  value: TurfUniverse;
  onChange: (u: TurfUniverse) => void;
}) {
  return (
    <SectionCard title="Universe">
      <div className="space-y-2">
        {UNIVERSE_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`w-full rounded-xl border p-3 text-left text-sm transition ${
              value === o.id
                ? "border-primary bg-primary/10 dark:bg-primary/20"
                : "border-border bg-surface hover:bg-surface-variant"
            }`}
          >
            <span className="block font-semibold text-foreground">{o.label}</span>
            <span className="block text-xs text-muted-foreground">{o.desc}</span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

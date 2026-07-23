import { cn } from "@/lib/utils";

// The "via {source}" origin pill shown against each resolved feature flag. Shared by the network
// flags page (/super/flags) and the tenant flags page so the source→tint mapping lives once.
const SOURCE_STYLES: Record<string, string> = {
  env: "bg-warning/15 text-warning-foreground",
  tenant: "bg-primary/15 text-primary",
  network: "bg-accent/15 text-accent-foreground",
  plan: "bg-accent/15 text-accent-foreground",
  global: "bg-info/15 text-info",
  default: "bg-surface-variant text-muted-foreground",
};

/** Tinted pill naming where a flag's resolved value came from (env / tenant / network / …). */
export function FlagSourceBadge({ source, className }: { source: string; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px]",
        SOURCE_STYLES[source] ?? SOURCE_STYLES.default,
        className,
      )}
    >
      via {source}
    </span>
  );
}

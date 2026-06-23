import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime, type ActivityItem } from "@/lib/activity/recent-activity";

export type { ActivityItem };

/** Cross-domain recent-activity list (blasts, inbound replies, door knocks…). */
export function ActivityFeed({ items, loading }: { items: ActivityItem[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No recent activity yet.</p>;
  }
  return (
    <ul className="divide-y divide-[hsl(var(--muted))]">
      {items.map((item) => {
        const row = (
          <div className="flex items-center gap-3 py-2.5">
            {item.icon ? <span className="shrink-0 text-muted-foreground">{item.icon}</span> : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.label}</p>
              {item.sublabel ? (
                <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p>
              ) : null}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {relativeTime(item.at)}
            </span>
          </div>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="block rounded-md px-1 hover:bg-surface-variant/60">
                {row}
              </Link>
            ) : (
              <div className="px-1">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

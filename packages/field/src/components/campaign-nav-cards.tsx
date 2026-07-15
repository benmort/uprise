import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  ListChecks,
  Map as MapIcon,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string; desc: string; icon: LucideIcon };

/** The campaign sub-page links, rendered as prominent cards. Shared by the canvass
 *  overview and the campaigns index so the two never drift. */
export function CampaignNavCards({ campaignId, className, id }: { campaignId: string; className?: string; id?: string }) {
  const items: NavItem[] = [
    { href: `/canvass/${campaignId}/turf`, label: "Cut turf", desc: "Claim areas & boundaries", icon: MapIcon },
    { href: `/canvass/${campaignId}/live`, label: "Live action room", desc: "Real-time door activity", icon: Activity },
    { href: `/canvass/${campaignId}/results`, label: "Results", desc: "Support & contact rates", icon: BarChart3 },
    { href: `/canvass/${campaignId}/goals`, label: "Goals", desc: "Targets & progress", icon: Target },
    { href: `/canvass/${campaignId}/shifts`, label: "Shifts", desc: "Schedule & sign-ups", icon: CalendarClock },
    { href: `/canvass/${campaignId}/qa`, label: "QA", desc: "Flagged knocks to review", icon: ClipboardCheck },
    { href: `/canvass/${campaignId}/volunteers`, label: "Volunteers", desc: "Team & assignments", icon: Users },
    { href: `/canvass/${campaignId}/walklists`, label: "Walk lists", desc: "Build & assign door routes", icon: ListChecks },
  ];
  return (
    <div id={id} className={`grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 ${className ?? ""}`}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm transition hover:border-primary hover:shadow-card"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20 text-primary">
            <item.icon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">{item.label}</span>
            <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
          </span>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      ))}
    </div>
  );
}

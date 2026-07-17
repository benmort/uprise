import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./button";

type EmptyStateProps = {
  title: string;
  description: string;
  /** Optional leading icon centred above the title. */
  icon?: LucideIcon;
  ctaLabel?: string;
  onCta?: () => void;
  /** Custom action node — rendered in place of the ctaLabel button when provided. */
  action?: ReactNode;
};

export function EmptyState({ title, description, icon: Icon, ctaLabel, onCta, action }: EmptyStateProps) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/60 px-4 py-8 text-center">
      {Icon ? <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /> : null}
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
      {action ? (
        <div className="mt-4 flex justify-center">{action}</div>
      ) : ctaLabel && onCta ? (
        <Button className="mt-4" onClick={onCta}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}

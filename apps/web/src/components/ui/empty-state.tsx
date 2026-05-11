import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
};

export function EmptyState({ title, description, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/60 px-4 py-8 text-center">
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
      {ctaLabel && onCta ? (
        <Button className="mt-4" onClick={onCta}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}

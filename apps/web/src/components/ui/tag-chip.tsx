import { cn } from "@/lib/utils";

export function TagChip({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-label text-foreground",
        onClick ? "hover:bg-surface-variant" : "",
        className,
      )}
      {...(onClick ? { type: "button", onClick } : {})}
    >
      {label}
    </Comp>
  );
}

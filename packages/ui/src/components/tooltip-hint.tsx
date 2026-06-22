import { HelpCircle } from "lucide-react";

export function TooltipHint({ label }: { label: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle">
      <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-56 -translate-x-1/2 rounded border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm group-hover:block">
        {label}
      </span>
    </span>
  );
}

"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Extra work when the field is cleared (beyond emptying the value). */
  onClear?: () => void;
  /** Class for the relative wrapper (width/flex), vs `className` on the input itself. */
  wrapperClassName?: string;
  /** A document-level shortcut (e.g. `"/"`) that focuses this field — ignored while the
   *  user is typing in another input/textarea/contenteditable. */
  focusKey?: string;
};

/**
 * The standard app search field: a leading magnifier and a trailing clear "×" that
 * appears once there's text (the Areas/Places search pattern). Adopted across search
 * bars and sidebar/menu filters so clearing is one click everywhere. Controlled —
 * pass `value` + `onValueChange`.
 *
 * The wrapper carries a MINIMUM width: in a crowded `flex-wrap` toolbar the field
 * wraps to the row below instead of squashing into an unusable sliver. Override
 * via `wrapperClassName` (a `min-w-*` there wins) for genuinely tight slots.
 */
export function SearchInput({
  value,
  onValueChange,
  onClear,
  wrapperClassName,
  focusKey,
  className,
  ...props
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== focusKey || e.metaKey || e.ctrlKey || e.altKey) return;
      // Never steal the key from a field the user is already typing in.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusKey]);

  return (
    <div className={cn("relative min-w-[220px]", wrapperClassName)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn("h-9 pl-8", value && "pr-8", className)}
        {...props}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onValueChange("");
            onClear?.();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

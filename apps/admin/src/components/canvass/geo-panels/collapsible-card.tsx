"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The geo-sidebar accordion (the demographics Indicator ⇄ profile pattern,
 * generalised): every sidebar card is collapsible, and within one
 * {@link AccordionGroup} only ONE card is open at a time — opening a card folds
 * its siblings to their headers, so the rail is one panel of attention instead
 * of a crowded stack.
 *
 * `AccordionGroup` drives which card is open via its `open` id; panels set it
 * from selection state (click a region/door/booth → its detail card's id) so a
 * selection surfaces its card and folds the picker, and re-opening the picker
 * folds the detail — exactly the demographics behaviour.
 */

const AccordionCtx = createContext<{ open: string; setOpen: (id: string) => void } | null>(null);

export function AccordionGroup({
  open,
  onOpenChange,
  children,
}: {
  /** The id of the card that should be open (controlled). */
  open: string;
  onOpenChange: (id: string) => void;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ open, setOpen: onOpenChange }), [open, onOpenChange]);
  return <AccordionCtx.Provider value={value}>{children}</AccordionCtx.Provider>;
}

/**
 * Uncontrolled convenience wrapper: owns the open id itself, and follows
 * `follow` whenever it changes (the "selection opens its card" behaviour).
 */
export function AutoAccordionGroup({
  defaultOpen,
  follow,
  children,
}: {
  defaultOpen: string;
  /** When this value changes (and is non-empty), that card opens. */
  follow?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(follow || defaultOpen);
  useEffect(() => {
    setOpen(follow || defaultOpen);
    // Deliberately NOT resetting on defaultOpen changes alone — only selection moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow]);
  return (
    <AccordionGroup open={open} onOpenChange={setOpen}>
      {children}
    </AccordionGroup>
  );
}

/**
 * SectionCard's visual shell with a collapsible, accordion-aware header. Inside
 * an {@link AccordionGroup} the group decides which card is open (clicking a
 * header opens it and folds siblings; clicking the open card's header returns
 * to the group's first card is NOT assumed — it simply stays open, since a rail
 * with every card folded orients no one). Outside a group it self-manages.
 */
export function CollapsibleCard({
  id,
  title,
  description,
  action,
  defaultOpen = true,
  children,
  className,
  bodyClassName,
}: {
  /** Stable id within the surrounding AccordionGroup. */
  id: string;
  title: string;
  description?: string;
  /** Optional right-side header adornment (kept clickable; doesn't toggle). */
  action?: React.ReactNode;
  /** Standalone (no group) initial state. */
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const group = useContext(AccordionCtx);
  const [selfOpen, setSelfOpen] = useState(defaultOpen);
  const open = group ? group.open === id : selfOpen;
  const toggle = () => {
    if (group) group.setOpen(id);
    else setSelfOpen((v) => !v);
  };

  return (
    <section className={cn("rounded-2xl border border-border bg-surface shadow-card", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.04em] text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 truncate text-[13.5px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {action ? <span onClick={(e) => e.stopPropagation()}>{action}</span> : null}
          <ChevronDown
            className={cn("mt-0.5 h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open ? (
        <div className={cn("border-t border-[hsl(var(--muted))] px-5 py-4", bodyClassName)}>{children}</div>
      ) : null}
    </section>
  );
}

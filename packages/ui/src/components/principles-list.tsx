"use client";

import * as React from "react";
import { MessageSquare, Shield, SquareCheckBig, type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

type Tone = "success" | "primary" | "knock";

const TONE: Record<Tone, string> = {
  success: "bg-[hsl(var(--success-container))] text-[hsl(var(--success))]",
  primary: "bg-primary-container/20 text-primary",
  knock: "bg-[hsl(var(--knock-container))] text-[hsl(var(--knock))]",
};

export interface Principle {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
}

/** The three things every canvasser agrees to — shared by the invite landing + conduct step. */
export const CANVASSER_PRINCIPLES: Principle[] = [
  {
    icon: Shield,
    tone: "success",
    title: "Stay safe",
    body: 'Knock in daylight, trust your gut, and use the "don’t return" flag any time.',
  },
  {
    icon: MessageSquare,
    tone: "primary",
    title: "Be respectful",
    body: "A friendly chat, never an argument. Thank everyone for their time.",
  },
  {
    icon: SquareCheckBig,
    tone: "knock",
    title: "Log every door",
    body: "Tap the outcome at each door — it saves offline and syncs later.",
  },
];

export interface PrinciplesListProps {
  items?: Principle[];
  /** Wrap each row in a bordered card (the conduct step); plain rows otherwise. */
  boxed?: boolean;
  className?: string;
}

/** Icon + title + body rows describing the canvasser principles. */
export function PrinciplesList({ items = CANVASSER_PRINCIPLES, boxed, className }: PrinciplesListProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {items.map(({ icon: Icon, tone, title, body }) => (
        <div
          key={title}
          className={cn(
            "flex items-start gap-4",
            boxed && "rounded-2xl border border-border bg-surface p-4",
          )}
        >
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", TONE[tone])}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-foreground">{title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

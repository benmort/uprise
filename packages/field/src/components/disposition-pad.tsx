"use client";

import { CircleX, Clock, Home, MessageSquare, TriangleAlert } from "lucide-react";
import { Button } from "@uprise/ui";
import { cn } from "@uprise/ui";
import type { DispositionDef } from "../api";

/** Icon for a no-contact outcome, matched loosely by code keyword. */
function noContactIcon(code: string): typeof Home {
  if (/refus|hostile|declin|no_go/i.test(code)) return CircleX;
  if (/back|later|callback|return|busy/i.test(code)) return Clock;
  return Home; // not_home / no_answer / nobody / default
}

/** Big-button disposition grid for one-tap door outcomes. Terminal codes are
 *  visually separated and styled as warnings (Moved/Deceased/etc.). */
export function DispositionPad({
  options,
  onSelect,
  disabled,
  firstName,
}: {
  options: DispositionDef[];
  onSelect: (code: string) => void;
  disabled?: boolean;
  /** The resident's first name, when known — personalises the "Spoke to …" tile. */
  firstName?: string | null;
}) {
  // "Spoke to …" is the prominent primary action (reveals the survey); other contact
  // results are the neutral no-contact grid; terminal / data-quality codes sit in a
  // separated, secondary row. The "spoke to target" tile reads "Spoke to {firstName}"
  // when the resident is known, else "Spoke to resident".
  const spoke = options.filter((o) => o.layer === "CONTACT_RESULT" && o.code.startsWith("spoke"));
  const spokeLabel = (o: DispositionDef): string =>
    o.code.startsWith("spoke_to_target")
      ? firstName && firstName.trim()
        ? `Spoke to ${firstName.trim()}`
        : "Spoke to resident"
      : o.label;
  const noContact = options.filter((o) => o.layer === "CONTACT_RESULT" && !o.code.startsWith("spoke"));
  const terminal = options.filter((o) => o.layer !== "CONTACT_RESULT");

  return (
    <div className="animate-pop-in space-y-4">
      {spoke.length > 0 && (
        <div className="space-y-3">
          {spoke.map((o) => (
            <Button
              key={o.code}
              type="button"
              variant="default"
              disabled={disabled}
              className="h-16 w-full gap-2 rounded-2xl text-base font-bold"
              onClick={() => onSelect(o.code)}
            >
              <MessageSquare className="h-5 w-5 shrink-0" />
              {spokeLabel(o)}
            </Button>
          ))}
        </div>
      )}
      {noContact.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {noContact.map((o, i) => {
            const Icon = noContactIcon(o.code);
            // An odd trailing tile (e.g. "Refused") spans the full width as an inline row;
            // the paired tiles above stack their icon over the label.
            const solo = noContact.length % 2 === 1 && i === noContact.length - 1;
            return (
              <Button
                key={o.code}
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn(
                  "rounded-2xl border-border bg-surface text-base font-bold text-foreground",
                  solo ? "col-span-2 h-14 gap-2" : "h-24 flex-col gap-2",
                )}
                onClick={() => onSelect(o.code)}
              >
                <Icon className={cn("shrink-0", solo ? "h-5 w-5" : "h-6 w-6")} />
                {o.label}
              </Button>
            );
          })}
        </div>
      )}
      {terminal.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            Data quality
          </p>
          <div className="grid grid-cols-2 gap-3">
            {terminal.map((o) => (
              <Button
                key={o.code}
                type="button"
                variant="secondary"
                disabled={disabled}
                className="h-14 rounded-2xl text-sm font-bold"
                onClick={() => onSelect(o.code)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

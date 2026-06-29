"use client";

import { Button } from "@uprise/ui";
import { cn } from "@uprise/ui";
import type { DispositionDef } from "../api";

/** Big-button disposition grid for one-tap door outcomes. Terminal codes are
 *  visually separated and styled as warnings (Moved/Deceased/etc.). */
export function DispositionPad({
  options,
  onSelect,
  disabled,
}: {
  options: DispositionDef[];
  onSelect: (code: string) => void;
  disabled?: boolean;
}) {
  // Per design (README A3): "Spoke to …" is the prominent green action (reveals the
  // survey); other contact results are the neutral no-contact grid; terminal /
  // data-quality codes sit in a separated, warning-styled (amber) row.
  const spoke = options.filter((o) => o.layer === "CONTACT_RESULT" && o.code.startsWith("spoke"));
  const noContact = options.filter((o) => o.layer === "CONTACT_RESULT" && !o.code.startsWith("spoke"));
  const terminal = options.filter((o) => o.layer !== "CONTACT_RESULT");

  return (
    <div className="animate-pop-in space-y-4">
      {spoke.length > 0 && (
        <div className="space-y-2">
          {spoke.map((o) => (
            <Button
              key={o.code}
              type="button"
              variant="success"
              disabled={disabled}
              className="h-16 w-full text-base"
              onClick={() => onSelect(o.code)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}
      {noContact.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {noContact.map((o) => (
            <Button
              key={o.code}
              type="button"
              variant="secondary"
              disabled={disabled}
              className="h-16 text-base"
              onClick={() => onSelect(o.code)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}
      {terminal.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Terminal / data quality
          </p>
          <div className="grid grid-cols-2 gap-2">
            {terminal.map((o) => (
              <Button
                key={o.code}
                type="button"
                variant="warning"
                disabled={disabled}
                className={cn("h-12 text-sm")}
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

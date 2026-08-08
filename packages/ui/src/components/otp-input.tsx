"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface OtpInputProps {
  /** Joined digit string (controlled). */
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  /** Focus the first box on mount (e.g. landing directly on the verify step). */
  autoFocus?: boolean;
  /** Fired when all boxes are filled. */
  onComplete?: (value: string) => void;
  className?: string;
}

/**
 * N-box one-digit-per-cell numeric code input (default 6). Auto-advances on entry,
 * steps back on backspace, supports paste. Emits the joined string via onChange so
 * callers pass it straight to the verify call.
 */
/** Split a joined code into fixed slots. The interior-gap handling is the whole point — a joined
 *  string cannot express one, which is what made a mid-code correction eat the following digit. */
const toSlots = (value: string, length: number): string[] =>
  Array.from({ length }, (_, i) => value[i] ?? "");

const OtpInput = React.forwardRef<HTMLInputElement, OtpInputProps>(
  ({ value, onChange, length = 6, disabled, autoFocus, onComplete, className }, _ref) => {
    const refs = React.useRef<(HTMLInputElement | null)[]>([]);

    // Land with the cursor in the first box (deep-linking straight to the code step).
    React.useEffect(() => {
      if (autoFocus && !disabled) refs.current[0]?.focus();
      // Once on mount — a later value change shouldn't yank focus back to the first box.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    /**
     * The SLOTS are the source of truth, not the joined string.
     *
     * A joined value cannot express an interior gap. Deriving the boxes from it left-packed the
     * digits, so clearing box 3 of "123456" emitted "12456" and re-derived as [1,2,4,5,6,""] —
     * every later digit slid one box left and the last one vanished. Correcting a single mistyped
     * digit (click the box, Backspace, retype), which is what everyone does, silently ate the next
     * digit and left the submit button dead because the code was one short. The boxes still looked
     * like a plausible code, so nothing on screen showed what had happened.
     *
     * Re-seed from the prop only when it is NOT our own emission coming back, so a caller clearing
     * the field (Resend) still works while our own onChange cannot stomp the slots.
     */
    const [digits, setDigits] = React.useState<string[]>(() => toSlots(value, length));
    React.useEffect(() => {
      setDigits((prev) => (prev.join("") === value ? prev : toSlots(value, length)));
    }, [value, length]);

    const emit = (next: string[]) => {
      const joined = next.join("");
      setDigits(next);
      onChange(joined);
      // Check the SLOTS for a gap, not the joined string. `"1234".includes("")` is true for every
      // string in JS, so the old `!joined.includes("")` was always false and `onComplete` could
      // never fire — every caller's auto-submit was dead code, and people had to press the button
      // after typing the last digit.
      if (next.length === length && next.every((d) => d !== "")) onComplete?.(joined);
    };

    const setAt = (index: number, digit: string) => {
      const next = [...digits];
      next[index] = digit;
      emit(next);
    };

    const handleChange = (index: number, raw: string) => {
      const digit = raw.replace(/\D/g, "").slice(-1);
      if (raw && !digit) return; // non-numeric ignored
      setAt(index, digit);
      if (digit && index < length - 1) refs.current[index + 1]?.focus();
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        refs.current[index - 1]?.focus();
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
      if (!pasted) return;
      const next = Array.from({ length }, (_, i) => pasted[i] ?? "");
      emit(next);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
    };

    return (
      <div className={cn("flex gap-2 sm:gap-3", className)}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            className="h-14 w-full rounded-md border border-input bg-background text-center text-xl font-semibold shadow-theme-xs ring-offset-background focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50"
          />
        ))}
      </div>
    );
  },
);
OtpInput.displayName = "OtpInput";

export { OtpInput };

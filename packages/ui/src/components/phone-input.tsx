"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  findPhoneCountry,
  nationalDisplay,
  parseE164,
  toE164,
} from "../lib/phone";
import { cn } from "../lib/utils";

export interface PhoneInputProps {
  /** The number as E.164 (e.g. "+61481565866") or "" — what the caller stores/submits. */
  value?: string;
  onChange?: (e164: string) => void;
  /** ISO of the country selected when there's no value to parse. Defaults to Australia. */
  defaultCountry?: string;
  id?: string;
  /** National-number placeholder (default "0400 000 000"). */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * A country-code dropdown (searchable, flag + dial code, AU by default) beside a national-number
 * field. The user types their local number (a leading 0 is fine) or pastes a full "+61…"; the
 * component emits clean E.164 via `onChange`. No E.164 jargon is shown. The national field is
 * local state (so the typed leading 0 stays visible) and re-seeds only when `value` changes from
 * the outside — an external reset/prefill — not on the echo of our own emits.
 */
export function PhoneInput({
  value,
  onChange,
  defaultCountry = DEFAULT_PHONE_COUNTRY,
  id,
  placeholder = "0400 000 000",
  disabled,
  className,
  "aria-label": ariaLabel,
}: PhoneInputProps) {
  const seed = (v: string | null | undefined) => {
    const p = parseE164(v, defaultCountry);
    return { iso: p.iso, national: nationalDisplay(p.iso, p.national) };
  };
  const initial = React.useMemo(() => seed(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [iso, setIso] = React.useState(initial.iso);
  const [national, setNational] = React.useState(initial.national);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // The last E.164 we emitted — lets us tell our own echo apart from an external value change.
  const emitted = React.useRef(value ?? "");

  React.useEffect(() => {
    const v = value ?? "";
    if (v !== emitted.current) {
      emitted.current = v;
      const s = seed(v);
      setIso(s.iso);
      setNational(s.national);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (nextIso: string, nextNational: string) => {
    const e164 = toE164(findPhoneCountry(nextIso).dial, nextNational);
    emitted.current = e164;
    onChange?.(e164);
  };

  const onNationalChange = (raw: string) => {
    const t = raw.trim();
    if (t.startsWith("+") || t.startsWith("00")) {
      // Pasted a full international number — re-resolve the country and split off the national part.
      const s = seed(t);
      setIso(s.iso);
      setNational(s.national);
      emit(s.iso, s.national);
      return;
    }
    const digits = raw.replace(/\D/g, "");
    setNational(digits);
    emit(iso, digits);
  };

  const pickCountry = (nextIso: string) => {
    setIso(nextIso);
    setOpen(false);
    setQuery("");
    emit(nextIso, national);
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHONE_COUNTRIES;
    const digits = q.replace(/\D/g, "");
    return PHONE_COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.iso.toLowerCase().includes(q) || (digits && c.dial.includes(digits)),
    );
  }, [query]);

  const country = findPhoneCountry(iso);

  return (
    <div className={cn("flex items-stretch gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Country code"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm text-foreground transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden className="text-base leading-none">
              {country.flag}
            </span>
            <span className="tabular-nums text-muted-foreground">+{country.dial}</span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-input px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search countries…"
                aria-label="Search countries"
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-auto p-1">
            {filtered.map((c) => (
              <li key={c.iso}>
                <button
                  type="button"
                  onClick={() => pickCountry(c.iso)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-variant",
                    c.iso === iso && "bg-surface-variant",
                  )}
                >
                  <span aria-hidden className="text-base leading-none">
                    {c.flag}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">+{c.dial}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted-foreground">No match</li>
            ) : null}
          </ul>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-label={ariaLabel ?? "Phone number"}
        disabled={disabled}
        placeholder={placeholder}
        value={national}
        onChange={(e) => onNationalChange(e.target.value)}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Phone, Search } from "lucide-react";
import { FormDialog, Field, Input, formatAuMobile, toE164 } from "@uprise/ui";
import { searchContacts, type ContactSearchResult } from "@/lib/api/contacts";
import { useSoftphone } from "./softphone-provider";
import { cn } from "@/lib/utils";

type Mode = "contact" | "number";

/**
 * Place a browser (WebRTC) call: pick a contact (search by name/number → uses their
 * phoneE164) or type a number. On submit it hands off to the softphone; the global
 * CallBar takes over. Calls originate from the tenant's provisioned number.
 */
export function NewCallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { startCall } = useSoftphone();
  const [mode, setMode] = useState<Mode>("contact");
  const [digits, setDigits] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ContactSearchResult | null>(null);

  const reset = () => {
    setMode("contact");
    setDigits("");
    setQuery("");
    setResults([]);
    setPicked(null);
  };

  // Debounced contact search (name / number).
  useEffect(() => {
    if (mode !== "contact") return;
    const q = query.trim();
    if (picked && q === (picked.fullName ?? picked.phoneE164 ?? "")) return;
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchContacts(q);
      if (!alive) return;
      setResults(res.ok ? res.data.filter((c) => c.phoneE164) : []);
      setSearching(false);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, mode, picked]);

  const toNumber = useMemo(() => {
    if (mode === "contact") return picked?.phoneE164 ?? null;
    const national = digits.replace(/\D/g, "");
    return national.length >= 9 ? toE164(national) : null;
  }, [mode, picked, digits]);

  const submit = () => {
    if (!toNumber) return;
    const label =
      mode === "contact"
        ? picked?.fullName || picked?.phoneE164 || toNumber
        : formatAuMobile(digits.replace(/\D/g, ""));
    void startCall({ toNumber, contactId: mode === "contact" ? picked?.id : undefined, label });
    reset();
    onClose();
  };

  return (
    <FormDialog
      open={open}
      title="New call"
      description="Place a call over the browser — from your organisation's number."
      onClose={() => {
        reset();
        onClose();
      }}
      onSubmit={submit}
      submitLabel="Call"
      submitDisabled={!toNumber}
      size="sm"
    >
      <div className="flex rounded-xl border border-border p-0.5">
        {(["contact", "number"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setPicked(null);
            }}
            aria-pressed={mode === m}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              mode === m ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
            )}
          >
            {m === "contact" ? "Contact" : "Number"}
          </button>
        ))}
      </div>

      {mode === "contact" ? (
        <Field label="Find a contact" htmlFor="call-contact">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="call-contact"
              className="pl-9"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPicked(null);
              }}
              placeholder="Search by name or number…"
              autoComplete="off"
              autoFocus
            />
            {searching ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          {!picked && results.length > 0 ? (
            <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(c);
                      setQuery(c.fullName ?? c.phoneE164 ?? "");
                      setResults([]);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-variant"
                  >
                    <span className="truncate font-medium">{c.fullName || "Unnamed contact"}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.phoneE164}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {picked ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              Calling <span className="font-mono">{picked.phoneE164}</span>
            </p>
          ) : null}
        </Field>
      ) : (
        <Field label="Phone number" htmlFor="call-number" hint="Australian mobile.">
          <Input
            id="call-number"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={formatAuMobile(digits.replace(/\D/g, ""))}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="04xx xxx xxx"
            autoFocus
          />
        </Field>
      )}
    </FormDialog>
  );
}

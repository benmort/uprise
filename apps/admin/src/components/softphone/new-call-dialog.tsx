"use client";

import Link from "next/link";
import { Spinner } from "@uprise/ui";
import { useEffect, useMemo, useState } from "react";
import { Phone, PhoneOff, Search } from "lucide-react";
import { FormDialog, Field, Input, FormSelect, StatusBadge, StepProgress, PhoneInput, formatPhoneDisplay, isAuMobile } from "@uprise/ui";
import {
  telephony,
  type TelephonyPhoneNumber,
  type TelephonyProvisioningRun,
} from "@uprise/api-client";
import { searchContacts, type ContactSearchResult } from "@/lib/api/contacts";
import { telephonyStepIndex } from "@/components/telephony/provisioning-timeline";
import { useSoftphone } from "./softphone-provider";
import { cn } from "@/lib/utils";

type Mode = "contact" | "number";

const RUN_TERMINAL = new Set(["ACTIVE", "FAILED"]);

/**
 * Place a browser (WebRTC) call: pick a contact (search by name/number → uses their
 * phoneE164) or type a number. On submit it hands off to the softphone; the global
 * CallBar takes over. Calls originate from the tenant's provisioned number — with a
 * from-number pick when the tenant has more than the default, and a blocked row
 * (mobiles are SMS-only; link to number setup) when nothing voice-capable resolves.
 */
export function NewCallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { startCall, voiceBlocked, probeVoice, fromNumber } = useSoftphone();
  const [mode, setMode] = useState<Mode>("contact");
  const [digits, setDigits] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ContactSearchResult | null>(null);
  const [voiceNumbers, setVoiceNumbers] = useState<TelephonyPhoneNumber[]>([]);
  const [fromNumberId, setFromNumberId] = useState<string>("");
  const [liveRun, setLiveRun] = useState<TelephonyProvisioningRun | null>(null);

  const reset = () => {
    setMode("contact");
    setDigits("");
    setQuery("");
    setResults([]);
    setPicked(null);
    setFromNumberId("");
  };

  // On open: probe voice availability + load the pickable (voice-capable) numbers.
  // When blocked, also look for an in-flight provisioning run to show its progress.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void probeVoice();
    void telephony.listNumbers().then((res) => {
      if (!alive || !res.ok) return;
      setVoiceNumbers(res.data.filter((n) => n.status === "ACTIVE" && !isAuMobile(n.phoneNumberE164)));
    });
    void telephony.listRuns().then((res) => {
      if (!alive || !res.ok) return;
      const newest = res.data[0];
      setLiveRun(newest && !RUN_TERMINAL.has(newest.status) ? newest : null);
    });
    return () => {
      alive = false;
    };
  }, [open, probeVoice]);

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
    // `digits` is the E.164 emitted by PhoneInput; needs the "+" and enough digits to dial.
    return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : null;
  }, [mode, picked, digits]);

  const submit = () => {
    if (!toNumber || voiceBlocked) return;
    const label =
      mode === "contact"
        ? picked?.fullName || picked?.phoneE164 || toNumber
        : formatPhoneDisplay(digits);
    void startCall({
      toNumber,
      contactId: mode === "contact" ? picked?.id : undefined,
      label,
      fromNumberId: fromNumberId || undefined,
    });
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
      submitDisabled={!toNumber || Boolean(voiceBlocked)}
      size="sm"
    >
      {voiceBlocked ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-container/40 p-3 text-sm text-warning-foreground">
          <PhoneOff className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Calls need a local number.</span>
          {liveRun ? (
            <span className="flex items-center gap-2">
              <StatusBadge status={liveRun.status} />
              <StepProgress
                className="w-24"
                current={telephonyStepIndex(liveRun.status).step}
                total={telephonyStepIndex(liveRun.status).total}
              />
            </span>
          ) : (
            <Link
              href="/channels/calls#numbers"
              onClick={onClose}
              className="shrink-0 font-semibold text-primary underline-offset-2 hover:underline"
            >
              Set up
            </Link>
          )}
        </div>
      ) : null}
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
              <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
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
        <Field label="Phone number" htmlFor="call-number">
          <PhoneInput id="call-number" value={digits} onChange={setDigits} />
        </Field>
      )}

      {!voiceBlocked && voiceNumbers.length > 0 ? (
        <Field label="Call from" htmlFor="call-from">
          <FormSelect
            id="call-from"
            value={fromNumberId}
            onChange={(e) => setFromNumberId(e.target.value)}
            placeholder={fromNumber ? `Default — ${fromNumber}` : "Default number (auto)"}
            options={voiceNumbers.map((n) => ({
              value: n.id,
              label: n.nickname?.trim() ? `${n.nickname} — ${n.phoneNumberE164}` : n.phoneNumberE164,
            }))}
          />
        </Field>
      ) : null}
    </FormDialog>
  );
}

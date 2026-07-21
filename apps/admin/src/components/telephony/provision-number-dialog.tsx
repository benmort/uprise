"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { FormDialog, Field, Input } from "@uprise/ui";
import {
  telephony,
  type TelephonyComplianceInput,
  type TelephonyProvisioningRun,
} from "@uprise/api-client";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/session";
import { invalidateSetupState } from "@/components/setup/use-setup-state";

type NumberType = "local" | "mobile";

const EMPTY: TelephonyComplianceInput = {
  legalName: "",
  contactFirstName: "",
  contactLastName: "",
  email: "",
  businessNumber: "",
  address: { street: "", city: "", region: "", postalCode: "" },
};

/**
 * Tenant self-serve number provisioning (owner/organiser): the simplified
 * compliance form, prefilled from the organisation's KYC profile
 * (GET /telephony/compliance-prefill), defaulting to a LOCAL number — the class
 * that can place calls; mobiles are SMS-only. Submitting starts the automated
 * run (subaccount → compliance bundle → purchase → live); the caller renders
 * progress via the returned run.
 */
export function ProvisionNumberDialog({
  open,
  onClose,
  onStarted,
  defaultNumberType = "local",
}: {
  open: boolean;
  onClose: () => void;
  /** The run was created — swap the card to its progress view. */
  onStarted: (run: TelephonyProvisioningRun) => void;
  defaultNumberType?: NumberType;
}) {
  const [numberType, setNumberType] = useState<NumberType>(defaultNumberType);
  const [input, setInput] = useState<TelephonyComplianceInput>(EMPTY);
  const [prefilling, setPrefilling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupIncomplete, setSetupIncomplete] = useState(false);

  // Prefill from the org profile each time the dialog opens (fields stay editable).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setNumberType(defaultNumberType);
    setError(null);
    setPrefilling(true);
    void telephony.compliancePrefill().then((res) => {
      if (!alive) return;
      if (res.ok) setInput({ ...EMPTY, ...res.data, address: { ...EMPTY.address, ...res.data.address } });
      setPrefilling(false);
    });
    return () => {
      alive = false;
    };
  }, [open, defaultNumberType]);

  const set = (patch: Partial<TelephonyComplianceInput>) => setInput((prev) => ({ ...prev, ...patch }));
  const setAddress = (patch: Partial<TelephonyComplianceInput["address"]>) =>
    setInput((prev) => ({ ...prev, address: { ...prev.address, ...patch } }));

  const complete =
    input.legalName.trim() &&
    input.contactFirstName.trim() &&
    input.contactLastName.trim() &&
    input.email.trim() &&
    input.address.street.trim() &&
    input.address.city.trim() &&
    input.address.region.trim() &&
    input.address.postalCode.trim();

  const submit = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    setSetupIncomplete(false);
    const res = await telephony.startRun({
      mode: "SUBACCOUNT",
      numberType,
      complianceInput: {
        ...input,
        businessNumber: input.businessNumber?.trim() || undefined,
      },
    });
    setBusy(false);
    if (!res.ok) {
      // Server truth beats the advisory gate: a 422 SETUP_INCOMPLETE means the org's
      // identification changed under us — refresh the shared setup state so the locked
      // CTA re-engages, and point at the fix.
      if (res.status === 422) {
        setSetupIncomplete(true);
        const session = await getSession();
        if (session?.tenantId) invalidateSetupState(session.tenantId);
      }
      setError(res.error);
      return;
    }
    const session = await getSession();
    if (session?.tenantId) invalidateSetupState(session.tenantId);
    onStarted(res.data);
    onClose();
  };

  return (
    <FormDialog
      open={open}
      title="Get a dedicated number"
      description="Australian numbers need a regulatory identity check — this usually comes back within a day."
      onClose={() => {
        if (!busy) onClose();
      }}
      onSubmit={() => void submit()}
      submitLabel={busy ? "Starting…" : "Start setup"}
      busy={busy}
      submitDisabled={!complete || prefilling}
      size="lg"
    >
      <div className="flex rounded-xl border border-border p-0.5">
        {(
          [
            { type: "local" as const, label: "Local number", hint: "Outbound calls" },
            { type: "mobile" as const, label: "Mobile number", hint: "Text messages" },
          ]
        ).map((opt) => (
          <button
            key={opt.type}
            type="button"
            onClick={() => setNumberType(opt.type)}
            aria-pressed={numberType === opt.type}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-left transition",
              numberType === opt.type ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
            )}
          >
            <span className="block text-sm font-semibold">{opt.label}</span>
            <span className={cn("block text-xs", numberType === opt.type ? "text-white/80" : "text-muted-foreground")}>
              {opt.hint}
            </span>
          </button>
        ))}
      </div>

      {prefilling ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Prefilling from your organisation profile…
        </p>
      ) : null}

      <Field label="Legal organisation name" htmlFor="prov-legal-name">
        <Input
          id="prov-legal-name"
          value={input.legalName}
          onChange={(e) => set({ legalName: e.target.value })}
          autoComplete="organization"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact first name" htmlFor="prov-first">
          <Input
            id="prov-first"
            value={input.contactFirstName}
            onChange={(e) => set({ contactFirstName: e.target.value })}
          />
        </Field>
        <Field label="Contact last name" htmlFor="prov-last">
          <Input
            id="prov-last"
            value={input.contactLastName}
            onChange={(e) => set({ contactLastName: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact email" htmlFor="prov-email">
          <Input
            id="prov-email"
            type="email"
            value={input.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </Field>
        <Field label="ABN / ACN" htmlFor="prov-abn" hint="Optional but speeds up review.">
          <Input
            id="prov-abn"
            value={input.businessNumber ?? ""}
            onChange={(e) => set({ businessNumber: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Street address" htmlFor="prov-street">
        <Input
          id="prov-street"
          value={input.address.street}
          onChange={(e) => setAddress({ street: e.target.value })}
          autoComplete="street-address"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Suburb" htmlFor="prov-city">
          <Input id="prov-city" value={input.address.city} onChange={(e) => setAddress({ city: e.target.value })} />
        </Field>
        <Field label="State" htmlFor="prov-region">
          <Input
            id="prov-region"
            value={input.address.region}
            onChange={(e) => setAddress({ region: e.target.value })}
            placeholder="NSW"
          />
        </Field>
        <Field label="Postcode" htmlFor="prov-postcode">
          <Input
            id="prov-postcode"
            inputMode="numeric"
            value={input.address.postalCode}
            onChange={(e) => setAddress({ postalCode: e.target.value })}
          />
        </Field>
      </div>

      {error ? (
        <p className="text-sm text-error">
          {error}
          {setupIncomplete ? (
            <>
              {" "}
              <Link href="/getting-started#organisation" className="font-bold underline" onClick={onClose}>
                Finish organisation setup
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </FormDialog>
  );
}

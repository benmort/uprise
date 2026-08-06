"use client";

import { Alert, Spinner } from "@uprise/ui";
import { useEffect, useState } from "react";
import Link from "next/link";
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
  // Default ON, matching the API's own default: an organisation needs a mobile to text
  // from AND a local to call from, and the second run is chained automatically once the
  // first number goes live. Unticking it is the only way to ask for one class only – the
  // second number is a second purchase and a second bundle a human at Twilio reviews.
  const [bothNumbers, setBothNumbers] = useState(true);
  const [input, setInput] = useState<TelephonyComplianceInput>(EMPTY);
  /**
   * The compliance details are locked to the organisation profile by default.
   *
   * Both numbers are applied for under one regulatory identity, and a mismatch between what is
   * submitted here and what the organisation actually is means a rejected bundle and a wait —
   * Twilio's review is done by a person. Prefilled-and-editable invited exactly that drift, so the
   * default is locked and overriding is a deliberate act.
   */
  const [lockedToOrg, setLockedToOrg] = useState(true);
  const [prefilling, setPrefilling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupIncomplete, setSetupIncomplete] = useState(false);

  // Prefill from the org profile each time the dialog opens, locked by default.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setNumberType(defaultNumberType);
    setBothNumbers(true);
    setLockedToOrg(true);
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

  /** Applied to every compliance input, so the lock cannot be half-honoured across the form. */
  const locked = {
    readOnly: lockedToOrg,
    // readOnly rather than disabled: the values stay selectable and copyable, and they still
    // reach the payload. A disabled field reads as broken here, not as intentionally fixed.
    "aria-readonly": lockedToOrg,
    className: cn(lockedToOrg && "bg-surface-variant text-muted-foreground focus-visible:ring-0"),
  } as const;

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
      chainComplementary: bothNumbers,
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

      <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={bothNumbers}
          onChange={(e) => setBothNumbers(e.target.checked)}
        />
        <span>
          <span className="block font-medium text-foreground">
            Also set up a {numberType === "local" ? "mobile number for text messages" : "local number for calls"}
          </span>
          <span className="block text-xs text-muted-foreground">
            Australian numbers can do one job each, so most organisations want both. The second
            number starts automatically once the first is live, and needs its own identity check.
            Untick to set up only the {numberType === "local" ? "local" : "mobile"} number.
          </span>
        </span>
      </label>

      {prefilling ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4 animate-spin" />
          Prefilling from your organisation profile…
        </p>
      ) : null}

      {/* One identity covers both numbers, so the lock sits above the whole compliance block
          rather than beside any single field. */}
      <Alert variant="info" showIcon={false}>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 shrink-0"
            checked={lockedToOrg}
            onChange={(e) => setLockedToOrg(e.target.checked)}
          />
          <span className="text-sm">
            <span className="block font-semibold text-foreground">
              Use my organisation&apos;s registered details
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {lockedToOrg ? (
                <>
                  Both the local and mobile numbers are applied for under this one identity, taken
                  from your{" "}
                  <Link
                    href="/getting-started#organisation"
                    className="font-medium underline"
                    onClick={onClose}
                  >
                    organisation profile
                  </Link>
                  . Untick to change them for this application only.
                </>
              ) : (
                <>
                  Editing for this application only – your organisation profile will not change.
                  These details must match your registered entity, because a person at the carrier
                  checks them against public records before either number goes live.
                </>
              )}
            </span>
          </span>
        </label>
      </Alert>

      <Field label="Legal organisation name" htmlFor="prov-legal-name">
        <Input
          id="prov-legal-name"
          value={input.legalName}
          onChange={(e) => set({ legalName: e.target.value })}
          autoComplete="organization"
          {...locked}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact first name" htmlFor="prov-first">
          <Input
            id="prov-first"
            value={input.contactFirstName}
            onChange={(e) => set({ contactFirstName: e.target.value })}
            {...locked}
          />
        </Field>
        <Field label="Contact last name" htmlFor="prov-last">
          <Input
            id="prov-last"
            value={input.contactLastName}
            onChange={(e) => set({ contactLastName: e.target.value })}
            {...locked}
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
            {...locked}
          />
        </Field>
        <Field label="ABN / ACN" htmlFor="prov-abn" hint="Optional but speeds up review.">
          <Input
            id="prov-abn"
            value={input.businessNumber ?? ""}
            onChange={(e) => set({ businessNumber: e.target.value })}
            {...locked}
          />
        </Field>
      </div>

      <Field label="Street address" htmlFor="prov-street">
        <Input
          id="prov-street"
          value={input.address.street}
          onChange={(e) => setAddress({ street: e.target.value })}
          autoComplete="street-address"
          {...locked}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Suburb" htmlFor="prov-city">
          <Input
            id="prov-city"
            value={input.address.city}
            onChange={(e) => setAddress({ city: e.target.value })}
            {...locked}
          />
        </Field>
        <Field label="State" htmlFor="prov-region">
          <Input
            id="prov-region"
            value={input.address.region}
            onChange={(e) => setAddress({ region: e.target.value })}
            placeholder="NSW"
            {...locked}
          />
        </Field>
        <Field label="Postcode" htmlFor="prov-postcode">
          <Input
            id="prov-postcode"
            inputMode="numeric"
            value={input.address.postalCode}
            onChange={(e) => setAddress({ postalCode: e.target.value })}
            {...locked}
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

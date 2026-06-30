"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Flag,
  Home,
  MessageSquare,
  Megaphone,
  Search,
  Shield,
  CheckCircle2,
} from "lucide-react";
import {
  Alert,
  Button,
  DayChips,
  Field,
  Input,
  Keypad,
  OtpInput,
  PhoneNumberField,
  PrinciplesList,
  RoleSelectCards,
  Spinner,
  StepProgress,
  TenantBrand,
  TurnstileWidget,
  formatAuMobile,
  type RoleOption,
  type TurnstileHandle,
} from "@uprise/ui";
import { auth, VOLUNTEER_PREFERRED_ROLES } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";
import { captureAttribution } from "@/lib/attribution";

const ROLE_OPTIONS: RoleOption[] = [
  { value: "hander-outer", title: "Hander-outer", subtitle: "Hand flyers at booths & stalls", icon: Megaphone },
  { value: "doorknocker", title: "Doorknocker", subtitle: "Have conversations at the door", icon: Home },
  { value: "booth-captain", title: "Booth captain", subtitle: "Run a polling booth on the day", icon: Flag },
  { value: "scrutineer", title: "Scrutineer", subtitle: "Observe the count", icon: Search },
];
const ROLE_TITLE = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.title]));
const isDev = process.env.NODE_ENV !== "production";

/** National AU digits → E.164 (drop a leading 0, prefix +61). */
function toE164(national: string): string {
  const d = national.replace(/\D/g, "");
  return "+61" + (d.startsWith("0") ? d.slice(1) : d);
}

type Step = "phone" | "code" | "name" | "role" | "conduct" | "done";
const FLOW: Step[] = ["phone", "code", "name", "role", "conduct"];

/**
 * Five-step volunteer onboarding wizard (phone → OTP → name → role/days → conduct)
 * that turns an invite into a VOLUNTEER membership + session. Reuses the phone OTP
 * API (invited-phone send), the extended acceptInvite, and completeAuth.
 */
export function VolunteerOnboardWizard({
  token,
  tenantName,
  invitedPhone,
  returnTo,
  onExit,
}: {
  token: string;
  tenantName?: string;
  invitedPhone: string | null;
  returnTo: string | null;
  onExit: () => void;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(invitedPhone ? invitedPhone.replace(/^\+61/, "0").replace(/\D/g, "") : "");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const captchaRef = useRef<TurnstileHandle>(null);

  const stepIndex = FLOW.indexOf(step);
  const e164 = useMemo(() => toE164(phone), [phone]);

  const back = () => {
    setError(null);
    if (stepIndex <= 0) {
      onExit();
      return;
    }
    setStep(FLOW[stepIndex - 1]);
  };

  // Resend countdown tick.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Dev: surface the code (no SMS locally) and prefill the boxes.
  useEffect(() => {
    if (step !== "code" || !isDev || !challengeId) return;
    void auth.devPeekOtp(challengeId).then((res) => {
      if (res.ok && res.data.code) setCode(res.data.code);
    });
  }, [step, challengeId]);

  // OTP complete → advance to the name step.
  useEffect(() => {
    if (step === "code" && code.length === 6) setStep("name");
  }, [step, code]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.inviteStartPhone({ token, phone: e164 }, captchaToken);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setChallengeId(res.data.challengeId);
    setCode("");
    setResendIn(30);
    setStep("code");
  }

  async function resend() {
    if (resendIn > 0) return;
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.inviteStartPhone({ token, phone: e164 }, captchaToken);
    if (res.ok) {
      setChallengeId(res.data.challengeId);
      setResendIn(30);
    }
  }

  const [memberships, setMemberships] = useState<Parameters<typeof completeAuth>[0]>(undefined);

  async function submit() {
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    const displayName = [first.trim(), last.trim()].filter(Boolean).join(" ") || first.trim();
    const res = await auth.acceptInvite({
      token,
      displayName,
      challengeId: challengeId ?? undefined,
      code: code || undefined,
      preferredRole: (role as (typeof VOLUNTEER_PREFERRED_ROLES)[number]) ?? undefined,
      availabilityDays: days,
      ...captureAttribution(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMemberships(res.data.memberships);
    setStep("done");
  }

  // ── Success ─────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex w-full flex-col items-center text-center">
        <span className="mt-6 flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--success-container))] text-[hsl(var(--success))]">
          <CheckCircle2 className="h-10 w-10" />
        </span>
        <h1 className="mt-6 text-3xl font-extrabold text-foreground">
          You&apos;re on the team{first.trim() ? `, ${first.trim()}` : ""}
        </h1>
        <p className="mt-3 text-muted-foreground">
          Your number is verified and you&apos;re ready to knock. Your organiser will assign you
          turf — it&apos;ll show up here.
        </p>
        <dl className="mt-7 w-full space-y-0 rounded-2xl bg-surface-variant/60 px-5 text-sm">
          <Row label="Signed in as" value={`+61 ${formatAuMobile(phone)}`} />
          <Row label="Role" value={role ? ROLE_TITLE[role] : "Volunteer"} border />
          <Row
            label="Status"
            value={
              <span className="inline-flex items-center gap-1.5 font-bold text-[hsl(var(--success))]">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))]" /> Verified
              </span>
            }
            border
          />
        </dl>
        <Button
          className="mt-7 h-14 w-full text-base"
          onClick={() => completeAuth(memberships, returnTo)}
        >
          Start canvassing
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] w-full flex-col">
      {tenantName ? <TenantBrand name={tenantName} className="mb-5" /> : null}
      <div className="mb-7 flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <StepProgress current={stepIndex + 1} total={FLOW.length} className="flex-1" />
      </div>

      {/* Step 1 — phone */}
      {step === "phone" ? (
        <div className="flex flex-1 flex-col">
          <h1 className="text-3xl font-extrabold text-foreground">What&apos;s your mobile?</h1>
          <p className="mt-2 text-muted-foreground">
            Your number is your sign-in. We&apos;ll text you a code to verify it — no passwords.
          </p>
          <PhoneNumberField value={phone} className="mt-8" />
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <Shield className="mt-0.5 h-4 w-4 shrink-0" />
            Standard message rates may apply. We never share your number.
          </p>
          {error ? <Alert variant="error" title={error} className="mt-4" /> : null}
          <div className="flex-1" />
          <Keypad
            className="mt-6"
            onKey={(d) => setPhone((p) => (p + d).slice(0, 10))}
            onBackspace={() => setPhone((p) => p.slice(0, -1))}
          />
          <TurnstileWidget ref={captchaRef} />
          <Button
            className="mt-3 h-14 w-full gap-2 text-base"
            disabled={busy || phone.replace(/\D/g, "").length < 9}
            onClick={() => void sendCode()}
          >
            {busy ? <Spinner /> : <MessageSquare className="h-5 w-5" />}
            Send code
          </Button>
        </div>
      ) : null}

      {/* Step 2 — code */}
      {step === "code" ? (
        <div className="flex flex-1 flex-col">
          <h1 className="text-3xl font-extrabold text-foreground">Enter your code</h1>
          <p className="mt-2 text-muted-foreground">
            We texted a 6-digit code to <span className="font-bold text-foreground">+61 {formatAuMobile(phone)}</span>.
          </p>
          <OtpInput value={code} onChange={setCode} length={6} className="mt-7" />
          <p className="mt-4 text-sm text-muted-foreground">
            Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={() => void resend()}
              disabled={resendIn > 0}
              className="font-bold text-primary disabled:text-muted-foreground"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </p>
          {isDev ? (
            <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
              <Shield className="h-4 w-4" /> Demo: tap any 6 digits
            </p>
          ) : null}
          {error ? <Alert variant="error" title={error} className="mt-4" /> : null}
          <div className="flex-1" />
          <Keypad
            className="mt-6"
            onKey={(d) => setCode((c) => (c + d).slice(0, 6))}
            onBackspace={() => setCode((c) => c.slice(0, -1))}
          />
        </div>
      ) : null}

      {/* Step 3 — name */}
      {step === "name" ? (
        <div className="flex flex-1 flex-col">
          <h1 className="text-3xl font-extrabold text-foreground">What should we call you?</h1>
          <p className="mt-2 text-muted-foreground">
            This is how you&apos;ll appear to your organiser and on the roster.
          </p>
          <div className="mt-8 space-y-5">
            <Field label="First name" htmlFor="first">
              <Input id="first" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} />
            </Field>
            <Field label="Last name (optional)" htmlFor="last">
              <Input id="last" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
            </Field>
          </div>
          <div className="flex-1" />
          <Button
            className="mt-6 h-14 w-full text-base"
            disabled={!first.trim()}
            onClick={() => setStep("role")}
          >
            Continue
          </Button>
        </div>
      ) : null}

      {/* Step 4 — role + days */}
      {step === "role" ? (
        <div className="flex flex-1 flex-col">
          <h1 className="text-3xl font-extrabold text-foreground">How do you want to help?</h1>
          <p className="mt-2 text-muted-foreground">Pick your main role — you can do others too.</p>
          <RoleSelectCards className="mt-6" options={ROLE_OPTIONS} value={role} onChange={setRole} />
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Which days can you usually help?
          </p>
          <DayChips className="mt-3" value={days} onChange={setDays} />
          <div className="flex-1" />
          <Button className="mt-6 h-14 w-full text-base" disabled={!role} onClick={() => setStep("conduct")}>
            Continue
          </Button>
        </div>
      ) : null}

      {/* Step 5 — conduct */}
      {step === "conduct" ? (
        <div className="flex flex-1 flex-col">
          <h1 className="text-3xl font-extrabold text-foreground">Before you head out</h1>
          <p className="mt-2 text-muted-foreground">The three things every canvasser agrees to.</p>
          <PrinciplesList className="mt-6" boxed />
          <button
            type="button"
            onClick={() => setAgreed((a) => !a)}
            className={`mt-4 flex w-full items-start gap-3 rounded-2xl border p-4 text-left ${
              agreed ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                agreed ? "border-primary bg-primary text-white" : "border-muted-foreground/40"
              }`}
            >
              {agreed ? "✓" : ""}
            </span>
            <span className="text-sm text-foreground">
              I agree to the volunteer <span className="font-bold text-primary">code of conduct</span> and to
              handle voter data responsibly.
            </span>
          </button>
          {error ? <Alert variant="error" title={error} className="mt-4" /> : null}
          <div className="flex-1" />
          <Button className="mt-6 h-14 w-full text-base" disabled={!agreed || busy} onClick={() => void submit()}>
            {busy ? <Spinner className="mr-2" /> : null}
            I&apos;m ready
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, border }: { label: string; value: React.ReactNode; border?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-4 ${border ? "border-t border-border/60" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-bold text-foreground">{value}</dd>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Flag,
  Footprints,
  Home,
  MessageSquare,
  Megaphone,
  Mountain,
  Route,
  Accessibility,
  Smartphone,
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
  toE164,
  type RoleOption,
  type TurnstileHandle,
} from "@uprise/ui";
import { auth, VOLUNTEER_PREFERRED_ROLES, type WalkingCapability, type SessionLength } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";
import { captureAttribution } from "@/lib/attribution";
import type { GoToOptions } from "@/lib/wizard-step";

/** Doorknocking leads, and is the role the wizard preselects — it is what most campaigns need. */
const ROLE_OPTIONS: RoleOption[] = [
  { value: "doorknocker", title: "Doorknocker", subtitle: "Have conversations at the door", icon: Home },
  { value: "hander-outer", title: "Hander-outer", subtitle: "Hand flyers at booths & stalls", icon: Megaphone },
  { value: "booth-captain", title: "Booth captain", subtitle: "Run a polling booth on the day", icon: Flag },
  { value: "p2p-texter", title: "Peer-to-peer texting", subtitle: "Text voters one-to-one, from home", icon: Smartphone },
];
const DEFAULT_ROLE = "doorknocker";
const ROLE_TITLE = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.title]));

// Doorknocker-only follow-up: how much walking suits them + preferred session length.
// Values match WALKING_CAPABILITIES / SESSION_LENGTHS in @uprise/contracts.
const WALKING_OPTIONS: RoleOption[] = [
  { value: "short", title: "Short & flat", subtitle: "A few nearby streets", icon: Footprints },
  { value: "moderate", title: "A good walk", subtitle: "A suburb's worth is fine", icon: Route },
  { value: "long", title: "Long routes", subtitle: "Hills and distance are no problem", icon: Mountain },
  { value: "minimal", title: "Minimal walking", subtitle: "I use mobility aids, or prefer to drive between stops", icon: Accessibility },
];
const SESSION_OPTIONS: { value: SessionLength; label: string }[] = [
  { value: "short", label: "Up to an hour" },
  { value: "standard", label: "1–2 hours" },
  { value: "long", label: "2–4 hours" },
  { value: "flexible", label: "However long's needed" },
];

const isDev = process.env.NODE_ENV !== "production";

type Step = "phone" | "code" | "name" | "role" | "doorknock" | "conduct" | "done";

/** Names the progress bar reads out; index matches the flow. */
const STEP_LABEL: Record<Step, string> = {
  phone: "Your mobile",
  code: "Verify your number",
  name: "Your name",
  role: "How you'll help",
  doorknock: "About your knocking",
  conduct: "Code of conduct",
  done: "Done",
};

/**
 * Volunteer onboarding wizard (phone → OTP → name → role/days → [doorknock] → conduct)
 * that turns an invite OR an open campaign into a VOLUNTEER membership + session.
 * Doorknockers get an extra step capturing walking capability + session length (stored
 * as advisory canvassPrefs). Exactly one of `token` (organiser invite) / `campaignId`
 * (tokenless open-join) is set; the phone-send + finalise calls branch on which.
 *
 * The step lives in the URL (`?step=`), owned by the page and handed down – see
 * `useWizardStep`. So the phone's Back gesture walks back through the questions, the
 * progress bar can jump to a finished one, and a half-filled flow survives a reload by
 * snapping to the furthest step whose answers are still in hand.
 */
export function VolunteerOnboardWizard({
  token,
  campaignId,
  tenantName,
  tenantLogoUrl,
  invitedPhone,
  returnTo,
  step,
  goTo,
  canGoBack,
  onComplete,
  completeLabel = "Start canvassing",
  invitedChannel,
}: {
  token?: string;
  campaignId?: string;
  tenantName?: string;
  /** The tenant's logo (landscape preferred, block fallback); gradient disc when absent. */
  tenantLogoUrl?: string | null;
  invitedPhone: string | null;
  returnTo: string | null;
  /** The step named in the URL. */
  step: string;
  goTo: (step: string | null, opts?: GoToOptions) => void;
  /** Whether Back stays inside the flow, or would leave the site. */
  canGoBack: boolean;
  /** Overrides the final redirect. Defaults to `completeAuth(memberships, returnTo)`. */
  onComplete?: (memberships: Parameters<typeof completeAuth>[0]) => void;
  /** Label on the final button — the entry point names the destination. */
  completeLabel?: string;
  /** What the volunteer was invited to do ("DOOR" | "SMS" | "BOTH") — from the invite or
   *  the campaign's channel. SMS defaults the p2p-texter role and skips the doorknock
   *  step; DOOR defaults doorknocker; BOTH/absent keeps the full role choice. */
  invitedChannel?: string | null;
}) {
  const [phone, setPhone] = useState(invitedPhone ? invitedPhone.replace(/^\+61/, "0").replace(/\D/g, "") : "");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [smsSent, setSmsSent] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [role, setRole] = useState<string | null>(
    invitedChannel === "SMS" ? "p2p-texter" : DEFAULT_ROLE,
  );
  const [days, setDays] = useState<string[]>([]);
  const [walking, setWalking] = useState<WalkingCapability | null>(null);
  const [sessionLen, setSessionLen] = useState<SessionLength | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false); // verifying the OTP at the code step
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [memberships, setMemberships] = useState<Parameters<typeof completeAuth>[0]>(undefined);
  const captchaRef = useRef<TurnstileHandle>(null);

  // Doorknockers get an extra step (walking capability + session length) after "role".
  const flow = useMemo<Step[]>(
    () => ["phone", "code", "name", "role", ...(role === "doorknocker" ? (["doorknock"] as Step[]) : []), "conduct"],
    [role],
  );

  /**
   * The furthest step the answers so far actually support. A URL is a thing people paste,
   * bookmark and reload, so `?step=conduct` has to mean "as far as you have got", not
   * "skip the questions". Walking forward from the start means each step's prerequisites
   * are whatever the steps before it collect.
   */
  const reachedIndex = useMemo(() => {
    const satisfied = (s: Step): boolean => {
      switch (s) {
        case "code":
          return Boolean(challengeId);
        case "name":
          return code.length === 6;
        case "role":
          return Boolean(first.trim());
        case "doorknock":
          return Boolean(role);
        case "conduct":
          return role === "doorknocker" ? Boolean(walking && sessionLen) : Boolean(role);
        default:
          return false;
      }
    };
    let i = 0;
    while (i + 1 < flow.length && satisfied(flow[i + 1])) i++;
    return i;
  }, [flow, challengeId, code, first, role, walking, sessionLen]);

  const stepIndex = flow.indexOf(step as Step);
  const e164 = useMemo(() => toE164(phone), [phone]);

  // Snap an unreachable step (a stale deep link, a reload mid-flow) back to the last one
  // whose answers we still hold. `done` is reachable only while its result is in memory.
  useEffect(() => {
    if (step === "done") {
      if (memberships === undefined) goTo("phone", { replace: true });
      return;
    }
    const idx = flow.indexOf(step as Step);
    if (idx === -1 || idx > reachedIndex) goTo(flow[reachedIndex], { replace: true });
  }, [step, flow, reachedIndex, memberships, goTo]);

  const back = () => {
    setError(null);
    if (stepIndex <= 0) {
      goTo(null, { replace: true }); // out of the flow, back to the campaign hero
      return;
    }
    // Prefer the real Back stack so it matches the phone's own gesture.
    if (canGoBack) window.history.back();
    else goTo(flow[stepIndex - 1], { replace: true });
  };

  // Resend countdown tick.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /**
   * Dev: no SMS goes out locally, so fetch the code and show it. It is NOT typed into the
   * boxes for you — filling it used to trip the auto-advance below, and the code screen
   * flashed past before anyone could read it. Mirrors `/volunteer/code`.
   */
  useEffect(() => {
    if (step !== "code" || !isDev || !challengeId) return;
    let cancelled = false;
    void auth.devPeekOtp(challengeId).then((res) => {
      if (cancelled || !res.ok) return;
      setDevCode(res.data.code);
      setSmsSent(res.data.smsSent);
    });
    return () => {
      cancelled = true;
    };
  }, [step, challengeId]);

  /**
   * Typing the sixth digit VERIFIES the code with the server, then advances — a wrong code is
   * caught here with an error instead of sailing through the whole form to fail at submit.
   * Keyed on the code *growing* to six (not merely being six), so stepping back with a full
   * code doesn't bounce forward again and the Back button still works.
   */
  const codeLen = useRef(0);
  useEffect(() => {
    const grewToSix = step === "code" && codeLen.current < 6 && code.length === 6;
    codeLen.current = code.length;
    if (!grewToSix || !challengeId) return;
    let cancelled = false;
    setChecking(true);
    setError(null);
    void auth.phoneCheck(challengeId, code).then((res) => {
      if (cancelled) return;
      setChecking(false);
      if (res.ok) {
        // Returning volunteer — their number is already an account. Skip the signup
        // questions and just log them in + join (finalise redirects away).
        if (res.data.existingUser) {
          void finalise({ existing: true });
        } else {
          goTo("name");
        }
      } else {
        setError(res.error);
        setCode(""); // clear so the six-digit input is ready for another try
      }
    });
    return () => {
      cancelled = true;
    };
    // `finalise` is intentionally omitted — the ref-guarded `grewToSix` gate prevents re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, code, challengeId, goTo]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = token
      ? await auth.inviteStartPhone({ token, phone: e164 }, captchaToken)
      : await auth.openJoinStartPhone({ campaignId: campaignId!, phone: e164 }, captchaToken);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setChallengeId(res.data.challengeId);
    setCode("");
    setDevCode(null);
    setResendIn(30);
    goTo("code");
  }

  async function resend() {
    if (resendIn > 0) return;
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = token
      ? await auth.inviteStartPhone({ token, phone: e164 }, captchaToken)
      : await auth.openJoinStartPhone({ campaignId: campaignId!, phone: e164 }, captchaToken);
    if (res.ok) {
      setChallengeId(res.data.challengeId);
      setDevCode(null);
      setResendIn(30);
    }
  }

  /**
   * Finalise the join. A NEW volunteer submits the answers they collected and lands on the
   * "done" screen. A RETURNING volunteer — their number is already an account, detected at the
   * code step — skips the signup questions entirely: we create the membership + session and
   * redirect them straight on (createMembershipTx is a no-op for an existing membership, and the
   * server keeps their existing name/role, so we send none of the profile fields).
   */
  async function finalise({ existing }: { existing: boolean }) {
    if (busy) return;
    if (!existing && !agreed) return;
    setBusy(true);
    setError(null);
    const displayName = [first.trim(), last.trim()].filter(Boolean).join(" ") || first.trim();
    const profile = existing
      ? {}
      : {
          displayName,
          preferredRole: (role as (typeof VOLUNTEER_PREFERRED_ROLES)[number]) ?? undefined,
          availabilityDays: days,
          // Doorknocker-only prefs — omitted for other roles even if partly filled.
          ...(role === "doorknocker"
            ? { walkingCapability: walking ?? undefined, sessionLength: sessionLen ?? undefined }
            : {}),
          ...captureAttribution(),
        };
    const res = token
      ? await auth.acceptInvite({ token, challengeId: challengeId ?? undefined, code: code || undefined, ...profile })
      : await auth.openJoinAccept({
          campaignId: campaignId!,
          challengeId: challengeId ?? undefined,
          code: code || undefined,
          ...profile,
        });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (existing) {
      // Just log in and go — no signup screens, no "done" celebration for a returning volunteer.
      if (onComplete) onComplete(res.data.memberships);
      else completeAuth(res.data.memberships, returnTo);
      return;
    }
    setMemberships(res.data.memberships);
    goTo("done", { replace: true }); // Back must not land on a submitted form
  }

  const submit = () => finalise({ existing: false });

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
          {role === "p2p-texter"
            ? "Your number is verified and you're ready to text voters. Your text banks will show up here."
            : "Your number is verified and you're ready to knock. Your organiser will assign you turf — it'll show up here."}
        </p>
        <dl className="mt-7 w-full space-y-0 rounded-2xl bg-surface-variant/60 px-5 text-sm">
          <Row label="Signed in as" value={formatAuMobile(phone)} />
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
          onClick={() => (onComplete ? onComplete(memberships) : completeAuth(memberships, returnTo))}
        >
          {completeLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] w-full flex-col">
      {tenantName ? <TenantBrand name={tenantName} logoUrl={tenantLogoUrl} className="mb-5" /> : null}
      <div className="mb-7 flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <StepProgress
          current={stepIndex + 1}
          total={flow.length}
          reachable={reachedIndex + 1}
          labels={flow.map((s) => STEP_LABEL[s])}
          onSelect={(n) => goTo(flow[n - 1], { replace: true })}
          className="flex-1"
        />
      </div>

      {/* Step 1 — phone */}
      {step === "phone" ? (
        <div className="flex flex-1 flex-col">
          <h1 className="text-3xl font-extrabold text-foreground">What&apos;s your mobile?</h1>
          <p className="mt-2 text-muted-foreground">
            Your number is your sign-in. We&apos;ll text you a code to verify it — no passwords.
          </p>
          <PhoneNumberField
            value={phone}
            className="mt-8"
            autoFocus
            onValueChange={(digits) => setPhone(digits)}
          />
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
            We texted a 6-digit code to <span className="font-bold text-foreground">{formatAuMobile(phone)}</span>.
          </p>
          <OtpInput value={code} onChange={setCode} length={6} autoFocus className="mt-7" />
          {checking || busy ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> {busy ? "Signing you in…" : "Checking your code…"}
            </p>
          ) : null}
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
          {isDev && devCode ? (
            <button
              type="button"
              onClick={() => setCode(devCode)}
              className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary"
            >
              <Shield className="h-4 w-4" />
              Dev code {devCode} — tap to fill{smsSent ? " (also texted)" : ""}
            </button>
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
            onClick={() => goTo("role")}
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
          <Button
            className="mt-6 h-14 w-full text-base"
            disabled={!role}
            onClick={() => goTo(role === "doorknocker" ? "doorknock" : "conduct")}
          >
            Continue
          </Button>
        </div>
      ) : null}

      {/* Step 4b — doorknocker details (walking capability + session length) */}
      {step === "doorknock" ? (
        <div className="flex flex-1 flex-col">
          <h1 className="text-3xl font-extrabold text-foreground">A bit about your knocking</h1>
          <p className="mt-2 text-muted-foreground">
            This helps your organiser match you to turf that suits you.
          </p>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
            How much walking suits you?
          </p>
          <RoleSelectCards
            className="mt-3"
            options={WALKING_OPTIONS}
            value={walking}
            onChange={(v) => setWalking(v as WalkingCapability)}
          />
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
            How long do you like to knock for?
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {SESSION_OPTIONS.map((o) => {
              const selected = sessionLen === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSessionLen(o.value)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-foreground hover:border-primary/40"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <Button
            className="mt-6 h-14 w-full text-base"
            disabled={!walking || !sessionLen}
            onClick={() => goTo("conduct")}
          >
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

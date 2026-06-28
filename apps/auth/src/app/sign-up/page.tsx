"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle, ChevronLeft, Loader2 } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
  PasswordInput,
  PasswordStrength,
  isPasswordStrong,
  Spinner,
  TurnstileWidget,
  type TurnstileHandle,
} from "@uprise/ui";
import { auth, tenants, type Membership } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";
import { useQueryParams } from "@/lib/use-query";

/** Auto-suggest a clean slug from the org name (trims stray hyphens). */
const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

/** Sanitise what the user types directly in the Workspace URL field: lowercase,
 *  map invalid chars to '-', and ALLOW hyphens anywhere (incl. trailing) so they
 *  can type "my-org-team" naturally. Final validation still uses the strict regex. */
const sanitizeSlugInput = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 64);

type SlugState = "idle" | "checking" | "available" | "unavailable";

export default function SignUpPage() {
  const returnTo = useQueryParams().get("return_to");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — organisation
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);

  // Step 2 — personal
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  // Debounced subdomain availability check.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    setSuggestion(null);
    if (!slug) {
      setSlugState("idle");
      return;
    }
    setSlugState("checking");
    debounce.current = setTimeout(async () => {
      const res = await tenants.checkAvailability(slug);
      if (!res.ok) {
        setSlugState("idle");
        return;
      }
      if (res.data.available) {
        setSlugState("available");
      } else {
        setSlugState("unavailable");
        setSuggestion(`${slug}-${Math.floor(Math.random() * 90 + 10)}`);
      }
    }, 400);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [slug]);

  function next(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!orgName.trim() || !slug.trim()) {
      setError("Organisation name and workspace URL are required.");
      return;
    }
    if (slugState === "unavailable") {
      setError("That workspace URL is taken.");
      return;
    }
    setStep(2);
  }

  const passwordsMatch = confirm.length > 0 && password === confirm;
  const canCreate = isPasswordStrong(password) && passwordsMatch && Boolean(email.trim());

  const captchaRef = useRef<TurnstileHandle>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    const displayName = [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(" ");
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.register(
      {
        email: email.trim(),
        password,
        displayName: displayName || undefined,
        orgName: orgName.trim(),
        slug: slug.trim(),
      },
      captchaToken,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMemberships(res.data.memberships);
    setStep(3);
  }

  // Step 3 — brief success, then complete the session + redirect.
  useEffect(() => {
    if (step !== 3) return;
    const t = setTimeout(() => completeAuth(memberships, returnTo), 1800);
    return () => clearTimeout(t);
  }, [step, memberships, returnTo]);

  const homepageUrl = process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:3003";

  return (
    <div className="flex w-full flex-col">
      <div className="mb-5">
        <a href={homepageUrl} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to homepage
        </a>
      </div>

      {step < 3 ? (
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Step {step} of 2
          </p>
          <div className="mb-4 flex gap-1.5">
            {[1, 2].map((s) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
            {step === 1 ? "Organisation setup" : "Personal info"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 1 ? "Tell us about your organisation." : "Set up your admin account."}
          </p>
        </div>
      ) : null}

      {step === 1 ? (
        <form onSubmit={next} className="space-y-5">
          <Field label="Organisation name" htmlFor="orgName">
            <Input
              id="orgName"
              required
              placeholder="Your organisation"
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field
            label="Workspace URL"
            htmlFor="slug"
            hint="Lowercase letters, numbers and hyphens"
            error={slugState === "unavailable" ? "That URL is taken." : undefined}
          >
            <div className="relative">
              <Input
                id="slug"
                required
                value={slug}
                placeholder="your-org"
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(sanitizeSlugInput(e.target.value));
                }}
                className="pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugState === "checking" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                {slugState === "available" ? <CheckCircle className="h-4 w-4 text-success-500" /> : null}
                {slugState === "unavailable" ? <AlertCircle className="h-4 w-4 text-error-500" /> : null}
              </span>
            </div>
          </Field>
          {suggestion ? (
            <button
              type="button"
              onClick={() => setSlug(suggestion)}
              className="cursor-pointer text-sm text-primary hover:underline"
            >
              Use suggestion: {suggestion}
            </button>
          ) : null}
          {error ? <Alert variant="error" title={error} /> : null}
          <Button type="submit" className="w-full" disabled={slugState === "checking"}>
            Continue
          </Button>
        </form>
      ) : step === 2 ? (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName">
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>
          <Field label="Email address" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <PasswordStrength value={password} />
          <Field
            label="Confirm password"
            htmlFor="confirm"
            error={confirm.length > 0 && !passwordsMatch ? "Passwords don't match." : undefined}
          >
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {error ? <Alert variant="error" title={error} /> : null}
          <TurnstileWidget ref={captchaRef} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || !canCreate}>
              {busy ? (<><Spinner className="mr-2" />Creating…</>) : "Create account"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col items-center py-10 text-center">
          <CheckCircle className="mb-4 h-12 w-12 text-success-500" />
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90">
            Account created
          </h1>
          <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
        </div>
      )}

      {step < 3 ? (
        <div className="mt-5 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="text-primary hover:underline" href="/sign-in">
            Sign in
          </Link>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { Alert, Button, Card, CardContent, Field, Input, OtpInput, PasswordInput } from "@uprise/ui";
import { auth, getAuthAppUrl } from "@uprise/api-client";

type Role = "staff" | "volunteer";
type Step = "form" | "verify" | "pending" | "already-member";

export default function JoinPage() {
  const slug = String(useParams().slug ?? "");
  const [step, setStep] = useState<Step>("form");

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("volunteer");
  const [code, setCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInUrl = `${getAuthAppUrl()}/sign-in`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !displayName.trim() || password.length < 8) return;
    setBusy(true);
    setError(null);
    const res = await auth.requestAccess({
      email: email.trim(),
      password,
      displayName: displayName.trim(),
      requestedRole: role,
      tenantSlug: slug,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep(res.data.alreadyMember ? "already-member" : "verify");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.confirmAccess({ email: email.trim(), code, tenantSlug: slug });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep("pending");
  }

  if (step === "pending") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-10 text-center">
          <CheckCircle className="mb-4 h-12 w-12 text-success-500" />
          <h1 className="mb-2 text-xl font-semibold">Request received</h1>
          <p className="text-sm text-muted-foreground">
            An organiser will review your request. You can sign in here once you&apos;re approved.
          </p>
          <Button asChild className="mt-5">
            <a href={signInUrl}>Go to sign in</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "already-member") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-10 text-center">
          <h1 className="mb-2 text-xl font-semibold">You&apos;re already a member</h1>
          <p className="text-sm text-muted-foreground">This email already has access — just sign in.</p>
          <Button asChild className="mt-5">
            <a href={signInUrl}>Go to sign in</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">{step === "form" ? "Request to join" : "Verify your email"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "form"
              ? "Sign up and an organiser will approve your access."
              : `Enter the code we sent to ${email}.`}
          </p>
        </div>

        {step === "form" ? (
          <form onSubmit={submit} className="space-y-5">
            <Field label="Full name" htmlFor="name">
              <Input id="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="password" hint="At least 8 characters">
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="I am a…" htmlFor="role">
              <div className="grid grid-cols-2 gap-2">
                {(["volunteer", "staff"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                      role === r
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-foreground hover:bg-surface-variant"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </Field>
            {error ? <Alert variant="error" title={error} /> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Submitting…" : "Request access"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <a className="text-primary hover:underline" href={signInUrl}>
                Sign in
              </a>
            </p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-5">
            <Field label="Verification code" htmlFor="code">
              <OtpInput value={code} onChange={setCode} />
            </Field>
            {error ? <Alert variant="error" title={error} /> : null}
            <Button type="submit" className="w-full" disabled={busy || code.length < 4}>
              {busy ? "Verifying…" : "Verify"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

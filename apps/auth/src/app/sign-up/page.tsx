"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Alert, Button, Field, Input, PasswordInput } from "@yarns/ui";
import { auth } from "@yarns/api-client";
import { completeAuth } from "@/lib/session";
import { useQueryParams } from "@/lib/use-query";

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

export default function SignUpPage() {
  const returnTo = useQueryParams().get("return_to");
  const [step, setStep] = useState<1 | 2>(1);
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function next(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!orgName.trim() || !slug.trim()) {
      setError("Organisation name and workspace URL are required.");
      return;
    }
    setStep(2);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.register({
      email: email.trim(),
      password,
      displayName: displayName.trim() || undefined,
      orgName: orgName.trim(),
      slug: slug.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    completeAuth(res.data.memberships, returnTo);
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-5">
        <Link href="/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
          {step === 1 ? "Create your workspace" : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {step === 1 ? "Tell us about your organisation to get started." : "Set up your admin account."}
        </p>
      </div>
      {step === 1 ? (
        <form onSubmit={next} className="space-y-5">
          <Field label="Organisation name" htmlFor="orgName">
            <Input
              id="orgName"
              required
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Workspace URL (slug)" htmlFor="slug" hint="lowercase letters, numbers and hyphens" error={error ?? undefined}>
            <Input
              id="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Button type="submit" className="w-full">Continue</Button>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="Your name" htmlFor="name">
            <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters" error={error ?? undefined}>
            <PasswordInput id="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setStep(1)}>Back</Button>
            <Button type="submit" className="flex-1" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
          </div>
        </form>
      )}
      <div className="mt-5 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="text-primary hover:underline" href="/login">Sign in</Link>
      </div>
    </div>
  );
}

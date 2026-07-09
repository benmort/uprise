"use client";

/**
 * Sign-up — split-screen client-portal view (chrome-less). Left: dark panel
 * with the onboarding statement + feature bullets; right: the form. No
 * backend exists yet, so submit is stubbed with a coming-soon note.
 */
import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/chrome/SiteHeader";
import { Field, Input, Button } from "@/components/forms/fields";

const FEATURES = [
  "Live fundraising dashboards",
  "Edit content without a ticket",
  "Direct line to your build pod",
];

export default function SignUpPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Left — dark statement panel */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-ink p-10 text-cream">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 top-10 h-[300px] w-[300px] rounded-full opacity-[0.22] blur-[6px]"
          style={{
            background: "radial-gradient(circle at 30% 30%, #EC4A2B, #c9351d)",
            animation: "floaty 11s ease-in-out infinite",
          }}
        />
        <Wordmark dark />
        <div className="relative max-w-[440px]">
          <div className="mb-5 font-mono text-xs font-medium uppercase tracking-[0.08em] text-vermilion">
            GET SET UP
          </div>
          <p
            className="mb-8 font-medium leading-[1.32] tracking-[-0.02em]"
            style={{ fontSize: "clamp(24px,2.4vw,34px)" }}
          >
            Create your portal account and we will get your team onboarded
            within a day.
          </p>
          <div className="flex flex-col gap-3.5">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-[15px]">
                <span className="text-vermilion" aria-hidden>
                  ◆
                </span>{" "}
                {feature}
              </div>
            ))}
          </div>
        </div>
        <div className="font-mono text-xs font-medium text-cream/45">
          © 2026 UPRISE LABS
        </div>
      </div>

      {/* Right — the form */}
      <div className="flex items-center justify-center bg-cream px-10 py-16">
        <div className="mx-auto w-full max-w-[400px]">
          <h1 className="mb-2.5 text-[34px] font-extrabold tracking-[-0.03em]">
            Create account.
          </h1>
          <p className="mb-10 text-base text-ink/60">
            Start with your organisation.
          </p>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
          >
            <Field label="Full name" htmlFor="signup-name">
              <Input id="signup-name" required placeholder="Jane Organiser" />
            </Field>
            <Field label="Work email" htmlFor="signup-email">
              <Input
                id="signup-email"
                type="email"
                required
                placeholder="jane@campaign.org"
              />
            </Field>
            <Field label="Password" htmlFor="signup-password">
              <Input
                id="signup-password"
                type="password"
                required
                placeholder="At least 12 characters"
              />
            </Field>
            <Button type="submit" variant="dark" className="w-full">
              Create account
            </Button>
          </form>
          {submitted && (
            <p className="mt-5 font-mono text-sm text-vermilion" role="status">
              Client portal access is coming soon – talk to your build pod.
            </p>
          )}
          <div className="mt-7 text-[14.5px] text-ink/60">
            Already have one?{" "}
            <Link href="/sign-in" className="font-semibold text-vermilion">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

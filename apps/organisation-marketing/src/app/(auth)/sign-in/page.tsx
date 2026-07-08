"use client";

/**
 * Sign-in — split-screen client-portal view (chrome-less). Left: dark panel
 * with the war-room statement; right: the form. No backend exists yet, so
 * submit is stubbed with a coming-soon note.
 */
import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/chrome/SiteHeader";
import { Field, Input, Button } from "@/components/forms/fields";

export default function SignInPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Left — dark statement panel */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-ink p-10 text-cream">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-[60px] -right-10 h-[300px] w-[300px] rounded-full opacity-[0.22] blur-[6px]"
          style={{
            background: "radial-gradient(circle at 30% 30%, #EC4A2B, #c9351d)",
            animation: "floaty 10s ease-in-out infinite",
          }}
        />
        <Wordmark dark />
        <div className="relative max-w-[420px]">
          <div className="mb-5 font-mono text-xs font-medium uppercase tracking-[0.08em] text-vermilion">
            CLIENT WAR ROOM
          </div>
          <p
            className="font-medium leading-[1.32] tracking-[-0.02em]"
            style={{ fontSize: "clamp(24px,2.4vw,34px)" }}
          >
            Your dashboards, your content, your live fundraising numbers — all
            in one place, 24/7.
          </p>
        </div>
        <div className="font-mono text-xs font-medium text-cream/45">
          © 2026 UPRISE LABS
        </div>
      </div>

      {/* Right — the form */}
      <div className="flex items-center justify-center bg-cream px-10 py-16">
        <div className="mx-auto w-full max-w-[400px]">
          <h1 className="mb-2.5 text-[34px] font-extrabold tracking-[-0.03em]">
            Welcome back.
          </h1>
          <p className="mb-10 text-base text-ink/60">
            Sign in to your client portal.
          </p>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
          >
            <Field label="Email" htmlFor="signin-email">
              <Input
                id="signin-email"
                type="email"
                required
                placeholder="you@campaign.org"
              />
            </Field>
            <Field label="Password" htmlFor="signin-password">
              <Input
                id="signin-password"
                type="password"
                required
                placeholder="••••••••"
              />
            </Field>
            <div className="flex items-center justify-between text-[13.5px]">
              <label className="flex cursor-pointer items-center gap-2 text-ink/65">
                <input type="checkbox" className="accent-vermilion" /> Keep me
                signed in
              </label>
              <a href="#" className="font-semibold text-vermilion">
                Forgot password?
              </a>
            </div>
            <Button type="submit" variant="dark" className="w-full">
              Sign in
            </Button>
          </form>
          {submitted && (
            <p className="mt-5 font-mono text-sm text-vermilion" role="status">
              Client portal access is coming soon – talk to your build pod.
            </p>
          )}
          <div className="mt-7 text-[14.5px] text-ink/60">
            New here?{" "}
            <Link href="/sign-up" className="font-semibold text-vermilion">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

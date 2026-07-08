"use client";

import { useRef, useState } from "react";
import { marketing } from "@uprise/api-client";
import { TurnstileWidget, type TurnstileHandle } from "@uprise/ui";

/**
 * The footer's Dispatch signup: underline-style email input + vermilion arrow,
 * posting to the shared public /marketing/newsletter intake.
 */
export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const captchaRef = useRef<TurnstileHandle>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === "busy") return;
    setStatus("busy");
    try {
      const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
      const res = await marketing.newsletter(email.trim(), captchaToken);
      setStatus(res.ok ? "success" : "error");
      if (res.ok) setEmail("");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return <p className="font-mono text-xs text-cream/60">You&apos;re on the list. ✓</p>;
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-3" noValidate>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@campaign.org"
        aria-label="Email address"
        className="w-full border-0 border-b-[1.5px] border-cream/30 bg-transparent px-0 py-2 text-[15px] text-cream outline-none transition-colors placeholder:text-cream/35 focus:border-vermilion"
      />
      <TurnstileWidget ref={captchaRef} />
      <button
        type="submit"
        aria-label="Subscribe"
        disabled={status === "busy"}
        className="border-b-[1.5px] border-vermilion pb-2 text-xl leading-none text-vermilion transition-colors hover:text-cream disabled:opacity-50"
      >
        →
      </button>
      {status === "error" ? (
        <span className="font-mono text-[11px] text-vermilion">Try again</span>
      ) : null}
    </form>
  );
}

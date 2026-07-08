"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import { marketing } from "@uprise/api-client";
import { TurnstileWidget, type TurnstileHandle } from "@uprise/ui";
import { Button, Field, Input, Textarea } from "./fields";

const schema = z.object({
  name: z.string().min(1, "Your name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  organisation: z.string().optional(),
  message: z.string().min(1, "Tell us what you're building"),
});

type FormData = z.infer<typeof schema>;
const initial: FormData = { name: "", email: "", organisation: "", message: "" };

/**
 * The contact view's form, posting to the shared public /marketing/contact
 * intake. The subject carries an [Uprise Labs] prefix so the shared
 * MARKETING_NOTIFY_EMAIL inbox can distinguish org-site enquiries.
 */
export function ContactForm() {
  const [data, setData] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const captchaRef = useRef<TurnstileHandle>(null);

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setData((d) => ({ ...d, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors(
        Object.fromEntries(
          Object.entries(fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""]),
        ) as Partial<Record<keyof FormData, string>>,
      );
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
      const res = await marketing.contact(
        {
          name: data.name,
          email: data.email,
          company: data.organisation,
          subject: "[Uprise Labs] New project enquiry",
          message: data.message,
        },
        captchaToken,
      );
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  if (status === "success") {
    return (
      <div>
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-vermilion text-2xl text-cream">
          ✓
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight">Message received.</h2>
        <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ink/65">
          Thanks for reaching out. Someone from our team will get back to you within one
          business day. If it&apos;s urgent — like, election-urgent — call the number on the
          right.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      <div className="grid gap-8 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" placeholder="Jane Organizer" value={data.name} onChange={set("name")} required />
          {errors.name ? <p className="mt-1.5 font-mono text-xs text-vermilion">{errors.name}</p> : null}
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="jane@campaign.org" value={data.email} onChange={set("email")} required />
          {errors.email ? <p className="mt-1.5 font-mono text-xs text-vermilion">{errors.email}</p> : null}
        </Field>
      </div>
      <Field label="Organization" htmlFor="organisation">
        <Input id="organisation" name="organisation" placeholder="Rivera for Senate" value={data.organisation ?? ""} onChange={set("organisation")} />
      </Field>
      <Field label="What are you building?" htmlFor="message">
        <Textarea id="message" name="message" rows={4} value={data.message} onChange={set("message")} required />
        {errors.message ? <p className="mt-1.5 font-mono text-xs text-vermilion">{errors.message}</p> : null}
      </Field>
      <TurnstileWidget ref={captchaRef} />
      <Button type="submit" variant="dark" disabled={busy}>
        {busy ? "Sending…" : "Send message →"}
      </Button>
      {status === "error" ? (
        <p className="font-mono text-xs text-vermilion">
          Something went wrong sending your message — please try again.
        </p>
      ) : null}
    </form>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Send, Smartphone } from "lucide-react";
import { formatAuMobile, toE164 } from "@uprise/ui";
import { tenants, messageTemplates, type MessageTemplate } from "@uprise/api-client";
import { SectionCard } from "@uprise/field";
import { getSession, goToLogin } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Role = "VOLUNTEER" | "ORGANISER";
type Mode = "phone" | "email";

// The join link is substituted server-side wherever this placeholder appears (else appended),
// so an organiser can position it — and can never accidentally drop it.
const LINK_TOKEN = "{{invite_link}}";
const NAME_TOKEN = "{{firstname}}";
const DEFAULT_SMS = `Hi ${NAME_TOKEN}, you're invited to become a volunteer. Tap to accept: ${LINK_TOKEN}`;
const DEFAULT_EMAIL = `Hi ${NAME_TOKEN},\n\nWe'd love your help. Tap the link below to join as a volunteer — it takes a minute.\n\n${LINK_TOKEN}\n\nThank you!`;
// Radix forbids an empty-string item value, so the "Default invite" option uses a sentinel.
const NO_TEMPLATE = "__default__";

/**
 * Invite a volunteer with a composed, transactional message. Two channels — SMS or email —
 * each a compose view: pick a transactional template to prefill the body (edit freely), set
 * the recipient + role, and send. The accept link is injected server-side ({{invite_link}}),
 * so it's always present. Email adds a subject. `onInvited` refreshes the caller's roster.
 */
export function InviteVolunteerCard({ onInvited }: { onInvited?: () => void }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>("phone");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState(""); // national digits
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VOLUNTEER");
  const [subject, setSubject] = useState("You're invited to volunteer");
  const [body, setBody] = useState(DEFAULT_SMS);
  const [templateId, setTemplateId] = useState(NO_TEMPLATE);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  // Advisory permission gate (the API enforces): inviting needs `manage tenant.invitation`,
  // held by OWNER (tenant.all) + ORGANISER. A volunteer browsing this page sees no card
  // rather than a card that can only end in "Missing permission".
  const [canInvite, setCanInvite] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSession().then((session) => {
      if (!alive) return;
      setCanInvite(
        Boolean(session?.isSuperAdmin || session?.role === "OWNER" || session?.role === "ORGANISER"),
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  // Transactional templates the organiser can pull copy from (best-effort — the compose
  // view works without any, using the channel default).
  useEffect(() => {
    let alive = true;
    void messageTemplates.list().then((res) => {
      if (alive && res.ok) setTemplates(res.data.filter((t) => t.isActive));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Swap the channel default in when the body is still the other channel's untouched default,
  // so flipping SMS↔Email doesn't leave stale copy — but never clobber edits or a picked template.
  const switchMode = (m: Mode) => {
    setMode(m);
    setBody((cur) => {
      if (templateId !== NO_TEMPLATE) return cur;
      if (m === "email" && cur === DEFAULT_SMS) return DEFAULT_EMAIL;
      if (m === "phone" && cur === DEFAULT_EMAIL) return DEFAULT_SMS;
      return cur;
    });
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (id === NO_TEMPLATE) {
      setBody(mode === "email" ? DEFAULT_EMAIL : DEFAULT_SMS);
      return;
    }
    const t = templates.find((x) => x.id === id);
    if (t) setBody(t.body);
  };

  const visibleTemplates = useMemo(
    // Email has no SMS-only concept, so any transactional template's body is usable as a starting
    // point; SMS mode hides WhatsApp templates (different composition rules).
    () => (mode === "phone" ? templates.filter((t) => t.channel !== "WHATSAPP") : templates),
    [templates, mode],
  );

  const submit = useCallback(async () => {
    // Two distinct "no tenant" cases, previously conflated into one misleading toast:
    // a dead session (12h TTL expired under a still-rendered SPA) must re-auth, and only
    // a genuinely workspace-less principal (super-admin with nothing pinned) is told so.
    const session = await getSession();
    if (!session) {
      showToast({ tone: "warning", title: "Session expired", description: "Sending you to sign in…" });
      goToLogin();
      return;
    }
    const tenantId = session.tenantId;
    if (!tenantId) {
      showToast({
        tone: "error",
        title: "No active workspace",
        description: "Pick a workspace from the switcher first — invites are sent from a workspace.",
      });
      return;
    }
    if (mode === "phone") {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 9) {
        showToast({ tone: "warning", title: "Enter a mobile number", description: "An Australian mobile, e.g. 04xx xxx xxx." });
        return;
      }
      setBusy(true);
      const res = await tenants.createInvitation(tenantId, {
        phone: toE164(digits),
        role,
        message: body,
        firstName: firstName.trim() || undefined,
      });
      setBusy(false);
      if (!res.ok) return showToast({ tone: "error", title: "Couldn't send invite", description: res.error });
      setPhone("");
      setFirstName("");
      onInvited?.();
      showToast({ tone: "success", title: "Invite texted", description: `On its way to ${formatAuMobile(digits)}.` });
    } else {
      if (!email.trim() || !subject.trim()) {
        showToast({ tone: "warning", title: "Add an email and subject" });
        return;
      }
      setBusy(true);
      const res = await tenants.createInvitation(tenantId, {
        email: email.trim(),
        role,
        subject: subject.trim(),
        message: body,
        firstName: firstName.trim() || undefined,
      });
      setBusy(false);
      if (!res.ok) return showToast({ tone: "error", title: "Couldn't send invite", description: res.error });
      setEmail("");
      setFirstName("");
      onInvited?.();
      showToast({ tone: "success", title: "Invite emailed", description: `On its way to ${email.trim()}.` });
    }
  }, [mode, phone, email, subject, body, role, firstName, onInvited, showToast]);

  if (!canInvite) return null;

  return (
    <SectionCard
      title="Invite a volunteer"
      description="Compose a transactional invite — pick a template, edit it, and text or email a join link."
    >
      {/* Channel: text an SMS invite, or email one. */}
      <div className="mb-3 flex w-fit rounded-xl border border-border p-0.5">
        {(["phone", "email"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              mode === m ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
            )}
          >
            {m === "phone" ? <Smartphone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
            {m === "phone" ? "SMS" : "Email"}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <Field
          label="First name"
          htmlFor="iv-firstname"
          hint="Personalises the message via the {{firstname}} tag. Optional — defaults to “there”."
        >
          <Input
            id="iv-firstname"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Sam"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "phone" ? (
          <Field label="Mobile number" htmlFor="iv-mobile" required hint="We'll text them a join link.">
            <Input
              id="iv-mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={formatAuMobile(phone.replace(/\D/g, ""))}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="04xx xxx xxx"
            />
          </Field>
        ) : (
          <Field label="Email" htmlFor="iv-email" required>
            <Input id="iv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@org.au" />
          </Field>
        )}
        <Field label="Role" htmlFor="iv-role">
          <Select id="iv-role" value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectItem value="VOLUNTEER">Volunteer</SelectItem>
            <SelectItem value="ORGANISER">Organiser</SelectItem>
          </Select>
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Template" htmlFor="iv-template" hint={visibleTemplates.length ? undefined : "No saved templates — the default is used."}>
          <Select
            id="iv-template"
            value={templateId}
            onValueChange={applyTemplate}
            disabled={visibleTemplates.length === 0}
          >
            <SelectItem value={NO_TEMPLATE}>Default invite</SelectItem>
            {visibleTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.key}
              </SelectItem>
            ))}
          </Select>
        </Field>
        {mode === "email" ? (
          <Field label="Subject" htmlFor="iv-subject" required>
            <Input id="iv-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        ) : null}
      </div>

      <div className="mt-3">
        <Field
          label="Message"
          htmlFor="iv-body"
          required
          hint={`Merge tags: ${NAME_TOKEN} (recipient's first name) and ${LINK_TOKEN} (their personal join link — added automatically if you remove it).`}
        >
          <textarea
            id="iv-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={mode === "email" ? 6 : 3}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>
      </div>

      <Button className="mt-3" onClick={submit} disabled={busy}>
        <Send className="mr-1.5 h-4 w-4" />
        {mode === "phone" ? "Text invite" : "Email invite"}
      </Button>
    </SectionCard>
  );
}

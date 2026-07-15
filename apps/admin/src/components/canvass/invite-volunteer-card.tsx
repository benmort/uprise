"use client";

import { useCallback, useState } from "react";
import { Mail, Smartphone, UserPlus } from "lucide-react";
import { formatAuMobile, toE164 } from "@uprise/ui";
import { tenants } from "@uprise/api-client";
import { SectionCard } from "@uprise/field";
import { createVolunteer } from "@/lib/api";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Role = "VOLUNTEER" | "ORGANISER";
type Mode = "email" | "phone";

/**
 * Invite a volunteer two ways: an email + password field login (createVolunteer), or a
 * phone invite delivered by SMS — the volunteer taps the texted link and joins phone-first
 * (no password), landing with the chosen role. The phone path reuses the existing
 * `tenants.createInvitation({ phone, role })` (which sends the SMS); the name isn't needed
 * up front — the volunteer enters it during signup. `onInvited` refreshes the caller's roster.
 */
export function InviteVolunteerCard({ onInvited }: { onInvited?: () => void }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(""); // national digits
  const [role, setRole] = useState<Role>("VOLUNTEER");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setPhone("");
  };

  const submitEmail = useCallback(async () => {
    if (!name.trim() || !email.trim() || password.length < 8) {
      showToast({ tone: "warning", title: "Fill all fields", description: "Password must be 8+ characters." });
      return;
    }
    setBusy(true);
    const res = await createVolunteer({ displayName: name.trim(), email: email.trim(), password, role });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create login", description: res.error });
      return;
    }
    reset();
    onInvited?.();
    showToast({ tone: "success", title: "Field login created", description: res.data.email ?? "" });
  }, [name, email, password, role, onInvited, showToast]);

  const submitPhone = useCallback(async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      showToast({ tone: "warning", title: "Enter a mobile number", description: "An Australian mobile, e.g. 04xx xxx xxx." });
      return;
    }
    const tenantId = (await getSession())?.tenantId;
    if (!tenantId) {
      showToast({ tone: "error", title: "No active workspace" });
      return;
    }
    setBusy(true);
    const res = await tenants.createInvitation(tenantId, { phone: toE164(digits), role });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't send invite", description: res.error });
      return;
    }
    reset();
    onInvited?.();
    showToast({ tone: "success", title: "Invite texted", description: `A sign-up link is on its way to ${formatAuMobile(digits)}.` });
  }, [phone, role, onInvited, showToast]);

  return (
    <SectionCard
      title="Invite a volunteer"
      description={
        mode === "email"
          ? "Issues a field login (email + password) for your team."
          : "Texts a sign-up link — they join with their phone, no password."
      }
    >
      {/* Delivery: an email/password login, or a phone invite by SMS. */}
      <div className="mb-3 flex w-fit rounded-xl border border-border p-0.5">
        {(["email", "phone"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              mode === m ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
            )}
          >
            {m === "email" ? <Mail className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
            {m === "email" ? "Email login" : "Phone (SMS)"}
          </button>
        ))}
      </div>

      {mode === "email" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="cv-name" required>
            <Input id="cv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Email" htmlFor="cv-email" required>
            <Input id="cv-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@org.au" type="email" />
          </Field>
          <Field label="Temporary password" htmlFor="cv-pw" required hint="8+ characters.">
            <Input id="cv-pw" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" />
          </Field>
          <Field label="Role" htmlFor="cv-role">
            <Select id="cv-role" value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectItem value="VOLUNTEER">Volunteer</SelectItem>
              <SelectItem value="ORGANISER">Organiser</SelectItem>
            </Select>
          </Field>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mobile number" htmlFor="cv-mobile" required hint="We'll text them a sign-up link.">
            <Input
              id="cv-mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={formatAuMobile(phone.replace(/\D/g, ""))}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="04xx xxx xxx"
            />
          </Field>
          <Field label="Role" htmlFor="cv-role-phone">
            <Select id="cv-role-phone" value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectItem value="VOLUNTEER">Volunteer</SelectItem>
              <SelectItem value="ORGANISER">Organiser</SelectItem>
            </Select>
          </Field>
        </div>
      )}

      <Button className="mt-3" onClick={mode === "email" ? submitEmail : submitPhone} disabled={busy}>
        <UserPlus className="mr-1.5 h-4 w-4" />
        {mode === "email" ? "Invite" : "Text invite"}
      </Button>
    </SectionCard>
  );
}

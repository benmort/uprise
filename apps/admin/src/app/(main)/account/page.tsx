"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Laptop, Lock, Mail, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  OtpInput,
  PasswordInput,
  PhoneInput,
  Skeleton,
  Spinner,
  Switch,
  formatPhoneDisplay,
} from "@uprise/ui";
import { auth, profile, sessions as sessionsApi, type SessionSummaryResponse } from "@uprise/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { OriginBackLink, useDeepLinkPulse } from "@/components/setup/origin-deep-link";
import { getSession, logout } from "@/lib/session";

type Flags = {
  email: string | null;
  mobile: string | null;
  role: string;
  emailVerified: boolean;
  mobileVerified: boolean;
  twofaEnabled: boolean;
};

/** Self-service account (prog parity, uprise conventions): email, password, 2FA, danger zone. */
export default function AccountPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  // Where the user came from (e.g. the getting-started checklist's 2FA step) — drives a back link.
  const origin = searchParams.get("origin");
  const [flags, setFlags] = useState<Flags | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoadError(false);
    // Session carries the verification flags + email; the profile carries the mobile number
    // (the session doesn't), so the Mobile card can show "Your mobile is …" like the email one.
    const [session, prof] = await Promise.all([getSession(), profile.get()]);
    if (!session) {
      setLoadError(true);
      return;
    }
    setFlags({
      email: session.email ?? null,
      mobile: prof.ok ? prof.data.phone : null,
      role: session.role ?? "",
      emailVerified: Boolean(session.emailVerified),
      mobileVerified: Boolean(session.mobileVerified),
      twofaEnabled: Boolean(session.twofaEnabled),
    });
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: a hash (from a getting-started step) scrolls to and briefly pulses the
  // matching card — #two-factor (2FA / mobile) or #verify-email. Runs once mounted.
  useDeepLinkPulse(Boolean(flags));

  if (loadError && !flags) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Couldn't load your account"
          description="We couldn't reach your account details. Check your connection and try again."
          ctaLabel="Retry"
          onCta={() => void load()}
        />
      </div>
    );
  }

  if (!flags) {
    return (
      <div className="page-stack">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <OriginBackLink />
      <div>
        <h1 className="text-3xl font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground">Sign-in, security and account controls.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EmailCard email={flags.email} verified={flags.emailVerified} onRefresh={() => void load()} />
        <MobileCard
          mobile={flags.mobile}
          verified={flags.mobileVerified}
          twofaEnabled={flags.twofaEnabled}
          onRefresh={() => void load()}
        />
      </div>

      <ChangePasswordCard />

      <SessionsCard />

      <DeleteAccountCard />
    </div>
  );

  function notifyOk(title: string) {
    showToast({ tone: "success", title });
  }
  function notifyErr(title: string, description?: string) {
    showToast({ tone: "error", title, description });
  }

  // ── Email (verification + status) ───────────────────────────────────
  // Always shown (above 2FA) with a status chip, so "is my email verified?" is answerable at
  // a glance — not a banner that vanishes once verified. When unverified, the verify flow lives
  // right here. Keeps id="verify-email" for the getting-started deep-link + pulse.
  function EmailCard({
    email,
    verified,
    onRefresh,
  }: {
    email: string | null;
    verified: boolean;
    onRefresh: () => void;
  }) {
    const [sent, setSent] = useState(false);
    const [code, setCode] = useState("");
    // Which action is in-flight — every button disables, only the running one spins.
    const [busy, setBusy] = useState<null | "send" | "confirm" | "change">(null);
    const [changing, setChanging] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [password, setPassword] = useState("");

    const send = async () => {
      if (!email) return;
      setBusy("send");
      const res = await auth.sendEmailVerification(email);
      setBusy(null);
      if (res.ok) {
        setSent(true);
        notifyOk("Verification code sent");
      } else notifyErr("Couldn't send code", res.error);
    };
    const confirm = async () => {
      if (!email) return;
      setBusy("confirm");
      const res = await auth.confirmEmailVerification(email, code);
      setBusy(null);
      if (res.ok) {
        notifyOk("Email verified");
        setCode("");
        setSent(false);
        onRefresh();
      } else notifyErr("Invalid code", res.error);
    };
    const changeEmail = async () => {
      setBusy("change");
      const res = await profile.changeEmail({ newEmail, password });
      setBusy(null);
      if (res.ok) {
        notifyOk("Email updated — verify the new address below");
        setNewEmail("");
        setPassword("");
        setChanging(false);
        setSent(false);
        onRefresh();
      } else notifyErr("Couldn't change email", res.error);
    };

    return (
      <Card id="verify-email" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" /> Email
            <Badge variant={verified ? "success" : "warning"} dot className="ml-auto">
              {verified ? "Verified" : "Not verified"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {email ? (
              <>
                Your sign-in email is <span className="font-medium text-foreground">{email}</span>.
              </>
            ) : (
              "No email on file."
            )}
          </p>

          {/* Verify the current (or a newly-changed) address. */}
          {verified || !email ? null : !sent ? (
            <Button onClick={() => void send()} disabled={busy !== null}>
              {busy === "send" ? (<><Spinner className="mr-2" />Sending…</>) : "Send verification code"}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <OtpInput value={code} onChange={setCode} disabled={busy !== null} />
              <Button onClick={() => void confirm()} disabled={busy !== null || code.length < 4}>
                {busy === "confirm" ? (<><Spinner className="mr-2" />Verifying…</>) : "Verify"}
              </Button>
              <Button variant="ghost" onClick={() => void send()} disabled={busy !== null}>
                {busy === "send" ? (<><Spinner className="mr-2" />Sending…</>) : "Resend"}
              </Button>
            </div>
          )}

          {/* Change to a new address — resets verification, then verify it above. */}
          <div className="border-t border-border pt-3">
            {!changing ? (
              <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
                Change email
              </Button>
            ) : (
              <div className="space-y-3">
                <Field label="New email" htmlFor="new-email">
                  <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </Field>
                <Field label="Confirm password" htmlFor="email-pw">
                  <PasswordInput id="email-pw" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button onClick={() => void changeEmail()} disabled={busy !== null || !newEmail || !password}>
                    {busy === "change" ? (<><Spinner className="mr-2" />Saving…</>) : "Update email"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setChanging(false);
                      setNewEmail("");
                      setPassword("");
                    }}
                    disabled={busy !== null}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Change password ─────────────────────────────────────────────────
  function ChangePasswordCard() {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const mismatch = confirm.length > 0 && next !== confirm;

    const submit = async () => {
      if (next !== confirm) return;
      setBusy(true);
      const res = await profile.changePassword({ currentPassword: current, newPassword: next });
      setBusy(false);
      if (res.ok) {
        setCurrent("");
        setNext("");
        setConfirm("");
        notifyOk("Password changed");
      } else notifyErr("Couldn't change password", res.error);
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" /> Change password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Current password" htmlFor="current-pw">
            <PasswordInput id="current-pw" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" htmlFor="new-pw" hint="At least 8 characters.">
            <PasswordInput id="new-pw" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="confirm-pw"
            error={mismatch ? "Passwords don't match." : undefined}
          >
            <PasswordInput id="confirm-pw" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button
              onClick={() => void submit()}
              disabled={busy || !current || next.length < 8 || mismatch}
            >
              {busy ? (<><Spinner className="mr-2" />Saving…</>) : "Update password"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Mobile (verification + status) ──────────────────────────────────
  // Mirrors EmailCard: a status chip + "Your mobile is …" line, the verify flow when it isn't
  // confirmed, and a change-number affordance. Verifying here is what unlocks the 2FA toggle.
  function MobileCard({
    mobile,
    verified,
    twofaEnabled,
    onRefresh,
  }: {
    mobile: string | null;
    verified: boolean;
    twofaEnabled: boolean;
    onRefresh: () => void;
  }) {
    const [sent, setSent] = useState(false);
    // The number the code actually went to — the `mobile` prop lags a just-saved
    // change until onRefresh, so the verify step reports this instead.
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [code, setCode] = useState("");
    // Which action is in-flight — every button disables, only the running one spins.
    const [busy, setBusy] = useState<null | "send" | "confirm">(null);
    const [changing, setChanging] = useState(false);
    const [newMobile, setNewMobile] = useState("");

    // `number` set ⇒ save it first (a new/changed number); omitted ⇒ (re)send to the number on file.
    const send = async (number?: string) => {
      setBusy("send");
      if (number !== undefined) {
        const set = await profile.setMobile(number);
        if (!set.ok) {
          setBusy(null);
          return notifyErr("Couldn't save number", set.error);
        }
      }
      const res = await profile.sendMobileCode();
      setBusy(null);
      if (res.ok) {
        setSent(true);
        setSentTo(number ?? mobile);
        setChanging(false);
        notifyOk("Verification code sent");
      } else notifyErr("Couldn't send code", res.error);
    };
    const confirm = async () => {
      setBusy("confirm");
      const res = await profile.verifyMobile(code);
      setBusy(null);
      if (res.ok) {
        notifyOk("Mobile verified");
        setCode("");
        setSent(false);
        setSentTo(null);
        onRefresh();
      } else notifyErr("Invalid code", res.error);
    };
    const [twofaBusy, setTwofaBusy] = useState(false);
    const toggleTwofa = async (on: boolean) => {
      setTwofaBusy(true);
      const res = on ? await profile.enable2fa() : await profile.disable2fa();
      setTwofaBusy(false);
      if (res.ok) {
        notifyOk(on ? "Two-factor enabled" : "Two-factor disabled");
        onRefresh();
      } else notifyErr(on ? "Couldn't enable 2FA" : "Couldn't disable 2FA", res.error);
    };

    return (
      <Card id="verify-mobile" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" /> Mobile
            <Badge variant={verified ? "success" : "warning"} dot className="ml-auto">
              {verified ? "Verified" : "Not verified"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {sent && sentTo ? (
              <>
                We sent a verification code to{" "}
                <span className="font-medium text-foreground">{formatPhoneDisplay(sentTo)}</span>.
              </>
            ) : mobile ? (
              <>
                Your mobile is <span className="font-medium text-foreground">{formatPhoneDisplay(mobile)}</span>.
              </>
            ) : (
              "No mobile on file."
            )}
          </p>

          {/* Verify the current (or a just-saved) number — mirrors the email card. */}
          {sent ? (
            <div className="flex flex-wrap items-center gap-2">
              <OtpInput value={code} onChange={setCode} disabled={busy !== null} />
              <Button onClick={() => void confirm()} disabled={busy !== null || code.length < 4}>
                {busy === "confirm" ? (<><Spinner className="mr-2" />Verifying…</>) : "Verify"}
              </Button>
              <Button variant="ghost" onClick={() => void send()} disabled={busy !== null}>
                {busy === "send" ? (<><Spinner className="mr-2" />Sending…</>) : "Resend"}
              </Button>
            </div>
          ) : !verified && mobile ? (
            <Button onClick={() => void send()} disabled={busy !== null}>
              {busy === "send" ? (<><Spinner className="mr-2" />Sending…</>) : "Send verification code"}
            </Button>
          ) : !mobile ? (
            // First-time entry — nothing on file yet.
            <div className="space-y-3">
              <Field label="Mobile number" htmlFor="mobile">
                <PhoneInput id="mobile" value={newMobile} onChange={setNewMobile} />
              </Field>
              <Button onClick={() => void send(newMobile.trim())} disabled={busy !== null || !newMobile.trim()}>
                {busy === "send" ? (<><Spinner className="mr-2" />Sending…</>) : "Send code"}
              </Button>
            </div>
          ) : null}

          {/* SMS two-factor rides with the mobile — it has nowhere to send a code otherwise. */}
          <div
            id="two-factor"
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-variant/40 p-3 scroll-mt-24"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Two-factor authentication
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {twofaEnabled
                  ? "On — you'll be asked for an SMS code each time you sign in."
                  : verified
                    ? "Off — turn on to require an SMS code at sign-in."
                    : "Verify your mobile to turn on SMS two-factor."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {twofaBusy ? <Spinner className="h-4 w-4" /> : null}
              <Switch
                checked={twofaEnabled}
                disabled={twofaBusy || !verified}
                onCheckedChange={(v) => void toggleTwofa(v)}
                aria-label="Toggle two-factor authentication"
              />
            </div>
          </div>

          {/* Change to a different number — resets verification, then verify it above. */}
          {mobile ? (
            <div className="border-t border-border pt-3">
              {!changing ? (
                <Button variant="outline" size="sm" onClick={() => setChanging(true)} disabled={busy !== null}>
                  Change mobile
                </Button>
              ) : (
                <div className="space-y-3">
                  <Field label="New mobile number" htmlFor="mobile">
                    <PhoneInput id="mobile" value={newMobile} onChange={setNewMobile} />
                  </Field>
                  <div className="flex gap-2">
                    <Button onClick={() => void send(newMobile.trim())} disabled={busy !== null || !newMobile.trim()}>
                      {busy === "send" ? (<><Spinner className="mr-2" />Sending…</>) : "Send code"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => { setChanging(false); setNewMobile(""); }}
                      disabled={busy !== null}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  // ── Active sessions ─────────────────────────────────────────────────
  function SessionsCard() {
    const [rows, setRows] = useState<SessionSummaryResponse[] | null>(null);
    // "others", or the id of the session being revoked — so only that row spins.
    const [busy, setBusy] = useState<null | string>(null);

    const refresh = async () => {
      const res = await sessionsApi.list();
      setRows(res.ok ? res.data : []);
    };
    useEffect(() => {
      void refresh();
    }, []);

    const revoke = async (id: string) => {
      setBusy(id);
      const res = await sessionsApi.revoke(id);
      setBusy(null);
      res.ok ? (notifyOk("Session revoked"), void refresh()) : notifyErr("Couldn't revoke session", res.error);
    };
    const revokeOthers = async () => {
      setBusy("others");
      const res = await sessionsApi.revokeOthers();
      setBusy(null);
      res.ok ? (notifyOk("Signed out everywhere else"), void refresh()) : notifyErr("Couldn't sign out", res.error);
    };

    const describe = (ua: string | null) => {
      if (!ua) return "Unknown device";
      if (/mobile|android|iphone/i.test(ua)) return "Mobile device";
      const m = ua.match(/(Firefox|Edg|Chrome|Safari)/);
      return m ? `${m[1] === "Edg" ? "Edge" : m[1]} browser` : "Browser";
    };
    const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-muted-foreground" /> Active sessions
          </CardTitle>
          {rows && rows.length > 1 ? (
            <Button variant="outline" size="sm" onClick={() => void revokeOthers()} disabled={busy !== null}>
              {busy === "others" ? (<><Spinner className="mr-2" />Signing out…</>) : "Sign out everywhere else"}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2">
          {rows === null ? (
            <Skeleton className="h-12 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active sessions.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {describe(s.userAgent)}
                      {s.current ? (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          This device
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ipAddress ? `${s.ipAddress} · ` : ""}last active {when(s.lastSeenAt ?? s.createdAt)}
                    </p>
                  </div>
                  {!s.current ? (
                    <Button variant="ghost" size="sm" onClick={() => void revoke(s.id)} disabled={busy !== null}>
                      {busy === s.id ? (<><Spinner className="mr-2" />Revoking…</>) : "Revoke"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Danger zone ─────────────────────────────────────────────────────
  function DeleteAccountCard() {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    const confirm = async () => {
      setBusy(true);
      const res = await profile.deleteAccount({ password });
      setBusy(false);
      if (res.ok) {
        showToast({ tone: "success", title: "Account deleted" });
        await logout();
        return;
      }
      notifyErr("Couldn't delete account", res.error);
    };

    return (
      <Card className="border-error/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-error">
            <Trash2 className="h-4 w-4" /> Delete account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert
            variant="error"
            title="This can't be undone"
            message="Deleting your account removes your access and sign-in. You can't do this if you're the only organiser of a workspace — hand it over first."
          />
          {!open ? (
            <div className="flex justify-end">
              <Button variant="destructive" onClick={() => setOpen(true)}>
                Delete account
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Confirm your password" htmlFor="delete-pw">
                <PasswordInput id="delete-pw" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void confirm()} disabled={busy || !password}>
                  {busy ? (<><Spinner className="mr-2" />Deleting…</>) : "Permanently delete"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
}

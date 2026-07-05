"use client";

import { useEffect, useState } from "react";
import { Laptop, Lock, Mail, ShieldCheck, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  OtpInput,
  PasswordInput,
  Skeleton,
  Spinner,
} from "@uprise/ui";
import { auth, profile, sessions as sessionsApi, type SessionSummaryResponse } from "@uprise/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { getSession, logout } from "@/lib/session";

type Flags = {
  email: string | null;
  role: string;
  emailVerified: boolean;
  mobileVerified: boolean;
  twofaEnabled: boolean;
};

/** Self-service account (prog parity, uprise conventions): email, password, 2FA, danger zone. */
export default function AccountPage() {
  const { showToast } = useToast();
  const [flags, setFlags] = useState<Flags | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoadError(false);
    const session = await getSession();
    if (!session) {
      setLoadError(true);
      return;
    }
    setFlags({
      email: session.email ?? null,
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
      <div>
        <h1 className="text-3xl font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground">Sign-in, security and account controls.</p>
      </div>

      {!flags.emailVerified && flags.email ? (
        <EmailVerificationBanner email={flags.email} onVerified={() => void load()} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChangePasswordCard />
        <ChangeEmailCard currentEmail={flags.email} onChanged={() => void load()} />
      </div>

      <TwoFactorCard flags={flags} onChange={() => void load()} />

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

  // ── Email verification banner ───────────────────────────────────────
  function EmailVerificationBanner({ email, onVerified }: { email: string; onVerified: () => void }) {
    const [sent, setSent] = useState(false);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);

    const send = async () => {
      setBusy(true);
      const res = await auth.sendEmailVerification(email);
      setBusy(false);
      if (res.ok) {
        setSent(true);
        notifyOk("Verification code sent");
      } else notifyErr("Couldn't send code", res.error);
    };
    const confirm = async () => {
      setBusy(true);
      const res = await auth.confirmEmailVerification(email, code);
      setBusy(false);
      if (res.ok) {
        notifyOk("Email verified");
        onVerified();
      } else notifyErr("Invalid code", res.error);
    };

    return (
      <Alert variant="warning" title="Verify your email" message={`We need to confirm ${email}.`}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!sent ? (
            <Button size="sm" variant="outline" onClick={() => void send()} disabled={busy}>
              Send verification code
            </Button>
          ) : (
            <>
              <OtpInput value={code} onChange={setCode} disabled={busy} />
              <Button size="sm" onClick={() => void confirm()} disabled={busy || code.length < 4}>
                Verify
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void send()} disabled={busy}>
                Resend
              </Button>
            </>
          )}
        </div>
      </Alert>
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

  // ── Change email ────────────────────────────────────────────────────
  function ChangeEmailCard({ currentEmail, onChanged }: { currentEmail: string | null; onChanged: () => void }) {
    const [newEmail, setNewEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async () => {
      setBusy(true);
      const res = await profile.changeEmail({ newEmail, password });
      setBusy(false);
      if (res.ok) {
        setNewEmail("");
        setPassword("");
        notifyOk("Email updated — check the new address to verify it");
        onChanged();
      } else notifyErr("Couldn't change email", res.error);
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" /> Change email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentEmail ? (
            <p className="text-sm text-muted-foreground">
              Current: <span className="font-medium text-foreground">{currentEmail}</span>
            </p>
          ) : null}
          <Field label="New email" htmlFor="new-email">
            <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="email-pw">
            <PasswordInput id="email-pw" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={() => void submit()} disabled={busy || !newEmail || !password}>
              {busy ? (<><Spinner className="mr-2" />Saving…</>) : "Update email"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Two-factor authentication ───────────────────────────────────────
  function TwoFactorCard({ flags, onChange }: { flags: Flags; onChange: () => void }) {
    const [busy, setBusy] = useState(false);
    const [mobile, setMobile] = useState("");
    const [code, setCode] = useState("");
    const [codeSent, setCodeSent] = useState(false);

    const disable = async () => {
      setBusy(true);
      const res = await profile.disable2fa();
      setBusy(false);
      res.ok ? (notifyOk("Two-factor disabled"), onChange()) : notifyErr("Couldn't disable 2FA", res.error);
    };
    const enable = async () => {
      setBusy(true);
      const res = await profile.enable2fa();
      setBusy(false);
      res.ok ? (notifyOk("Two-factor enabled"), onChange()) : notifyErr("Couldn't enable 2FA", res.error);
    };
    const sendCode = async () => {
      setBusy(true);
      const set = await profile.setMobile(mobile);
      if (!set.ok) {
        setBusy(false);
        return notifyErr("Couldn't save number", set.error);
      }
      const res = await profile.sendMobileCode();
      setBusy(false);
      res.ok ? (setCodeSent(true), notifyOk("Code sent")) : notifyErr("Couldn't send code", res.error);
    };
    const verify = async () => {
      setBusy(true);
      const res = await profile.verifyMobile(code);
      setBusy(false);
      res.ok ? (notifyOk("Mobile verified"), onChange()) : notifyErr("Invalid code", res.error);
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Two-factor authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {flags.twofaEnabled ? (
            <div className="flex items-center justify-between gap-3">
              <Alert variant="success" title="Two-factor is on" message="You'll be asked for an SMS code at sign-in." />
              <Button variant="outline" onClick={() => void disable()} disabled={busy}>
                Disable
              </Button>
            </div>
          ) : flags.mobileVerified ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Your mobile is verified. Turn on SMS two-factor.</p>
              <Button onClick={() => void enable()} disabled={busy}>
                Enable
              </Button>
            </div>
          ) : !codeSent ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Mobile number" htmlFor="mobile" hint="E.164 format, e.g. +61400000000" className="flex-1 min-w-[16rem]">
                <Input id="mobile" placeholder="+61400000000" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </Field>
              <Button onClick={() => void sendCode()} disabled={busy || !mobile.trim()}>
                Send code
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <OtpInput value={code} onChange={setCode} disabled={busy} />
              <Button onClick={() => void verify()} disabled={busy || code.length < 4}>
                Verify
              </Button>
              <Button variant="ghost" onClick={() => void sendCode()} disabled={busy}>
                Resend
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Active sessions ─────────────────────────────────────────────────
  function SessionsCard() {
    const [rows, setRows] = useState<SessionSummaryResponse[] | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = async () => {
      const res = await sessionsApi.list();
      setRows(res.ok ? res.data : []);
    };
    useEffect(() => {
      void refresh();
    }, []);

    const revoke = async (id: string) => {
      setBusy(true);
      const res = await sessionsApi.revoke(id);
      setBusy(false);
      res.ok ? (notifyOk("Session revoked"), void refresh()) : notifyErr("Couldn't revoke session", res.error);
    };
    const revokeOthers = async () => {
      setBusy(true);
      const res = await sessionsApi.revokeOthers();
      setBusy(false);
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
            <Button variant="outline" size="sm" onClick={() => void revokeOthers()} disabled={busy}>
              Sign out everywhere else
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
                    <Button variant="ghost" size="sm" onClick={() => void revoke(s.id)} disabled={busy}>
                      Revoke
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

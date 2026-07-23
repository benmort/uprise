"use client";

// Account security — password, active sessions, delete account. Extracted from the
// standalone /future/security page so it renders both there and as a tab on the
// General settings page. Self-contained: fetches the session for delete-account gating.
import { useCallback, useEffect, useState } from "react";
import { Laptop, Loader2, Lock, RefreshCw, Trash2 } from "lucide-react";
import { profile, sessions as sessionsApi, type SessionSummaryResponse } from "@uprise/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@uprise/ui";
import { Button } from "@uprise/ui";
import { Input } from "@uprise/ui";
import { Label } from "@/components/prog/ui/label";
import { Skeleton } from "@uprise/ui";
import { Alert } from "@uprise/ui";
import { getSession, logout } from "@/lib/session";

type Feedback = { error?: string; success?: string };

const cardClass = "border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]";

export function SecuritySettings() {
  const [role, setRole] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await getSession();
      if (!active) return;
      setRole(session?.role ?? null);
      setIsSuperAdmin(session?.isSuperAdmin ?? false);
      setSessionLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      <ActiveSessionsCard />
      <DeleteAccountCard role={role} isSuperAdmin={isSuperAdmin} sessionLoaded={sessionLoaded} />
    </div>
  );
}

// ── Change password ───────────────────────────────────────────────────
function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({});

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setFeedback({ error: "Passwords don't match." });
      return;
    }
    setPending(true);
    setFeedback({});
    const res = await profile.changePassword({ currentPassword, newPassword });
    setPending(false);
    if (res.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedback({ success: "Password updated successfully." });
    } else {
      setFeedback({ error: res.error });
    }
  };

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-white/90">
          <Lock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          Password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="current-password" className="mb-2">
              Current password
            </Label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={100}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-password" className="mb-2">
              New password
            </Label>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">At least 8 characters.</p>
          </div>
          <div>
            <Label htmlFor="confirm-password" className="mb-2">
              Confirm new password
            </Label>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={mismatch || undefined}
            />
            {mismatch && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400">Passwords don&apos;t match.</p>
            )}
          </div>
          {feedback.error && <Alert variant="error" title="Couldn't update password" message={feedback.error} />}
          {feedback.success && <Alert variant="success" title="Done" message={feedback.success} />}
          <Button
            type="submit"
            className="cursor-pointer bg-black hover:bg-gray-800 text-white"
            disabled={pending || !currentPassword || newPassword.length < 8 || mismatch || !confirmPassword}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Update password
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Active sessions ───────────────────────────────────────────────────
function ActiveSessionsCard() {
  const [rows, setRows] = useState<SessionSummaryResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({});
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await sessionsApi.list();
    if (res.ok) {
      setRows(res.data);
      setError(null);
    } else {
      setRows([]);
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revoke = async (id: string) => {
    setBusy(true);
    setFeedback({});
    const res = await sessionsApi.revoke(id);
    setBusy(false);
    if (res.ok) {
      setFeedback({ success: "Session revoked." });
      void refresh();
    } else {
      setFeedback({ error: res.error });
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    setFeedback({});
    const res = await sessionsApi.revokeOthers();
    setBusy(false);
    if (res.ok) {
      setFeedback({ success: "Signed out everywhere else." });
      void refresh();
    } else {
      setFeedback({ error: res.error });
    }
  };

  const describe = (ua: string | null) => {
    if (!ua) return "Unknown device";
    if (/mobile|android|iphone/i.test(ua)) return "Mobile device";
    const m = ua.match(/(Firefox|Edg|Chrome|Safari)/);
    return m ? `${m[1] === "Edg" ? "Edge" : m[1]} browser` : "Browser";
  };
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU") : "–");

  return (
    <Card className={cardClass}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-white/90">
          <Laptop className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          Active sessions
        </CardTitle>
        <div className="flex items-center gap-2">
          {rows && rows.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => void revokeOthers()} disabled={busy} className="cursor-pointer">
              Sign out everywhere else
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={busy}
            className="cursor-pointer"
            aria-label="Refresh sessions"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback.error && <Alert variant="error" title="Error" message={feedback.error} />}
        {feedback.success && <Alert variant="success" title="Done" message={feedback.success} />}

        {rows === null ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full dark:bg-gray-700" />
            <Skeleton className="h-14 w-full dark:bg-gray-700" />
          </div>
        ) : error ? (
          <Alert variant="error" title="Couldn't load sessions" message={error} />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[120px] w-full rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-white/[0.02]">
            <Laptop className="h-9 w-9 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No active sessions.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {describe(s.userAgent)}
                    {s.current && (
                      <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {s.ipAddress ? `IP ${s.ipAddress} · ` : ""}signed in {when(s.createdAt)} · last active{" "}
                    {when(s.lastSeenAt ?? s.createdAt)}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void revoke(s.id)}
                    disabled={busy}
                    className="cursor-pointer text-gray-700 dark:text-gray-300"
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Delete account (owners + super admins only) ───────────────────────
function DeleteAccountCard({
  role,
  isSuperAdmin,
  sessionLoaded,
}: {
  role: string | null;
  isSuperAdmin: boolean;
  sessionLoaded: boolean;
}) {
  const canDelete = role === "OWNER" || isSuperAdmin;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({});

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setFeedback({});
    const res = await profile.deleteAccount({ password });
    if (res.ok) {
      setFeedback({ success: "Account deleted. Signing you out…" });
      await logout();
      return;
    }
    setPending(false);
    setFeedback({ error: res.error });
  };

  return (
    <Card className="border-red-200 dark:border-red-500/30 bg-white dark:bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="h-4 w-4" />
          Delete account
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!sessionLoaded ? (
          <Skeleton className="h-24 w-full dark:bg-gray-700" />
        ) : !canDelete ? (
          <Alert
            variant="info"
            title="Account deletion is restricted"
            message="Only an owner or super admin can delete this account. Ask an owner if you need this done."
          />
        ) : (
          <div className="space-y-4">
            <Alert
              variant="error"
              title="This can't be undone"
              message="Deleting your account is non-reversible and removes your access and sign-in. Please proceed with caution."
            />
            {feedback.error && <Alert variant="error" title="Couldn't delete account" message={feedback.error} />}
            {feedback.success && <Alert variant="success" title="Done" message={feedback.success} />}

            {!open ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setOpen(true)}
                className="cursor-pointer bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete account
              </Button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="delete-password" className="mb-2">
                    Confirm your password
                  </Label>
                  <Input
                    id="delete-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    maxLength={100}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      setPassword("");
                      setFeedback({});
                    }}
                    disabled={pending}
                    className="cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    className="cursor-pointer bg-red-600 hover:bg-red-700"
                    disabled={pending || !password}
                  >
                    {pending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Permanently delete
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

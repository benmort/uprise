"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { auth, tenants } from "@uprise/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@uprise/ui";
import { Button } from "@uprise/ui";
import { Input } from "@uprise/ui";
import { Label } from "@/components/prog/ui/label";
import { Skeleton } from "@uprise/ui";
import { Alert } from "@uprise/ui";
import { logout } from "@/lib/session";

type Feedback = { error?: string; success?: string };

/**
 * Self-serve delete of the current workspace — the tenant twin of "Delete account" on the
 * Security tab. Owners only; the API re-verifies the password and OWNER membership of the active
 * tenant. Unlike account deletion the delete is SOFT (recoverable), which the copy makes clear.
 *
 * After deleting, we only sign the owner out if they have nowhere else to go: a super-admin lands
 * on the workspace list, and an owner/organiser of another live workspace is switched into it. Only
 * someone who administers no other workspace is signed out (their session's tenant is gone).
 */
export function DeleteWorkspaceCard({
  role,
  isSuperAdmin,
  sessionLoaded,
}: {
  role: string | null;
  isSuperAdmin: boolean;
  sessionLoaded: boolean;
}) {
  const canDelete = role === "OWNER";
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({});

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setFeedback({});
    const res = await tenants.deleteSelf({ password });
    if (!res.ok) {
      setPending(false);
      setFeedback({ error: res.error });
      return;
    }
    // A super-admin keeps their session and lands on the workspace list.
    if (isSuperAdmin) {
      setFeedback({ success: "Workspace deleted. Taking you to your workspaces…" });
      window.location.assign("/super/tenants");
      return;
    }
    // Still administer another live workspace → switch into it, no sign-out.
    if (res.data.nextTenantId) {
      setFeedback({ success: "Workspace deleted. Switching to your other workspace…" });
      await auth.selectTenant(res.data.nextTenantId);
      window.location.assign("/dashboard");
      return;
    }
    // Nowhere else to go — the session's tenant is gone, so sign out.
    setFeedback({ success: "Workspace deleted. Signing you out…" });
    await logout();
  };

  return (
    <Card className="border-red-200 dark:border-red-500/30 bg-white dark:bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="h-4 w-4" />
          Delete workspace
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!sessionLoaded ? (
          <Skeleton className="h-24 w-full dark:bg-gray-700" />
        ) : !canDelete ? (
          <Alert
            variant="info"
            title="Workspace deletion is restricted"
            message="Only an owner can delete this workspace. Ask an owner if you need this done."
          />
        ) : (
          <div className="space-y-4">
            <Alert
              variant="warning"
              title="This removes the workspace and everyone's access"
              message="The workspace and all its data are hidden immediately and everyone loses access. It's a soft delete — contact support to restore it."
            />
            {feedback.error && <Alert variant="error" title="Couldn't delete workspace" message={feedback.error} />}
            {feedback.success && <Alert variant="success" title="Done" message={feedback.success} />}

            {!open ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setOpen(true)}
                className="cursor-pointer bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete workspace
              </Button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="delete-workspace-password" className="mb-2">
                    Confirm your password
                  </Label>
                  <Input
                    id="delete-workspace-password"
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
                        Delete workspace
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

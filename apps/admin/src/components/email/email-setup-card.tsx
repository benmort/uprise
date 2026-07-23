"use client";

import { useCallback, useEffect, useState } from "react";
import { AtSign, Loader2 } from "lucide-react";
import { emailProvisioning, type EmailProvisioningRequest } from "@uprise/api-client";
import { StatusBadge, useToast } from "@uprise/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getFeatureFlags } from "@/lib/api";
import { getSession } from "@/lib/session";
import { EmailIdentityCard } from "./email-identity-card";
import { LockedAction } from "@/components/setup/locked-action";
import { invalidateSetupState, useSetupGate } from "@/components/setup/use-setup-state";

/**
 * The Channels-flow email card. Provisioning is super-admin-executed for now, so this is
 * request-based: an owner asks for their email identity, the chip flips to REQUESTED, and
 * the platform team fulfils it from their console. Once identities/runs exist it defers to
 * the read-only EmailIdentityCard (its first mount anywhere). Hidden entirely when the
 * tenant's plan doesn't include email (the flow row already shows the plan lock).
 */
export function EmailSetupCard({ tenantId: tenantIdProp }: { tenantId?: string }) {
  const { showToast } = useToast();
  const gate = useSetupGate("canRequestEmail");
  const [visible, setVisible] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasHistory, setHasHistory] = useState(false);
  const [openRequest, setOpenRequest] = useState<EmailProvisioningRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [flags, session] = await Promise.all([getFeatureFlags(), getSession()]);
    const on = flags.ok ? Boolean(flags.data.FEATURE_TENANT_EMAIL_ENABLED) : false;
    setVisible(on);
    setIsOwner(session?.role === "OWNER" || session?.isSuperAdmin === true);
    const tenantId = tenantIdProp ?? session?.tenantId ?? undefined;
    if (!on || !tenantId) {
      setLoading(false);
      return;
    }
    const [ids, runs, requests] = await Promise.all([
      emailProvisioning.listIdentities(tenantId),
      emailProvisioning.listRuns(tenantId),
      emailProvisioning.listRequests({ tenantId }),
    ]);
    setHasHistory(Boolean((ids.ok && ids.data.length > 0) || (runs.ok && runs.data.length > 0)));
    setOpenRequest(requests.ok ? (requests.data.find((r) => r.status === "OPEN") ?? null) : null);
    setLoading(false);
  }, [tenantIdProp]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!visible) return null; // the flow row already shows plan_locked

  // Identities/runs exist → the read-only status card owns this surface.
  if (hasHistory) return <EmailIdentityCard tenantId={tenantIdProp} />;

  const request = async () => {
    setBusy(true);
    const res = await emailProvisioning.requestSetup();
    setBusy(false);
    if (res.ok) {
      setOpenRequest(res.data);
      showToast({ tone: "success", title: "Request sent", description: "The Uprise team will set this up." });
    } else if (res.status === 409) {
      await load(); // someone else on the team beat us to it — reflect the open request
    } else {
      showToast({ tone: "error", title: "Couldn't send the request", description: res.error });
    }
    const session = await getSession();
    if (session?.tenantId) invalidateSetupState(session.tenantId);
  };

  const withdraw = async () => {
    if (!openRequest) return;
    setBusy(true);
    const res = await emailProvisioning.withdrawRequest(openRequest.id);
    setBusy(false);
    if (res.ok) setOpenRequest(null);
    else showToast({ tone: "error", title: "Couldn't withdraw", description: res.error });
    const session = await getSession();
    if (session?.tenantId) invalidateSetupState(session.tenantId);
  };

  return (
    <Card id="email" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AtSign className="h-4 w-4" />
          Your email identity
          {openRequest ? <StatusBadge status="REQUESTED" className="ml-2" /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : openRequest ? (
          <>
            <p className="text-sm text-muted-foreground">
              Got it — the Uprise team sets this up and we&apos;ll email you when it&apos;s live. You can
              keep sending on the shared Uprise address meanwhile.
            </p>
            {isOwner ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void withdraw()}>
                Withdraw request
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Send from your own address — like team@your-org.org.au — instead of the shared Uprise
              sender. The Uprise team sets this up for you.
            </p>
            {isOwner ? (
              <LockedAction
                locked={gate.locked}
                planLocked={gate.planLocked}
                missing={gate.missing}
                label="Request email setup"
              >
                <Button size="sm" disabled={busy} onClick={() => void request()}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Request email setup
                </Button>
              </LockedAction>
            ) : (
              <p className="text-xs text-muted-foreground">Your workspace owner can request this.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

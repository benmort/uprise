"use client";

import { useEffect, useState } from "react";
import { AtSign, Copy, Loader2 } from "lucide-react";
import {
  emailProvisioning,
  type EmailProvisioningRun,
  type EmailProvisioningStep,
  type EmailSenderIdentity,
} from "@uprise/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/prog/ui/card";
import { getFeatureFlags } from "@/lib/api";
import { getSession } from "@/lib/session";
import {
  EMAIL_TIMELINE_CURRENT_STEP,
  EMAIL_TIMELINE_STEPS,
  ProvisioningTimeline,
} from "@/components/telephony/provisioning-timeline";

type RunWithSteps = EmailProvisioningRun & { steps: EmailProvisioningStep[] };

/**
 * Owner-facing (read-only) email-identity status for the tenant-settings page:
 * the organisation's from-addresses + the live provisioning timeline. For
 * tenant-owned domains it also shows the CNAME records the owner needs to add
 * — the platform team confirms validation. Resolves the tenant from the
 * session when not given one.
 */
export function EmailIdentityCard({ tenantId: tenantIdProp }: { tenantId?: string }) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [identities, setIdentities] = useState<EmailSenderIdentity[]>([]);
  const [latestRun, setLatestRun] = useState<RunWithSteps | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const flags = await getFeatureFlags();
      const on = flags.ok ? Boolean(flags.data.FEATURE_TENANT_EMAIL_ENABLED) : false;
      if (!alive) return;
      setVisible(on);
      if (!on) {
        setLoading(false);
        return;
      }
      const tenantId = tenantIdProp ?? (await getSession())?.activeTenant?.id;
      if (!tenantId) {
        if (alive) setLoading(false);
        return;
      }
      const [idsRes, runsRes] = await Promise.all([
        emailProvisioning.listIdentities(tenantId),
        emailProvisioning.listRuns(tenantId),
      ]);
      if (!alive) return;
      if (idsRes.ok) setIdentities(idsRes.data);
      else setError(idsRes.error);
      if (!runsRes.ok) setError(runsRes.error);
      const newest = runsRes.ok ? runsRes.data[0] : undefined;
      if (newest) {
        const run = await emailProvisioning.getRun(newest.id);
        if (alive && run.ok) setLatestRun(run.data);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [tenantIdProp]);

  // Nothing to show: feature off, or no email-identity history for this tenant.
  if (!visible || (!loading && !error && identities.length === 0 && !latestRun)) return null;

  const latestIdentity =
    (latestRun?.identityId && identities.find((i) => i.id === latestRun.identityId)) || null;
  const awaitingDns =
    latestRun &&
    latestIdentity?.kind === "CUSTOM_DOMAIN" &&
    (latestRun.status === "DNS_CONFIGURED" || latestRun.status === "VALIDATION_FAILED");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AtSign className="h-4 w-4" />
          Email sender addresses
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-error">Couldn&rsquo;t load email identity status: {error}</p>
        ) : (
          <>
            {identities.length > 0 ? (
              <ul className="space-y-2">
                {identities.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <span className="truncate font-mono text-sm font-semibold">{i.fromEmail}</span>
                    <span className="rounded-full bg-surface-variant px-2 py-0.5 text-xs font-bold uppercase text-muted-foreground">
                      {i.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {i.campaignId ? "campaign-scoped" : "organisation default"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {awaitingDns && latestIdentity?.dnsRecords?.length ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Add these CNAME records to your domain&rsquo;s DNS to verify your sending address —
                  we check automatically and the platform team confirms.
                </p>
                <ul className="space-y-1.5">
                  {latestIdentity.dnsRecords.map((r) => (
                    <li key={r.host} className="flex items-center gap-2 rounded-lg border border-border p-2 font-mono text-xs">
                      <span className="truncate" title={`${r.host} CNAME ${r.data}`}>
                        {r.host} → {r.data}
                      </span>
                      <button
                        type="button"
                        aria-label="Copy record"
                        onClick={() => void navigator.clipboard.writeText(`${r.host} CNAME ${r.data}`)}
                        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {latestRun && latestRun.status !== "ACTIVE" ? (
              <ProvisioningTimeline
                run={latestRun}
                steps={latestRun.steps}
                stepDefs={EMAIL_TIMELINE_STEPS}
                currentStepByStatus={EMAIL_TIMELINE_CURRENT_STEP}
              />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

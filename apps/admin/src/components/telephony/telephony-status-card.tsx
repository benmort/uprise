"use client";

import { useEffect, useState } from "react";
import { Loader2, Phone } from "lucide-react";
import {
  telephony,
  type TelephonyPhoneNumber,
  type TelephonyProvisioningRun,
  type TelephonyProvisioningStep,
} from "@uprise/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/prog/ui/card";
import { getFeatureFlags } from "@/lib/api";
import { getSession } from "@/lib/session";
import { ProvisioningTimeline } from "./provisioning-timeline";

type RunWithSteps = TelephonyProvisioningRun & { steps: TelephonyProvisioningStep[] };

/**
 * Owner-facing (read-only) telephony status for the tenant-settings page: the
 * organisation's numbers + the live provisioning timeline. Provisioning itself
 * is driven by the platform team; this keeps the owner in the loop. Resolves
 * the tenant from the session when not given one.
 */
export function TelephonyStatusCard({ tenantId: tenantIdProp }: { tenantId?: string }) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TelephonyPhoneNumber[]>([]);
  const [latestRun, setLatestRun] = useState<RunWithSteps | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const flags = await getFeatureFlags();
      const on = flags.ok ? Boolean(flags.data.FEATURE_TENANT_TELEPHONY_ENABLED) : false;
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
      const [numbersRes, runsRes] = await Promise.all([
        telephony.listNumbers(tenantId),
        telephony.listRuns(tenantId),
      ]);
      if (!alive) return;
      if (numbersRes.ok) setNumbers(numbersRes.data);
      else setError(numbersRes.error);
      if (!runsRes.ok) setError(runsRes.error);
      const newest = runsRes.ok ? runsRes.data[0] : undefined;
      if (newest) {
        const run = await telephony.getRun(newest.id);
        if (alive && run.ok) setLatestRun(run.data);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [tenantIdProp]);

  // Nothing to show: feature off, or no telephony history for this tenant.
  if (!visible || (!loading && !error && numbers.length === 0 && !latestRun)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Text-message number
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-error">Couldn&rsquo;t load telephony status: {error}</p>
        ) : (
          <>
            {numbers.length > 0 ? (
              <ul className="space-y-2">
                {numbers.map((n) => (
                  <li key={n.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <span className="font-mono text-sm font-semibold">{n.phoneNumberE164}</span>
                    <span className="rounded-full bg-surface-variant px-2 py-0.5 text-xs font-bold uppercase text-muted-foreground">
                      {n.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {n.campaignId ? "campaign-scoped" : "organisation default"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {latestRun && latestRun.status !== "ACTIVE" ? (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Your dedicated mobile number is being set up — the platform team drives this; no action
                  is needed from you unless we get in touch about compliance details.
                </p>
                <ProvisioningTimeline run={latestRun} steps={latestRun.steps} />
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

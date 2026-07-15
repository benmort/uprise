"use client";

import { useEffect, useState } from "react";
import { Loader2, Phone } from "lucide-react";
import {
  telephony,
  type TelephonyPhoneNumber,
  type TelephonyProvisioningRun,
  type TelephonyProvisioningStep,
} from "@uprise/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeatureFlags } from "@/lib/api";
import { getSession } from "@/lib/session";
import { ProvisioningTimeline } from "./provisioning-timeline";

type RunWithSteps = TelephonyProvisioningRun & { steps: TelephonyProvisioningStep[] };

/**
 * Owner-facing (read-only) telephony status: the organisation's numbers + the live
 * provisioning timeline. Provisioning itself is driven by the platform team; this
 * keeps the owner in the loop. Resolves the tenant from the session when not given one.
 *
 * By default it self-hides when there is nothing to show (flag off / no history). Pass
 * `onboarding` to instead render a "set up a number" prompt in that case, so it works
 * as a getting-started card.
 */
export function TelephonyStatusCard({
  tenantId: tenantIdProp,
  onboarding = false,
}: {
  tenantId?: string;
  onboarding?: boolean;
}) {
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
      const tenantId = tenantIdProp ?? (await getSession())?.tenantId ?? undefined;
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

  // Something meaningful to render (loading spinner, an error, numbers, or a run) — but
  // only when the feature is on for this tenant.
  const showReal = visible && (loading || Boolean(error) || numbers.length > 0 || Boolean(latestRun));

  if (!showReal) {
    // Nothing to show: onboarding placement prompts setup; elsewhere it self-hides.
    if (!onboarding) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Set up your calling &amp; text number
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Get a dedicated mobile number so your calls and texts come from your organisation. Your
            platform team provisions this — get in touch to start setup.
          </p>
        </CardContent>
      </Card>
    );
  }

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

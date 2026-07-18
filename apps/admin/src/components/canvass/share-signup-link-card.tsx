"use client";

import { useEffect, useState } from "react";
import { Check, Copy, QrCode as QrCodeIcon, Share2, UserPlus } from "lucide-react";
import { getAuthAppUrl } from "@uprise/api-client";
import { QrCode } from "@uprise/ui";
import { SectionCard } from "@uprise/field";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * A shareable, open volunteer-signup link with copy-to-clipboard (and native share where
 * available). Campaign-scoped when `campaignId` is given (the campaign recruit page); otherwise
 * the tenant-wide recruit board (`/volunteer?org=<slug>`). Anyone with the link can self-sign-up —
 * post it in a group chat, email, or on socials, no per-person invite needed.
 */
export function ShareSignupLinkCard({ campaignId }: { campaignId?: string }) {
  const { showToast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    if (campaignId) {
      setUrl(`${getAuthAppUrl()}/volunteer/${encodeURIComponent(campaignId)}`);
      return;
    }
    let alive = true;
    void getSession().then((p) => {
      if (!alive || !p) return;
      // Active tenant's slug: the impersonated tenant (super-admin) or the matching membership.
      const slug = p.activeTenant?.slug ?? p.memberships.find((m) => m.tenantId === p.tenantId)?.tenantSlug;
      if (slug) setUrl(`${getAuthAppUrl()}/volunteer?org=${encodeURIComponent(slug)}`);
    });
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast({ tone: "success", title: "Link copied", description: url });
    } catch {
      showToast({ tone: "error", title: "Couldn't copy", description: "Select the link and copy it manually." });
    }
  };

  const share = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: "Volunteer sign-up", text: "Join us as a volunteer:", url });
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  };

  return (
    <SectionCard
      title="Share a signup link"
      description={
        campaignId
          ? "Anyone with this link can sign up to volunteer on this campaign — post it anywhere."
          : "Anyone with this link can sign up to volunteer with your organisation — post it anywhere."
      }
    >
      {url ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
              <UserPlus className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground" title={url}>
                {url}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={() => void copy()}>
                {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                {copied ? "Copied!" : "Copy link"}
              </Button>
              <Button
                variant={showQr ? "secondary" : "outline"}
                aria-pressed={showQr}
                onClick={() => setShowQr((v) => !v)}
                title="Show a QR code for this link"
              >
                <QrCodeIcon className="h-4 w-4" />
              </Button>
              {canShare ? (
                <Button variant="outline" onClick={() => void share()} title="Share via your device">
                  <Share2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
          {showQr ? <QrCode value={url} size={176} /> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Preparing your signup link…</p>
      )}
    </SectionCard>
  );
}

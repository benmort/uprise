"use client";

import { Check, Download, Share, Smartphone } from "lucide-react";
import { SectionCard } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { openHint } from "@/lib/pwa";
import { usePwaInstall } from "./use-pwa-install";

/**
 * A persistent home for installing the Uprise app (the counterpart to the bottom nudge), for
 * Settings. Reflects install state: already-in-app, installed-on-this-device (with how to open
 * it — no browser can launch a PWA from a tab), a one-tap Install (Chromium), iOS Add-to-Home
 * steps, or a fallback hint for browsers that haven't offered a prompt yet.
 */
export function InstallAppCard() {
  const { platform, isStandalone, isInstalled, canPrompt, promptInstall } = usePwaInstall();

  return (
    <SectionCard
      title="Install the app"
      description="Add Uprise to your device for faster access, a full-screen window and push notifications."
    >
      {isStandalone ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <Check className="h-4 w-4" />
          You’re using the installed app.
        </p>
      ) : isInstalled ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Check className="h-4 w-4 text-success" />
            Installed on this device.
          </p>
          <p className="text-sm text-muted-foreground">{openHint(platform)}</p>
        </div>
      ) : canPrompt ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">One tap and Uprise installs like a native app.</p>
          <Button onClick={() => void promptInstall()}>
            <Download className="mr-1.5 h-4 w-4" />
            Install Uprise
          </Button>
        </div>
      ) : platform === "ios" ? (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5 text-foreground">
            <Smartphone className="h-4 w-4" />
            To install on iPhone or iPad:
          </p>
          <ol className="ml-1 list-inside list-decimal space-y-1">
            <li className="flex items-center gap-1">
              Tap the <Share className="inline h-4 w-4" aria-label="Share" /> Share button in Safari.
            </li>
            <li>Choose “Add to Home Screen”.</li>
            <li>Tap “Add” — Uprise appears on your Home Screen.</li>
          </ol>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Use your browser’s install option — the install icon in the address bar, or the browser menu →
          “Install Uprise” / “Add to Home Screen”. It isn’t offered in every browser.
        </p>
      )}
    </SectionCard>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Share } from "lucide-react";
import { Button } from "./ui/button";
import { usePwaInstall } from "./pwa/use-pwa-install";

const INSTALL_PROMPT_SNOOZE_KEY = "uprise.installPrompt.snoozeUntil";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The bottom "Install Uprise" nudge. Hidden once the app is installed (or when we're already
 * running as the installed app), and "Later" snoozes it for a day. Covers both Chromium
 * (one-tap install via the captured prompt) and iOS Safari (which has no prompt API, so we
 * show the Share → Add to Home Screen steps). A persistent home lives in Settings → General.
 */
export function PWAInstallPrompt() {
  const { platform, isInstalled, canPrompt, promptInstall } = usePwaInstall();
  // Start hidden until storage is read, so a snoozed banner never flashes.
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    try {
      const until = Number(window.localStorage.getItem(INSTALL_PROMPT_SNOOZE_KEY) || "0");
      setSnoozed(Number.isFinite(until) && until > Date.now());
    } catch {
      setSnoozed(false);
    }
  }, []);

  const snooze = () => {
    try {
      window.localStorage.setItem(INSTALL_PROMPT_SNOOZE_KEY, String(Date.now() + ONE_DAY_MS));
    } catch {
      /* storage blocked — hide for this session only */
    }
    setSnoozed(true);
  };

  // Nothing to nudge once it's installed, or while snoozed. iOS with no install path and
  // desktop/Android before the prompt is captured also fall through to null.
  if (isInstalled || snoozed) return null;
  if (!canPrompt && platform !== "ios") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        {canPrompt ? (
          <p className="text-sm text-foreground">Install Uprise for faster access and notifications.</p>
        ) : (
          <p className="flex items-center gap-1 text-sm text-foreground">
            Install Uprise: tap
            <Share className="inline h-4 w-4" aria-label="Share" />
            Share, then “Add to Home Screen”.
          </p>
        )}
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={snooze}>
            Later
          </Button>
          {canPrompt ? (
            <Button
              size="sm"
              onClick={async () => {
                await promptInstall();
                snooze();
              }}
            >
              Install
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

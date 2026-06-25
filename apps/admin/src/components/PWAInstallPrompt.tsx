"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_PROMPT_SNOOZE_KEY = "yarns.installPrompt.snoozeUntil";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const snoozeUntilRaw = window.localStorage.getItem(INSTALL_PROMPT_SNOOZE_KEY);
    const snoozeUntil = Number(snoozeUntilRaw || "0");
    if (Number.isFinite(snoozeUntil) && snoozeUntil > Date.now()) {
      setDismissed(true);
      return;
    }
    window.localStorage.removeItem(INSTALL_PROMPT_SNOOZE_KEY);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      const snoozeUntilRaw = window.localStorage.getItem(INSTALL_PROMPT_SNOOZE_KEY);
      const snoozeUntil = Number(snoozeUntilRaw || "0");
      setDismissed(Number.isFinite(snoozeUntil) && snoozeUntil > Date.now());
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-foreground">
          Install Uprise for faster access and notifications.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDismissed(true);
              window.localStorage.setItem(
                INSTALL_PROMPT_SNOOZE_KEY,
                String(Date.now() + ONE_DAY_MS),
              );
            }}
          >
            Later
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await deferredPrompt.prompt();
              await deferredPrompt.userChoice;
              window.localStorage.removeItem(INSTALL_PROMPT_SNOOZE_KEY);
              setDeferredPrompt(null);
            }}
          >
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}

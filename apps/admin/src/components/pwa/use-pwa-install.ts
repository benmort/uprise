"use client";

import { useCallback, useEffect, useState } from "react";
import { detectPlatform, type PwaPlatform } from "@/lib/pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALLED_FLAG = "uprise.pwa.installed";

// `beforeinstallprompt` fires once, early — often before any consuming component mounts. Capture
// it at module load and fan out to subscribers so every consumer (the banner AND the settings
// card) shares the one deferred prompt. `appinstalled` clears it and remembers the install.
let deferred: BeforeInstallPromptEvent | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((s) => s());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    try {
      window.localStorage.setItem(INSTALLED_FLAG, "1");
    } catch {
      /* storage blocked — standalone detection still covers the in-app case */
    }
    notify();
  });
}

/** True when the page is running inside the installed app (display-mode standalone, or iOS). */
function runningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia?.("(display-mode: standalone)").matches === true || iosStandalone;
}

export type PwaInstall = {
  platform: PwaPlatform;
  /** Running inside the installed app right now. */
  isStandalone: boolean;
  /** Installed on this device — standalone now, or installed earlier in this browser. */
  isInstalled: boolean;
  /** A one-tap browser install prompt is available (Chromium desktop/Android). */
  canPrompt: boolean;
  /** Trigger the browser install prompt; resolves with the user's choice. */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

/**
 * Shared PWA install state — platform, whether we're already the installed app, whether it's
 * been installed on this device, and a one-tap install action when the browser offers one.
 * There is deliberately no "launch the app" here: no browser exposes an API to open an
 * installed PWA from a tab, so callers show `openHint(platform)` guidance instead.
 */
export function usePwaInstall(): PwaInstall {
  const [, force] = useState(0);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installedFlag, setInstalledFlag] = useState(false);
  const [platform, setPlatform] = useState<PwaPlatform>("desktop");

  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    subs.add(rerender);

    // Platform, refining iPadOS-as-Macintosh (reports "Macintosh" but is touch).
    const ua = navigator.userAgent;
    let p = detectPlatform(ua);
    if (p === "desktop" && /macintosh/i.test(ua) && navigator.maxTouchPoints > 1) p = "ios";
    setPlatform(p);

    setIsStandalone(runningStandalone());
    try {
      setInstalledFlag(window.localStorage.getItem(INSTALLED_FLAG) === "1");
    } catch {
      /* storage blocked */
    }

    const mq = window.matchMedia?.("(display-mode: standalone)");
    const onChange = () => setIsStandalone(runningStandalone());
    mq?.addEventListener?.("change", onChange);
    return () => {
      subs.delete(rerender);
      mq?.removeEventListener?.("change", onChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === "accepted") {
      try {
        window.localStorage.setItem(INSTALLED_FLAG, "1");
      } catch {
        /* storage blocked */
      }
      setInstalledFlag(true);
    }
    notify();
    return outcome;
  }, []);

  return {
    platform,
    isStandalone,
    isInstalled: isStandalone || installedFlag,
    canPrompt: deferred !== null,
    promptInstall,
  };
}

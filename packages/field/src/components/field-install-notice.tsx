"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Share, Smartphone, X } from "lucide-react";
import { Button, QrCode } from "@uprise/ui";
import { getSession } from "../lib/session";
import {
  detectPlatform,
  fieldNoticeMode,
  type FieldNoticeMode,
  type PwaPlatform,
} from "../lib/mobile-only";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Snoozed for the browsing session (not forever) — the field app is phone-first, so the nudge
// should return next visit, but not on every turf tap within a session.
const DISMISS_KEY = "uprise.field.installNotice.dismissed";

/**
 * On a field screen, nudge the canvasser onto their phone: a desktop/tablet viewer gets a
 * "best on your phone" notice with a scan-to-open QR; a phone-browser viewer gets an
 * install-to-home-screen prompt (offline-first PWA). Super-admins (QA on desktop) and the
 * already-installed standalone app see nothing. Dismissable for the session.
 */
export function FieldInstallNotice() {
  const [mode, setMode] = useState<FieldNoticeMode>("none");
  const [platform, setPlatform] = useState<PwaPlatform>("desktop");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    // Capture the Chromium install prompt if it fires (Android / desktop Chromium).
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    // iPadOS 13+ reports "Macintosh" — refine with touch points.
    const ua = navigator.userAgent;
    let p = detectPlatform(ua);
    if (p === "desktop" && /macintosh/i.test(ua) && navigator.maxTouchPoints > 1) p = "ios";
    setPlatform(p);
    setUrl(window.location.href);
    // Touch (coarse pointer) marks a phone OR tablet — both are fine to canvass on.
    const isTouch =
      window.matchMedia?.("(pointer: coarse)").matches === true || navigator.maxTouchPoints > 0;

    let alive = true;
    void getSession().then((principal) => {
      if (!alive) return;
      setMode(
        fieldNoticeMode({
          isTouch,
          width: window.innerWidth,
          isSuperAdmin: principal?.isSuperAdmin === true,
          isStandalone: standalone,
          dismissed,
        }),
      );
    });
    return () => {
      alive = false;
      window.removeEventListener("beforeinstallprompt", onBip);
    };
  }, []);

  if (mode === "none" || typeof document === "undefined") return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage blocked — hide for this mount */
    }
    setMode("none");
  };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "install" ? "Install Uprise Field" : "Open Uprise Field on your phone"}
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-2xl">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-variant"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Smartphone className="h-7 w-7" />
        </span>

        {mode === "use-phone" ? (
          <>
            <h2 className="text-lg font-extrabold text-foreground">Best on your phone</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Uprise Field is built for door-knocking on a mobile — live GPS, offline maps and one-handed
              logging. Scan to open this on your phone.
            </p>
            {url ? (
              <div className="mt-4 flex justify-center">
                <QrCode value={url} size={172} hideActions />
              </div>
            ) : null}
            <Button variant="outline" className="mt-5 w-full" onClick={dismiss}>
              Continue on desktop anyway
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-extrabold text-foreground">Install Uprise Field</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add it to your home screen for offline door-knocking, faster loads and a full-screen app —
              it keeps working with no signal.
            </p>
            {deferred ? (
              <Button className="mt-5 w-full" onClick={() => void install()}>
                Add to home screen
              </Button>
            ) : platform === "ios" ? (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-foreground">
                Tap <Share className="inline h-4 w-4" aria-label="Share" /> then “Add to Home Screen”.
              </p>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Open your browser menu and choose “Add to Home Screen” / “Install app”.
              </p>
            )}
            <Button variant="ghost" className="mt-3 w-full" onClick={dismiss}>
              Maybe later
            </Button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

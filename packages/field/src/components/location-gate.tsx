"use client";

import { useState } from "react";
import { MapPin, Loader2, Settings } from "lucide-react";
import { Button } from "@uprise/ui";
import { useGeolocation } from "../hooks/use-geolocation";

/**
 * Shift-start location gate. Canvassers pin each door they knock, so location is asked for
 * up front as a blocking prompt rather than left to chance at the first door. It appears
 * once per session while the grant is still open ("prompt"/"unknown") or "denied", over a
 * dimmed backdrop; a live grant, an unsupported device (desktop QA), or a dismissal hides it.
 *
 * "Force" here is product-level: the browser owns the permission and won't let us compel it,
 * and it suppresses repeat prompts once blocked — so a denial shows Settings guidance (not a
 * dead re-ask button), and "Not now" stays available so a device that genuinely can't share
 * location is never trapped. The Enable button is kept (the ask), matching the inline one on
 * My turf.
 */
export function LocationGate() {
  const { permission, locating, capture } = useGeolocation();
  const [dismissed, setDismissed] = useState(false);

  // Hidden when: already granted, no geolocation at all (desktop/SSR), or dismissed this session.
  if (dismissed || permission === "granted" || permission === "unsupported") return null;

  const denied = permission === "denied";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share your location"
        className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MapPin className="h-7 w-7" />
        </div>
        <h2 className="text-center text-xl font-extrabold text-foreground">Share your location</h2>

        {denied ? (
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Location is blocked for this app. To pin the doors you knock, turn it back on in your
            browser or phone settings, then reopen this screen.
          </p>
        ) : (
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Canvassing pins each door as you knock, so your walk list and turf show the right spots.
            Turn on location to get started.
          </p>
        )}

        <div className="mt-6 space-y-2">
          {denied ? (
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-3 text-sm font-semibold text-muted-foreground">
              <Settings className="h-4 w-4" />
              Enable location in Settings
            </div>
          ) : (
            <Button className="h-12 w-full gap-2 text-base" disabled={locating} onClick={() => void capture()}>
              {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
              {locating ? "Requesting…" : "Enable location"}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="h-11 w-full rounded-xl text-sm font-semibold text-muted-foreground"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

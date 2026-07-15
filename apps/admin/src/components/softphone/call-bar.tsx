"use client";

import { Loader2, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { useSoftphone } from "./softphone-provider";

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Global in-call widget for the browser softphone — a fixed bar shown only while a
 * call is active, anywhere in the shell. Shows who we're calling, the live timer,
 * the provisioned number the callee sees, and mute / hang-up.
 */
export function CallBar() {
  const { state, active, fromNumber, elapsedSec, muted, error, hangup, toggleMute } = useSoftphone();
  if (state === "idle") return null;

  const status =
    state === "connecting"
      ? "Connecting…"
      : state === "ringing"
        ? "Ringing…"
        : state === "open"
          ? formatElapsed(elapsedSec)
          : error || "Call failed";
  const busy = state === "connecting" || state === "ringing";

  return (
    <div
      role="dialog"
      aria-label="Active call"
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-primary">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {active?.label || active?.toNumber || "Call"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="tabular-nums">{status}</span>
          {fromNumber ? <span> · from {fromNumber}</span> : null}
        </p>
      </div>
      <button
        type="button"
        onClick={toggleMute}
        disabled={state !== "open"}
        aria-pressed={muted}
        aria-label={muted ? "Unmute" : "Mute"}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-variant disabled:opacity-40"
      >
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={hangup}
        aria-label="Hang up"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-error text-white hover:opacity-90"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}

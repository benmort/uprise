"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { transactionalCalls } from "@uprise/api-client";
import { invalidateApi } from "@/lib/use-api";

export type CallState = "idle" | "connecting" | "ringing" | "open" | "error";

export type StartCallInput = { toNumber: string; label?: string; contactId?: string };

type SoftphoneContextValue = {
  state: CallState;
  /** Who we're calling (for the CallBar label). */
  active: StartCallInput | null;
  /** The provisioned number the callee sees; resolved on first call. */
  fromNumber: string | null;
  error: string | null;
  elapsedSec: number;
  muted: boolean;
  startCall: (input: StartCallInput) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
};

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

export function useSoftphone(): SoftphoneContextValue {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) throw new Error("useSoftphone must be used within a SoftphoneProvider");
  return ctx;
}

/**
 * Browser (WebRTC) softphone. Lazily fetches a Twilio Voice access token (minted
 * under the tenant's provisioned account) and registers a Device on first call, so
 * the SDK never loads during SSR. Calls originate from the tenant's provisioned
 * number; the resolved `fromNumber` is surfaced in the CallBar.
 */
export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  // `any` — the SDK is dynamically imported (browser-only); its types are erased.
  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const [state, setState] = useState<CallState>("idle");
  const [active, setActive] = useState<StartCallInput | null>(null);
  const [fromNumber, setFromNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [muted, setMuted] = useState(false);

  // Tick the in-call timer only while connected.
  useEffect(() => {
    if (state !== "open") {
      setElapsedSec(0);
      return;
    }
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  const ensureDevice = useCallback(async () => {
    // Always mint a FRESH access token: the token is short-lived (1h) and the Device is
    // cached for the whole session, so a token minted once goes stale and Twilio rejects it
    // (error 20104 → the gateway HANGUPs the call, surfacing as 31005). Refreshing on every
    // call — plus a `tokenWillExpire` handler for long-lived registrations — keeps it valid.
    const res = await transactionalCalls.voiceToken();
    if (!res.ok) throw new Error(res.error);
    setFromNumber(res.data.fromNumber || null);
    if (deviceRef.current) {
      deviceRef.current.updateToken(res.data.token);
      return deviceRef.current;
    }
    const { Device } = await import("@twilio/voice-sdk");
    const device = new Device(res.data.token, { logLevel: "error" });
    // The SDK fires this ~before expiry while the Device is alive — re-mint and swap in the
    // new token so an idle-but-open softphone never places a call on an expired token.
    device.on("tokenWillExpire", async () => {
      const next = await transactionalCalls.voiceToken();
      if (next.ok) device.updateToken(next.data.token);
    });
    deviceRef.current = device;
    return device;
  }, []);

  const reset = useCallback(() => {
    callRef.current = null;
    setMuted(false);
    setActive(null);
  }, []);

  const startCall = useCallback(
    async (input: StartCallInput) => {
      if (state !== "idle" && state !== "error") return; // one call at a time
      setError(null);
      setActive(input);
      setState("connecting");
      try {
        const device = await ensureDevice();
        const call = await device.connect({
          params: { To: input.toNumber, ...(input.contactId ? { contactId: input.contactId } : {}) },
        });
        callRef.current = call;
        call.on("ringing", () => setState("ringing"));
        call.on("accept", () => setState("open"));
        call.on("disconnect", () => {
          setState("idle");
          reset();
          invalidateApi("/calls");
        });
        call.on("cancel", () => {
          setState("idle");
          reset();
        });
        call.on("error", (e: { message?: string }) => {
          setError(e?.message ?? "Call error");
          setState("error");
          reset();
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start the call");
        setState("error");
        reset();
      }
    },
    [state, ensureDevice, reset],
  );

  const hangup = useCallback(() => {
    try {
      callRef.current?.disconnect();
    } catch {
      /* already gone */
    }
    setState("idle");
    reset();
    invalidateApi("/calls");
  }, [reset]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    setMuted((prev) => {
      const next = !prev;
      call.mute(next);
      return next;
    });
  }, []);

  return (
    <SoftphoneContext.Provider
      value={{ state, active, fromNumber, error, elapsedSec, muted, startCall, hangup, toggleMute }}
    >
      {children}
    </SoftphoneContext.Provider>
  );
}

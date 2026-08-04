"use client";

import { useCallback, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";

/**
 * The widget's browser voice leg. The SDK is LAZY-IMPORTED on the CTA click so
 * the public page/embed never pays its weight up front, and a fresh Device is
 * built per session (widget tokens are single-session, ≤15 min — nothing to
 * cache). Mic-denied is distinguished so the UI can offer the full-page
 * fallback (some embedding hosts refuse the microphone delegation).
 */

export type VoiceCallStatus = "idle" | "connecting" | "open" | "ended" | "error";

export type VoiceCallError = { message: string; micDenied: boolean };

const MIC_DENIED_RE = /NotAllowedError|PermissionDenied|31208|AcquisitionFailedError/i;

export function useVoiceCall(handlers: {
  onOpen?: () => void;
  onEnded: () => void;
  onError: (error: VoiceCallError) => void;
}) {
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [status, setStatus] = useState<VoiceCallStatus>("idle");
  const [muted, setMuted] = useState(false);

  const teardown = useCallback(() => {
    try {
      callRef.current?.disconnect();
    } catch {
      /* already gone */
    }
    try {
      deviceRef.current?.destroy();
    } catch {
      /* already gone */
    }
    callRef.current = null;
    deviceRef.current = null;
    setMuted(false);
  }, []);

  const start = useCallback(
    async (token: string, sessionId: string) => {
      setStatus("connecting");
      try {
        const { Device } = await import("@twilio/voice-sdk");
        const device = new Device(token, { logLevel: "error" });
        deviceRef.current = device;
        const call = await device.connect({ params: { sessionId } });
        callRef.current = call;
        call.on("accept", () => {
          setStatus("open");
          handlersRef.current.onOpen?.();
        });
        call.on("disconnect", () => {
          setStatus("ended");
          teardown();
          handlersRef.current.onEnded();
        });
        call.on("cancel", () => {
          setStatus("ended");
          teardown();
          handlersRef.current.onEnded();
        });
        call.on("error", (error: { message?: string; code?: number }) => {
          const message = error?.message ?? "Call error";
          setStatus("error");
          teardown();
          handlersRef.current.onError({
            message,
            micDenied: MIC_DENIED_RE.test(`${error?.code ?? ""} ${message}`),
          });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Couldn't start the call";
        setStatus("error");
        teardown();
        handlersRef.current.onError({
          message,
          micDenied: MIC_DENIED_RE.test(`${(error as { name?: string })?.name ?? ""} ${message}`),
        });
      }
    },
    [teardown],
  );

  const sendDigits = useCallback((digits: string) => {
    try {
      callRef.current?.sendDigits(digits);
    } catch {
      /* between legs — a dropped digit is recoverable by pressing again */
    }
  }, []);

  const hangUp = useCallback(() => {
    setStatus("ended");
    teardown();
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    setMuted((previous) => {
      call.mute(!previous);
      return !previous;
    });
  }, []);

  return { status, start, sendDigits, hangUp, muted, toggleMute };
}

"use client";

import * as React from "react";
import type { PublicActionPagePayload } from "@uprise/contracts";
import { publicActions } from "@uprise/api-client";
import {
  CallWidget,
  TurnstileWidget,
  type CallWidgetScreen,
  type CallWidgetValues,
  type TurnstileHandle,
} from "@uprise/ui";
import { reduceProgress } from "./call-state";
import { useCallProgress } from "./use-call-progress";
import { useVoiceCall } from "./use-voice-call";
import type { ProgressEvent } from "./progress-events";

/**
 * The effectful click-to-call container: session mint → SSE progress → lazy
 * Voice-SDK leg, feeding the pure CallWidget screens. The same component runs
 * on the public page and inside the sandboxed embed iframe (`embedded` adds
 * the PII-free postMessage bridge the web-component loader listens to).
 */
export function ClickToCallWidget({
  slug,
  page,
  embedded = false,
}: {
  slug: string;
  page: PublicActionPagePayload;
  embedded?: boolean;
}) {
  const [screen, setScreen] = React.useState<CallWidgetScreen>({ kind: "idle" });
  const [values, setValues] = React.useState<CallWidgetValues>({ name: "", email: "", phone: "" });
  const turnstileRef = React.useRef<TurnstileHandle>(null);
  const screenKindRef = React.useRef(screen.kind);
  screenKindRef.current = screen.kind;

  // Prefill rides postMessage from the loader (never URL params); honoured
  // only when the page allows it and the message comes from our parent frame.
  React.useEffect(() => {
    if (!embedded || !page.page.allowPrefill || typeof window === "undefined") return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as { type?: string; name?: string; email?: string; phone?: string } | null;
      if (!data || data.type !== "uprise:action:prefill") return;
      setValues((current) => ({
        name: typeof data.name === "string" && !current.name ? data.name : current.name,
        email: typeof data.email === "string" && !current.email ? data.email : current.email,
        phone: typeof data.phone === "string" && !current.phone ? data.phone : current.phone,
      }));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedded, page.page.allowPrefill]);

  const postToParent = React.useCallback(
    (message: Record<string, unknown>) => {
      if (!embedded || typeof window === "undefined" || window.parent === window) return;
      // The parent's origin comes from the referrer; height/event payloads are
      // PII-free by construction so "*" is an acceptable fallback.
      let target = "*";
      try {
        if (document.referrer) target = new URL(document.referrer).origin;
      } catch {
        /* keep "*" */
      }
      window.parent.postMessage(message, target);
    },
    [embedded],
  );

  const onProgressEvent = React.useCallback(
    (event: ProgressEvent) => {
      setScreen((current) => reduceProgress(current, event));
      postToParent({ type: "uprise:action:event", name: event.name });
    },
    [postToParent],
  );

  const progress = useCallProgress(onProgressEvent);

  const voice = useVoiceCall({
    onEnded: () => {
      progress.close();
      setScreen((current) =>
        current.kind === "error" || current.kind === "ended"
          ? current
          : { kind: "ended", message: page.page.successMessage },
      );
    },
    onError: (error) => {
      progress.close();
      setScreen({ kind: "error", message: error.message, micDenied: error.micDenied, canRetry: true });
    },
  });

  const start = React.useCallback(async () => {
    if (screenKindRef.current !== "idle" && screenKindRef.current !== "error") return;
    setScreen({ kind: "creating" });

    const captchaToken = page.page.requireCaptcha
      ? ((await turnstileRef.current?.execute()) ?? undefined)
      : undefined;

    let embedAncestor: string | undefined;
    if (embedded && typeof document !== "undefined" && document.referrer) {
      try {
        embedAncestor = new URL(document.referrer).hostname;
      } catch {
        embedAncestor = undefined;
      }
    }

    const supporter: { name?: string; email?: string; phone?: string } = {};
    if (page.page.collectName && values.name.trim()) supporter.name = values.name.trim();
    if (page.page.collectEmail && values.email.trim()) supporter.email = values.email.trim();
    if (page.page.collectPhone && values.phone.trim()) supporter.phone = values.phone.trim();

    const res = await publicActions.createCallSession(slug, { supporter, embedAncestor }, captchaToken);
    if (!res.ok) {
      const message =
        res.status === 429
          ? "This page is receiving a lot of calls right now — please try again in a few minutes."
          : res.error || "We couldn't start your call.";
      setScreen({ kind: "error", message, canRetry: true });
      return;
    }

    setScreen({ kind: "connecting" });
    progress.connect(publicActions.sessionEventsUrl(res.data.sessionId, res.data.progress.token));
    await voice.start(res.data.voice.token, res.data.sessionId);
  }, [embedded, page.page, progress, slug, values, voice]);

  const fullPageUrl = React.useMemo(() => {
    if (!embedded || typeof window === "undefined") return null;
    return window.location.href.replace(/\/embed(?:\?.*)?$/, "");
  }, [embedded]);

  return (
    <CallWidget
      screen={screen}
      headline={page.page.headline}
      body={page.page.body}
      ctaLabel={page.page.ctaLabel}
      targetLabel={page.campaign?.targetLabel ?? null}
      fields={{
        collectName: page.page.collectName,
        collectEmail: page.page.collectEmail,
        collectPhone: page.page.collectPhone,
      }}
      values={values}
      onValuesChange={setValues}
      onStart={() => void start()}
      onDigit={voice.sendDigits}
      onHangUp={voice.hangUp}
      onRetry={() => setScreen({ kind: "idle" })}
      muted={voice.muted}
      onToggleMute={voice.toggleMute}
      captchaSlot={page.page.requireCaptcha ? <TurnstileWidget ref={turnstileRef} /> : null}
      fullPageUrl={fullPageUrl}
    />
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DIALER_PROGRESS_EVENT_NAMES, type ProgressEvent } from "./progress-events";

/**
 * The widget's SSE progress channel. The API stream is serverless-shaped (25 s
 * max, then it ends) so EventSource's built-in reconnect does the long-poll
 * loop for us; `?after=` seeds the resume cursor because a NEW EventSource (our
 * backoff path) doesn't carry Last-Event-ID. Losing the stream mid-call keeps
 * the call alive — progress is advisory, the audio is the product.
 */
export function useCallProgress(onEvent: (event: ProgressEvent) => void) {
  const sourceRef = useRef<EventSource | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const retriesRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [degraded, setDegraded] = useState(false);

  const close = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    urlRef.current = null;
    lastIdRef.current = null;
    retriesRef.current = 0;
    setDegraded(false);
  }, []);

  const openSource = useCallback(() => {
    const base = urlRef.current;
    if (!base) return;
    const url = lastIdRef.current
      ? `${base}&after=${encodeURIComponent(lastIdRef.current)}`
      : base;
    const source = new EventSource(url);
    sourceRef.current = source;

    for (const name of DIALER_PROGRESS_EVENT_NAMES) {
      source.addEventListener(name, (raw) => {
        const message = raw as MessageEvent<string>;
        retriesRef.current = 0;
        setDegraded(false);
        if (message.lastEventId) lastIdRef.current = message.lastEventId;
        let payload: Record<string, unknown> | undefined;
        try {
          payload = message.data ? (JSON.parse(message.data) as Record<string, unknown>) : undefined;
        } catch {
          payload = undefined;
        }
        onEventRef.current({ name, payload });
      });
    }

    source.onerror = () => {
      // The server ends every stream at ~25 s; that's a scheduled reconnect,
      // not a failure. Only repeated failures degrade the indicator.
      source.close();
      if (sourceRef.current !== source) return;
      retriesRef.current += 1;
      if (retriesRef.current >= 3) setDegraded(true);
      const backoff = Math.min(8000, 500 * 2 ** Math.min(retriesRef.current, 4));
      setTimeout(() => {
        if (sourceRef.current === source && urlRef.current) openSource();
      }, backoff);
    };
  }, []);

  const connect = useCallback(
    (url: string) => {
      close();
      urlRef.current = url;
      retriesRef.current = 0;
      openSource();
    },
    [close, openSource],
  );

  useEffect(() => close, [close]);

  return { connect, close, degraded };
}

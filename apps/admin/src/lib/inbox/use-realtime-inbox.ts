'use client';

// Realtime inbox SSE hook — ported from the /inbox page (token + EventSource on
// /analytics/stream, refresh-before-expiry, exponential-backoff reconnect). Fires the
// callback for inbox.inbound / inbox.reply events so the shared inbox can refetch.
import { useEffect, useRef } from 'react';
import { getApiUrl, getRealtimeStreamToken } from '@/lib/api';
import { nextReconnectDelay } from './reconnect-backoff';

export type InboxRealtimeEvent = { type: string; payload: Record<string, unknown> };

export function useRealtimeInbox(onEvent: (event: InboxRealtimeEvent) => void, enabled = true) {
  const cbRef = useRef(onEvent);
  useEffect(() => {
    cbRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let attempts = 0;

    const close = () => {
      source?.close();
      source = null;
    };
    const clearTimers = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      refreshTimer = null;
      reconnectTimer = null;
    };
    // One backoff path for both failure modes (no token, or a dropped stream):
    // bump the attempt count and retry after an exponentially-growing, capped
    // delay so a persistent failure stops hammering (and stops re-logging the
    // browser's CORS/network error) every few seconds. onopen resets attempts.
    const scheduleReconnect = () => {
      attempts += 1;
      reconnectTimer = setTimeout(() => void connect(), nextReconnectDelay(attempts));
    };

    const connect = async () => {
      if (cancelled) return;
      close();
      const tok = await getRealtimeStreamToken();
      if (cancelled) return;
      if (!tok.ok) {
        scheduleReconnect();
        return;
      }
      const expiresAtMs = Date.parse(tok.data.expiresAt);
      if (Number.isFinite(expiresAtMs)) {
        const refreshInMs = Math.max(5000, expiresAtMs - Date.now() - 30000);
        refreshTimer = setTimeout(() => {
          close();
          void connect();
        }, refreshInMs);
      }
      const url = new URL(`${getApiUrl()}/analytics/stream`);
      url.searchParams.set('token', tok.data.token);
      source = new EventSource(url.toString(), { withCredentials: false });
      source.onopen = () => {
        attempts = 0;
      };
      source.onerror = () => {
        close();
        scheduleReconnect();
      };
      source.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data || '{}') as InboxRealtimeEvent;
          if (parsed.type) cbRef.current(parsed);
        } catch {
          /* ignore malformed frames */
        }
      };
    };

    void connect();
    return () => {
      cancelled = true;
      clearTimers();
      close();
    };
  }, [enabled]);
}

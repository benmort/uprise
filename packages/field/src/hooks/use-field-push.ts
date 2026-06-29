"use client";

import { useCallback, useEffect, useState } from "react";
import { getPushConfig, subscribePush } from "../api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type PushState = {
  supported: boolean;
  enabled: boolean; // server feature on + keys present
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  busy: boolean;
};

/**
 * Field push (G14): registers a web-push subscription for this device when the
 * server feature is on and the volunteer grants permission. Safe no-op when push
 * is unsupported or unconfigured.
 */
export function useFieldPush() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const supported =
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const [state, setState] = useState<PushState>({
    supported,
    enabled: false,
    permission: supported ? Notification.permission : "unsupported",
    subscribed: false,
    busy: false,
  });

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void (async () => {
      const cfg = await getPushConfig();
      if (!alive) return;
      if (cfg.ok && cfg.data.enabled && cfg.data.publicKey) {
        setPublicKey(cfg.data.publicKey);
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        const existing = reg ? await reg.pushManager.getSubscription() : null;
        setState((s) => ({ ...s, enabled: true, subscribed: Boolean(existing) }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported || !publicKey) return false;
    setState((s) => ({ ...s, busy: true }));
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState((s) => ({ ...s, permission, busy: false }));
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await subscribePush({
        endpoint: json.endpoint || sub.endpoint,
        keys: { p256dh: json.keys?.p256dh || "", auth: json.keys?.auth || "" },
        userAgent: navigator.userAgent,
      });
      setState((s) => ({ ...s, permission, subscribed: true, busy: false }));
      return true;
    } catch {
      setState((s) => ({ ...s, busy: false }));
      return false;
    }
  }, [supported, publicKey]);

  return { ...state, enable };
}

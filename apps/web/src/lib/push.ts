import { request } from "./request-core";

let cachedToken: string | null = null;
let foregroundListenerStarted = false;
const PUSH_NOTIFICATIONS_ENABLED_KEY = "yarns.push.notificationsEnabled";

export function loadPushNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(PUSH_NOTIFICATIONS_ENABLED_KEY);
  if (raw === null) return true;
  try {
    return Boolean(JSON.parse(raw));
  } catch {
    return raw === "true";
  }
}

export function savePushNotificationsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, JSON.stringify(Boolean(enabled)));
}

export async function registerForPush():
  Promise<{ token: string } | { error: string }> {
  if (typeof window === "undefined") return { error: "Push is only available in the browser." };
  if (!("Notification" in window)) return { error: "Notifications are not supported by this browser." };
  if (!("serviceWorker" in navigator)) return { error: "Service worker is required for push." };
  if (cachedToken) return { token: cachedToken };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { error: "Notification permission denied." };

    const configRes = await fetch("/fcm-config");
    if (!configRes.ok) return { error: "Unable to load Firebase config." };
    const config = (await configRes.json()) as {
      apiKey?: string;
      authDomain?: string;
      projectId?: string;
      storageBucket?: string;
      messagingSenderId?: string;
      appId?: string;
      vapidKey?: string;
    };
    if (!config.apiKey || !config.projectId || !config.appId || !config.messagingSenderId) {
      return { error: "Firebase messaging is not configured." };
    }

    const [{ initializeApp, getApps }, { getMessaging, getToken, onMessage }] = await Promise.all([
      import("firebase/app"),
      import("firebase/messaging"),
    ]);

    const app = getApps().length > 0 ? getApps()[0] : initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const initMessage = {
      type: "INIT_FIREBASE_MESSAGING",
      config: {
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      },
    };
    if (registration.active) {
      registration.active.postMessage(initMessage);
    } else {
      const ready = await navigator.serviceWorker.ready;
      ready.active?.postMessage(initMessage);
    }
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: config.vapidKey || undefined,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { error: "Push token could not be generated." };

    if (!foregroundListenerStarted) {
      foregroundListenerStarted = true;
      onMessage(messaging, (payload) => {
        const data = payload.data || {};
        const title = String(data.title || payload.notification?.title || "New message");
        const body = String(data.body || payload.notification?.body || "");
        const url = String(data.url || "/inbox");
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        const notification = new Notification(title, { body });
        notification.onclick = () => {
          window.focus();
          window.location.assign(url);
          notification.close();
        };
      });
    }

    cachedToken = token;
    return { token };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function registerPushToken(token: string) {
  return request("/push/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

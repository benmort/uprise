/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

let messaging = null;

function ensureMessaging() {
  if (messaging) return messaging;
  if (!firebase.apps.length) return null;
  messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const title = data.title || payload.notification?.title || "New message";
    const body = data.body || payload.notification?.body || "";
    const url = data.url || "/inbox";
    self.registration.showNotification(title, {
      body,
      data: { url },
    });
  });
  return messaging;
}

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "INIT_FIREBASE_MESSAGING") return;
  const config = event.data.config || {};
  if (!firebase.apps.length) {
    firebase.initializeApp(config);
  }
  ensureMessaging();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/inbox";
  event.waitUntil(clients.openWindow(url));
});

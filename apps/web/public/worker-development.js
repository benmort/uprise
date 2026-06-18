/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
// Custom service-worker logic merged into the next-pwa service worker
// (next-pwa bundles worker/index.js automatically). Handles web-push (G14):
// show the notification, and focus/open the field app on click.

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      body: event.data ? event.data.text() : ""
    };
  }
  const title = data.title || "Yarns";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/images/yarns-logo-full.png",
    badge: "/images/yarns-logo-full.png",
    data: {
      url: data.url || "/field"
    }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url || "/field";
  event.waitUntil(self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  }).then(wins => {
    for (const w of wins) {
      if (w.url.includes(target) && "focus" in w) return w.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return undefined;
  }));
});
/******/ })()
;
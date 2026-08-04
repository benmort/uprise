"use client";

import * as React from "react";

/**
 * Height reporter for the embed iframe: observes the document and posts
 * `uprise:action:height` to the host so the web-component loader (or the
 * iframe snippet's optional listener) can auto-size the frame. Content is a
 * bare integer — nothing sensitive rides this channel.
 */
export function EmbedFrameBridge() {
  React.useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    let target = "*";
    try {
      if (document.referrer) target = new URL(document.referrer).origin;
    } catch {
      /* keep "*" */
    }
    const post = () => {
      const height = Math.ceil(document.documentElement.scrollHeight);
      window.parent.postMessage({ type: "uprise:action:height", height }, target);
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);
  return null;
}

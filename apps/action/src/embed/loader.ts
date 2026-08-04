/**
 * <uprise-action> — the script-tag embed. Dependency-free custom element that
 * renders the action app's embed iframe and bridges its PII-free postMessage
 * protocol (height + event names) to the host page as DOM CustomEvents.
 *
 *   <script async src="https://action.uprise.org.au/embed/v1/uprise-action.js"></script>
 *   <uprise-action org="tenant-slug" page="page-slug"></uprise-action>
 *
 * Attributes:
 *   org (required)   — tenant slug in the page path
 *   page (required)  — the action page's public slug
 *   base             — action app origin; defaults from the script's own src
 *                      (fixes the source's ignored backend-url attribute)
 *   name/email/phone — optional prefill, posted INTO the frame (never URL params)
 *   max-width        — CSS max-width for the frame wrapper (default 480px)
 *   min-height       — starting iframe height before the first height report
 *
 * Events re-dispatched on the element: `uprise-action:<name>` for each widget
 * progress event (e.g. uprise-action:call_connected_conference), plus
 * `uprise-action:height`. Message origin AND source are verified both ways.
 *
 * Built to /embed/v1/uprise-action.js (path-versioned; breaking changes ship
 * as /v2/). Kept dependency-free and ES2019-safe on purpose.
 */

(() => {
  if (typeof window === "undefined" || window.customElements?.get("uprise-action")) return;

  // The default base comes from wherever THIS script was loaded from.
  const scriptSrc =
    (document.currentScript as HTMLScriptElement | null)?.src ??
    (document.querySelector('script[src*="uprise-action"]') as HTMLScriptElement | null)?.src ??
    "";
  let defaultBase = "";
  try {
    defaultBase = scriptSrc ? new URL(scriptSrc).origin : "";
  } catch {
    defaultBase = "";
  }

  class UpriseAction extends HTMLElement {
    private frame: HTMLIFrameElement | null = null;
    private frameOrigin = "";
    private onMessage = (event: MessageEvent) => {
      if (!this.frame || event.source !== this.frame.contentWindow) return;
      if (this.frameOrigin && event.origin !== this.frameOrigin) return;
      const data = event.data as { type?: string; height?: number; name?: string } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "uprise:action:height" && typeof data.height === "number" && data.height > 0) {
        this.frame.style.height = `${Math.min(4000, Math.ceil(data.height))}px`;
        this.dispatchEvent(new CustomEvent("uprise-action:height", { detail: { height: data.height } }));
        return;
      }
      if (data.type === "uprise:action:event" && typeof data.name === "string" && /^[a-z_]+$/.test(data.name)) {
        this.dispatchEvent(new CustomEvent(`uprise-action:${data.name}`));
      }
    };

    connectedCallback() {
      if (this.frame) return;
      const org = this.getAttribute("org") ?? "";
      const page = this.getAttribute("page") ?? "";
      const base = (this.getAttribute("base") ?? defaultBase).replace(/\/+$/, "");
      if (!org || !page || !base) return;

      let url: URL;
      try {
        url = new URL(`/${encodeURIComponent(org)}/actions/${encodeURIComponent(page)}/embed`, base);
      } catch {
        return;
      }
      this.frameOrigin = url.origin;

      const wrapper = document.createElement("div");
      wrapper.style.maxWidth = this.getAttribute("max-width") ?? "480px";
      wrapper.style.width = "100%";

      const frame = document.createElement("iframe");
      frame.src = url.toString();
      frame.title = "Take action";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
      // The widget places a browser call — the host page must delegate the mic.
      frame.setAttribute("allow", `microphone ${url.origin}`);
      frame.style.border = "0";
      frame.style.width = "100%";
      frame.style.display = "block";
      frame.style.height = this.getAttribute("min-height") ?? "420px";
      frame.loading = "lazy";

      frame.addEventListener("load", () => {
        // Optional prefill rides postMessage INTO the frame — never URL params.
        const prefill: Record<string, string> = {};
        for (const key of ["name", "email", "phone"] as const) {
          const value = this.getAttribute(key);
          if (value) prefill[key] = value;
        }
        if (Object.keys(prefill).length > 0) {
          frame.contentWindow?.postMessage({ type: "uprise:action:prefill", ...prefill }, this.frameOrigin);
        }
      });

      window.addEventListener("message", this.onMessage);
      wrapper.appendChild(frame);
      this.appendChild(wrapper);
      this.frame = frame;
    }

    disconnectedCallback() {
      window.removeEventListener("message", this.onMessage);
      this.frame = null;
    }
  }

  window.customElements.define("uprise-action", UpriseAction);
})();

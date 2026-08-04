"use strict";
(() => {
  // src/embed/loader.ts
  (() => {
    var _a, _b, _c, _d, _e;
    if (typeof window === "undefined" || ((_a = window.customElements) == null ? void 0 : _a.get("uprise-action"))) return;
    const scriptSrc = (_e = (_d = (_b = document.currentScript) == null ? void 0 : _b.src) != null ? _d : (_c = document.querySelector('script[src*="uprise-action"]')) == null ? void 0 : _c.src) != null ? _e : "";
    let defaultBase = "";
    try {
      defaultBase = scriptSrc ? new URL(scriptSrc).origin : "";
    } catch {
      defaultBase = "";
    }
    class UpriseAction extends HTMLElement {
      constructor() {
        super(...arguments);
        this.frame = null;
        this.frameOrigin = "";
        this.onMessage = (event) => {
          if (!this.frame || event.source !== this.frame.contentWindow) return;
          if (this.frameOrigin && event.origin !== this.frameOrigin) return;
          const data = event.data;
          if (!data || typeof data.type !== "string") return;
          if (data.type === "uprise:action:height" && typeof data.height === "number" && data.height > 0) {
            this.frame.style.height = `${Math.min(4e3, Math.ceil(data.height))}px`;
            this.dispatchEvent(new CustomEvent("uprise-action:height", { detail: { height: data.height } }));
            return;
          }
          if (data.type === "uprise:action:event" && typeof data.name === "string" && /^[a-z_]+$/.test(data.name)) {
            this.dispatchEvent(new CustomEvent(`uprise-action:${data.name}`));
          }
        };
      }
      connectedCallback() {
        var _a2, _b2, _c2, _d2, _e2;
        if (this.frame) return;
        const org = (_a2 = this.getAttribute("org")) != null ? _a2 : "";
        const page = (_b2 = this.getAttribute("page")) != null ? _b2 : "";
        const base = ((_c2 = this.getAttribute("base")) != null ? _c2 : defaultBase).replace(/\/+$/, "");
        if (!org || !page || !base) return;
        let url;
        try {
          url = new URL(`/${encodeURIComponent(org)}/actions/${encodeURIComponent(page)}/embed`, base);
        } catch {
          return;
        }
        this.frameOrigin = url.origin;
        const wrapper = document.createElement("div");
        wrapper.style.maxWidth = (_d2 = this.getAttribute("max-width")) != null ? _d2 : "480px";
        wrapper.style.width = "100%";
        const frame = document.createElement("iframe");
        frame.src = url.toString();
        frame.title = "Take action";
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
        frame.setAttribute("allow", `microphone ${url.origin}`);
        frame.style.border = "0";
        frame.style.width = "100%";
        frame.style.display = "block";
        frame.style.height = (_e2 = this.getAttribute("min-height")) != null ? _e2 : "420px";
        frame.loading = "lazy";
        frame.addEventListener("load", () => {
          var _a3;
          const prefill = {};
          for (const key of ["name", "email", "phone"]) {
            const value = this.getAttribute(key);
            if (value) prefill[key] = value;
          }
          if (Object.keys(prefill).length > 0) {
            (_a3 = frame.contentWindow) == null ? void 0 : _a3.postMessage({ type: "uprise:action:prefill", ...prefill }, this.frameOrigin);
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
})();

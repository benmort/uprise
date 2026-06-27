// Cookie-based request (meld doc 14). The shared low-level wrapper used by the
// per-domain api modules; auth is the httpOnly session cookie, handled by
// @uprise/api-client (credentials:include + 401 → auth app).
export { request, getApiUrl } from "@uprise/api-client";

import { request } from "./request-core";

export async function registerForPush():
  Promise<{ token: string } | { error: string }> {
  return { error: "Push registration disabled in this build." };
}

export async function registerPushToken(token: string) {
  return request("/push/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

"use client";

import { useEffect } from "react";
import { authAppUrl } from "@/lib/links";

/** Sign-up lives in the auth app (SSO hub, meld doc 14). Bounce there. */
export default function SignUpRedirect() {
  useEffect(() => {
    window.location.assign(`${authAppUrl()}/sign-up`);
  }, []);
  return (
    <main className="mx-auto w-full max-w-page px-6 py-24 text-center text-sm text-muted-foreground">
      Redirecting to sign-up…
    </main>
  );
}

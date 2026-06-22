"use client";

import { useEffect, useState } from "react";

/**
 * Read URL query params on the client without next/navigation's useSearchParams,
 * which forces a Suspense boundary at build time. These auth pages are fully
 * interactive (client-only), so reading from window after mount is sufficient
 * and keeps the build static-shell friendly.
 */
export function useQueryParams(): URLSearchParams {
  const [params, setParams] = useState<URLSearchParams>(() => new URLSearchParams());
  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
  }, []);
  return params;
}

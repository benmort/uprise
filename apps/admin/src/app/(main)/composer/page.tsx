"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LegacyComposerRoutePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const blastId = searchParams.get("blastId");
    if (blastId) {
      router.replace(`/blasts/${encodeURIComponent(blastId)}/composer`);
      return;
    }
    router.replace("/dashboard");
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Redirecting...
    </div>
  );
}

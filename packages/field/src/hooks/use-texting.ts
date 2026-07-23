"use client";

import { useApi } from "./use-api";
import {
  getTextingFlow,
  getTextingQueue,
  getTextingThread,
  listTextBanks,
  type TextBank,
  type TextingFlow,
  type TextingQueue,
  type TextingThread,
} from "../api/texting";

// Texting is online work (carrier messages), so these poll rather than SSE (volunteers
// don't hold a stream-token permission) — the same cadence the admin inbox uses as its
// fallback: banks/queue every 6s, an open thread every 4s.

export function useTextBanks(enabled = true) {
  return useApi<TextBank[]>(enabled ? "/texting/banks" : null, (signal) => listTextBanks(signal), {
    ttlMs: 3_000,
    refetchInterval: 6_000,
  });
}

export function useTextingQueue(blastId: string | null) {
  return useApi<TextingQueue>(
    blastId ? `/texting/banks/${encodeURIComponent(blastId)}/queue` : null,
    (signal) => getTextingQueue(blastId as string, signal),
    { ttlMs: 3_000, refetchInterval: 6_000 },
  );
}

export function useTextingThread(contactPhone: string | null) {
  return useApi<TextingThread>(
    contactPhone ? `/texting/conversations/${encodeURIComponent(contactPhone)}` : null,
    (signal) => getTextingThread(contactPhone as string, signal),
    { ttlMs: 2_000, refetchInterval: 4_000 },
  );
}

export function useTextingFlow(blastId: string | null) {
  return useApi<TextingFlow>(
    blastId ? `/engagement/flow?objectType=BLAST&objectId=${encodeURIComponent(blastId)}` : null,
    (signal) => getTextingFlow(blastId as string, signal),
    { ttlMs: 300_000 },
  );
}

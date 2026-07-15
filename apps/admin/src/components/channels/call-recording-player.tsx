"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { transactionalCalls } from "@uprise/api-client";

/**
 * Inline playback for a call recording. The raw Twilio media needs account auth,
 * so the audio element points at the API's authenticated recording proxy (loaded
 * with the SSO cookie). Renders a Play button until clicked, then the audio.
 */
export function CallRecordingPlayer({ callId }: { callId: string }) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio controls autoPlay className="h-8 max-w-[220px]" src={transactionalCalls.recordingUrl(callId)} />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-variant"
    >
      <Play className="h-3.5 w-3.5" />
      Play
    </button>
  );
}

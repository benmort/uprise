"use client";

import { useEffect, useState } from "react";
import { Globe2, Lock } from "lucide-react";
import { getSession } from "@/lib/session";
import { setPollPublic, type PollDetail } from "@/lib/api/insights";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Toggle a poll's cross-tenant visibility. Shown only to an OWNER/ORGANISER of the poll's own
 * tenant, or a super-admin (who may toggle any poll) — everyone else gets nothing. The API
 * enforces the same gate; this is advisory UI. Making a poll public lets every organisation
 * read it.
 */
export function PollVisibility({ poll, onChanged }: { poll: PollDetail; onChanged: () => void }) {
  const { showToast } = useToast();
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPublic, setIsPublic] = useState(poll.isPublic);

  useEffect(() => setIsPublic(poll.isPublic), [poll.isPublic]);
  useEffect(() => {
    let live = true;
    void getSession().then((p) => {
      if (!live || !p) return;
      const canManage = p.role === "OWNER" || p.role === "ORGANISER";
      setAllowed((poll.owned && canManage) || p.isSuperAdmin === true);
    });
    return () => {
      live = false;
    };
  }, [poll.owned]);

  if (!allowed) return null;

  const toggle = async () => {
    setBusy(true);
    const next = !isPublic;
    const res = await setPollPublic(poll.id, next);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't update visibility", description: res.error });
      return;
    }
    setIsPublic(next);
    showToast({
      tone: "success",
      title: next ? "Poll is now public" : "Poll is now private",
      description: next ? "Every organisation can see it." : "Only your organisation can see it.",
    });
    onChanged();
  };

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs">
      {isPublic ? (
        <Globe2 className="h-3.5 w-3.5 text-primary" />
      ) : (
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="font-medium text-foreground">{isPublic ? "Public" : "Private"}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs"
        disabled={busy}
        onClick={() => void toggle()}
      >
        {busy ? "…" : isPublic ? "Make private" : "Make public"}
      </Button>
    </span>
  );
}

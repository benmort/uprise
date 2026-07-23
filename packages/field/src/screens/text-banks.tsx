"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Inbox, MessagesSquare, Send } from "lucide-react";
import { Button, EmptyState, Skeleton, useToast } from "@uprise/ui";
import { claimTextingBatch, type TextBank } from "../api/texting";
import { useTextBanks } from "../hooks/use-texting";
import { TextingMenu } from "../components/texting-menu";

/**
 * My text banks — the volunteer's texting home. Each bank (an SMS canvass campaign) lists
 * its P2P waves with two claims: "Get N texts" (scripted initial sends to press-send in the
 * session) and "Answer replies" (take ownership of unread conversations). Organisers see
 * the same list through the TextingMenu with live blast status. Phone-first; comfortable on
 * desktop as a centred column.
 */
export function TextBanks() {
  const router = useRouter();
  const { showToast } = useToast();
  const { data: banks, loading, error, refetch } = useTextBanks();
  const [claiming, setClaiming] = useState<string | null>(null);

  const claim = async (blastId: string, kind: "initial" | "replies") => {
    setClaiming(`${blastId}:${kind}`);
    const res = await claimTextingBatch(blastId, kind, 10);
    setClaiming(null);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't claim texts", description: res.error });
      return;
    }
    if (res.data.claimed === 0) {
      showToast({ tone: "info", title: kind === "initial" ? "Nothing left to send" : "No replies waiting" });
      await refetch();
      return;
    }
    showToast({ tone: "success", title: `Got ${res.data.claimed} ${kind === "initial" ? "texts" : "replies"}` });
    router.push(kind === "initial" ? `/texts/session?blastId=${blastId}` : `/texts/inbox?blastId=${blastId}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push("/")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold text-foreground">Text banks</h1>
          <p className="text-sm text-muted-foreground">Text voters one-to-one, from anywhere.</p>
        </div>
      </div>

      <TextingMenu />

      {loading && !banks ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <EmptyState title="Couldn't load text banks" description={error} />
      ) : !banks || banks.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No text banks yet"
          description="When your organiser opens a texting campaign, it shows up here."
        />
      ) : (
        banks.map((bank: TextBank) => (
          <section key={bank.campaignId} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <MessagesSquare className="h-4.5 w-4.5 text-primary" />
              {bank.name}
            </h2>
            {bank.blasts.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No message waves yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {bank.blasts.map((b) => (
                  <div key={b.id} className="rounded-xl border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-semibold text-foreground">{b.title}</p>
                      <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {b.availableToClaim} to send
                      </p>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={claiming !== null || (b.myAssignedUnsent === 0 && b.availableToClaim === 0)}
                        onClick={() =>
                          b.myAssignedUnsent > 0
                            ? router.push(`/texts/session?blastId=${b.id}`)
                            : void claim(b.id, "initial")
                        }
                      >
                        <Send className="h-4 w-4" />
                        {b.myAssignedUnsent > 0 ? `Send my ${b.myAssignedUnsent} texts` : "Get 10 texts"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5"
                        disabled={claiming !== null}
                        onClick={() => void claim(b.id, "replies")}
                      >
                        <Inbox className="h-4 w-4" />
                        Answer replies
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {bank.myUnreadConversations > 0 ? (
              <p className="mt-3 text-sm font-semibold text-primary">
                {bank.myUnreadConversations} unread {bank.myUnreadConversations === 1 ? "reply" : "replies"} waiting for
                you
              </p>
            ) : null}
          </section>
        ))
      )}
    </div>
  );
}

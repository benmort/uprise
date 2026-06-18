"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Rocket } from "lucide-react";
import { createCampaign } from "@/lib/api/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/canvass/section-card";
import { useToast } from "@/components/ui/toast";

export default function NewCampaignPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [doors, setDoors] = useState("");
  const [conversations, setConversations] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const goals: Record<string, number> = {};
    if (Number(doors) > 0) goals.doors = Number(doors);
    if (Number(conversations) > 0) goals.conversations = Number(conversations);
    const res = await createCampaign({
      name: name.trim(),
      status: "ACTIVE",
      goals: Object.keys(goals).length ? goals : null,
    });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create campaign", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Campaign created", description: "Now cut some turf." });
    router.push(`/canvass/${res.data.id}/turf`);
  }

  return (
    <div className="page-stack max-w-xl">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">New campaign</h1>
      </div>

      <SectionCard title="The basics">
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
          Campaign name
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring doorknock" />
      </SectionCard>

      <SectionCard title="Goals (optional)" description="Set targets to track pace later.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Doors</label>
            <Input value={doors} onChange={(e) => setDoors(e.target.value)} type="number" placeholder="5000" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Conversations</label>
            <Input
              value={conversations}
              onChange={(e) => setConversations(e.target.value)}
              type="number"
              placeholder="1200"
            />
          </div>
        </div>
      </SectionCard>

      <Button onClick={create} disabled={busy || !name.trim()}>
        <Rocket className="mr-1.5 h-4 w-4" />
        Create &amp; cut turf
      </Button>
    </div>
  );
}

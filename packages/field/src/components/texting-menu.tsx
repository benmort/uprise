"use client";

// The ALWAYS-VISIBLE campaign/text-blast menu across the texting screens. Everyone gets
// the bank overview; organisers/owners/super-admins additionally get live blast status
// and full blast control — start a wave from here, compose a new one in the admin app.
// Role comes from the session principal (/auth/check carries it for volunteers too).

import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Megaphone, Play } from "lucide-react";
import { request } from "@uprise/api-client";
import { Button, StatusBadge, useToast, cn } from "@uprise/ui";
import { getSession } from "../lib/session";
import { useTextBanks } from "../hooks/use-texting";

/** admin app origin from the field host (field.x.y → admin.x.y); localhost dev → :3000. */
function adminOrigin(): string {
  if (typeof window === "undefined") return "";
  const { protocol, hostname } = window.location;
  if (hostname === "localhost" || /^[0-9.]+$/.test(hostname)) return `${protocol}//localhost:3000`;
  const parts = hostname.split(".");
  parts[0] = "admin";
  return `${protocol}//${parts.join(".")}`;
}

export function TextingMenu() {
  const { showToast } = useToast();
  const [role, setRole] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const organiser = isSuperAdmin || role === "ORGANISER" || role === "OWNER";
  // Poll only while the organiser panel is open — volunteers never pay for this.
  const { data: banks, refetch } = useTextBanks(organiser && open);

  useEffect(() => {
    let alive = true;
    void getSession().then((s) => {
      if (!alive || !s) return;
      setRole(s.role ?? null);
      setIsSuperAdmin(Boolean(s.isSuperAdmin));
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!organiser) return null;

  const startBlast = async (blastId: string) => {
    setStarting(blastId);
    const res = await request<{ ok?: boolean }>(`/blasts/${encodeURIComponent(blastId)}/send`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setStarting(null);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't start the blast", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Blast started" });
    await refetch();
  };

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-sm font-bold text-foreground"
      >
        <Megaphone className="h-4 w-4 text-primary" />
        Campaign blasts
        <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-primary">Organiser</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open ? (
        <div className="mt-3 space-y-2.5">
          {(banks ?? []).flatMap((bank) =>
            bank.blasts.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{b.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{bank.name}</p>
                </div>
                {b.status ? <StatusBadge status={b.status} /> : null}
                {b.status && b.status !== "SENT" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={starting !== null}
                    onClick={() => void startBlast(b.id)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {starting === b.id ? "Starting…" : "Blast rest"}
                  </Button>
                ) : null}
              </div>
            )),
          )}
          {(banks ?? []).every((bank) => bank.blasts.length === 0) ? (
            <p className="text-sm text-muted-foreground">No blasts yet — compose one in the admin app.</p>
          ) : null}
          <a
            href={`${adminOrigin()}/channels/text`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
          >
            Compose a new blast
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}
    </section>
  );
}

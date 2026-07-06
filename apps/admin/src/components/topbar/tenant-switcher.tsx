"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Dropdown, useDropdownClose } from "@uprise/ui";
import { auth, orgProfile, tenants, type Membership, type TenantSearchRow } from "@uprise/api-client";
import { cn } from "@/lib/utils";
import { TenantAvatar } from "./tenant-avatar";
import { CreateTenantDialog } from "./create-tenant-dialog";

/**
 * Plan keys that may self-serve new tenants from the switcher. Mirrors the backend
 * TENANT_CREATE_PLANS (apps/api/src/tenants/tenants.service.ts) — UI gating is advisory;
 * the API enforces it. Super-admins bypass this.
 */
const TENANT_CREATE_PLANS_UI = ["starter", "growth", "scale"];

/** A row the dropdown can render + switch into (from a membership or an all-tenants search). */
type SwitchRow = { tenantId: string; tenantName: string; tenantSlug?: string; planName?: string | null };

function PlanPill({ plan }: { plan: string }) {
  const label = plan.charAt(0).toUpperCase() + plan.slice(1);
  const paid = TENANT_CREATE_PLANS_UI.includes(plan);
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none",
        paid ? "bg-primary/10 text-primary" : "bg-surface-variant text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

/**
 * Tenant switcher (Vercel-style) — the top-left brand element. Shows the current
 * tenant's gradient avatar + name + plan pill + a chevron; switches on click (reload)
 * and offers a gated "Create Tenant" action. `collapsed` renders the trigger avatar-only.
 *
 * Super-admins have no memberships, so for them the list is a live search across ALL
 * tenants (`tenants.search`) — they can pick any tenant and act as a user of it. The
 * pinned tenant they're impersonating (not in their memberships) comes in via
 * `activeTenant` so the trigger can label it.
 */
export function TenantSwitcher({
  memberships,
  currentTenantId,
  isSuperAdmin = false,
  activeTenant = null,
  collapsed = false,
  onSlideChange,
}: {
  memberships: Membership[];
  currentTenantId: string | null;
  isSuperAdmin?: boolean;
  activeTenant?: { id: string; name: string; slug: string } | null;
  collapsed?: boolean;
  /** Reports how far (px) the top-bar's left group should slide right so the
   *  hover-unfurled full-name pill doesn't cover it. 0 when not expanded. */
  onSlideChange?: (px: number) => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [allTenants, setAllTenants] = useState<TenantSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  // The current session tenant's uploaded block logo, shown as the top-left brand
  // mark. `/org-profile` is session-tenant-scoped, and switching reloads the page,
  // so this always reflects whichever tenant the session is on (null → gradient).
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void orgProfile.get().then((res) => {
      if (active && res.ok) setLogoUrl(res.data.logoBlockUrl);
    });
    return () => {
      active = false;
    };
  }, []);

  const current = memberships.find((m) => m.tenantId === currentTenantId) ?? memberships[0];
  // Label/avatar fall back to the impersonated tenant (super-admin, no membership).
  const currentName = current?.tenantName ?? activeTenant?.name ?? "Select tenant";
  const seedId = current?.tenantId ?? activeTenant?.id ?? currentTenantId ?? "uprise";

  // ── Name unfurl ──────────────────────────────────────────────────────────
  // On hover / keyboard-focus, reveal the FULL tenant name in a floating pill that
  // overflows the sidebar over the top-bar (portalled, so the sidebar's overflow
  // clip doesn't apply — same trick as the dropdown). We report how far the
  // top-bar's hamburger+search should slide right to clear it; layout applies the
  // slide. Desktop only; the pill is pointer-events-none so clicks fall through to
  // the trigger and the switcher dropdown is unaffected.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const pointerDownRef = useRef(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = hovered || focused;
  const isDesktop = () => typeof window !== "undefined" && window.innerWidth >= 1024;
  const captureRect = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect(r);
  };
  const onTriggerEnter = () => {
    if (!isDesktop()) return;
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    captureRect();
    setHovered(true);
  };
  const onTriggerLeave = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => setHovered(false), 80);
  };
  // Reveal on focus for keyboard only — a pointer-driven focus (click to open the
  // dropdown) is already covered by hover and must not leave the pill stuck open.
  const onTriggerFocus = () => {
    if (!isDesktop() || pointerDownRef.current) return;
    captureRect();
    setFocused(true);
  };
  const onTriggerBlur = () => {
    setFocused(false);
    pointerDownRef.current = false;
  };

  // Slide = how much wider the full-name pill is than the truncated trigger.
  useEffect(() => {
    if (!expanded || !pillRef.current || !triggerRef.current) {
      onSlideChange?.(0);
      return;
    }
    const extra = Math.max(0, pillRef.current.offsetWidth - triggerRef.current.offsetWidth + 8);
    onSlideChange?.(extra);
  }, [expanded, currentName, onSlideChange]);

  // Never leave the top-bar slid if we unmount mid-hover (e.g. tenant switch reload).
  useEffect(() => () => onSlideChange?.(0), [onSlideChange]);

  const canCreate =
    isSuperAdmin ||
    (current?.role === "OWNER" && TENANT_CREATE_PLANS_UI.includes(current?.planName ?? ""));

  // Super-admin: debounced search across ALL tenants (empty query → first 50).
  useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void tenants.search(query.trim() || undefined).then((res) => {
        if (!active) return;
        if (res.ok) setAllTenants(res.data);
        setSearching(false);
      });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isSuperAdmin, query]);

  // Ordinary users: filter their own memberships client-side.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? memberships.filter((m) => m.tenantName.toLowerCase().includes(q)) : memberships;
  }, [memberships, query]);

  const rows: SwitchRow[] = isSuperAdmin
    ? allTenants.map((t) => ({ tenantId: t.id, tenantName: t.name, tenantSlug: t.slug }))
    : filtered.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenantName,
        tenantSlug: m.tenantSlug,
        planName: m.planName,
      }));

  const switchTo = async (tenantId: string) => {
    if (switching || tenantId === currentTenantId) return;
    setSwitching(true);
    const res = await auth.selectTenant(tenantId);
    if (res.ok) {
      window.location.reload();
      return;
    }
    setSwitching(false);
  };

  return (
    <>
      <Dropdown
        align="start"
        // Portal out: the switcher lives in the scrolling sidebar (overflow + transform),
        // which would clip/trap the menu — portalling lets it float over the page.
        portal
        className="w-full"
        contentClassName="w-80 p-0 overflow-hidden"
        trigger={({ toggle }) => (
          <button
            ref={triggerRef}
            type="button"
            onClick={toggle}
            onMouseEnter={onTriggerEnter}
            onMouseLeave={onTriggerLeave}
            onMouseDown={() => {
              pointerDownRef.current = true;
            }}
            onFocus={onTriggerFocus}
            onBlur={onTriggerBlur}
            title={currentName}
            aria-label="Switch tenant"
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-surface-variant",
              collapsed && "lg:justify-center lg:px-1",
            )}
          >
            <TenantAvatar tenantId={seedId} logoUrl={logoUrl} name={currentName} className="h-7 w-7" />
            <span className={cn("flex min-w-0 flex-1 items-center gap-2", collapsed && "lg:hidden")}>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {currentName}
              </span>
              {current?.planName ? <PlanPill plan={current.planName} /> : null}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                <ChevronsUpDown className="h-4 w-4" />
              </span>
            </span>
          </button>
        )}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isSuperAdmin ? "Search all tenants…" : "Find Tenant…"}
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Tenant list */}
        <div className="max-h-72 overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {isSuperAdmin && searching ? "Searching…" : "No tenants found"}
            </p>
          ) : (
            rows.map((r) => {
              const active = r.tenantId === currentTenantId;
              return (
                <button
                  key={r.tenantId}
                  type="button"
                  disabled={switching}
                  onClick={() => void switchTo(r.tenantId)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-variant disabled:opacity-60"
                >
                  <TenantAvatar tenantId={r.tenantId} className="h-7 w-7" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{r.tenantName}</span>
                    {isSuperAdmin && r.tenantSlug ? (
                      <span className="block truncate text-xs text-muted-foreground">{r.tenantSlug}</span>
                    ) : null}
                  </span>
                  {r.planName ? <PlanPill plan={r.planName} /> : null}
                  {active ? <Check className="h-4 w-4 shrink-0 text-success" /> : null}
                </button>
              );
            })
          )}
        </div>

        {/* Create tenant (gated) */}
        {canCreate ? <CreateFooter onCreate={() => setDialogOpen(true)} /> : null}
      </Dropdown>

      <CreateTenantDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      {/* Hover/focus unfurl: the full name floating over the top-bar. Portalled to
          escape the sidebar's overflow clip; pointer-events-none so the trigger
          underneath stays clickable. Mirrors the trigger's layout for alignment. */}
      {expanded && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={pillRef}
              aria-hidden
              style={{ position: "fixed", top: rect.top, left: rect.left, minWidth: rect.width }}
              className="pointer-events-none z-[60] flex w-max max-w-[340px] origin-left animate-pop-in items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-theme-lg motion-reduce:animate-none"
            >
              <TenantAvatar tenantId={seedId} logoUrl={logoUrl} name={currentName} className="h-7 w-7" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{currentName}</span>
              {current?.planName ? <PlanPill plan={current.planName} /> : null}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                <ChevronsUpDown className="h-4 w-4" />
              </span>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Footer row; closes the dropdown then opens the create dialog. */
function CreateFooter({ onCreate }: { onCreate: () => void }) {
  const close = useDropdownClose();
  return (
    <button
      type="button"
      onClick={() => {
        close();
        onCreate();
      }}
      className="flex w-full items-center gap-3 border-t border-border px-3 py-3 text-left transition-colors hover:bg-surface-variant"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground">
        <Plus className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">Create Tenant</span>
        <span className="block truncate text-xs text-muted-foreground">
          Collaborate with others in a shared workspace
        </span>
      </span>
    </button>
  );
}

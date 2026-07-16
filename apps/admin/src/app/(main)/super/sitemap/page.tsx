"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ExternalLink, LayoutGrid, ListTree, Network } from "lucide-react";
import type { AuthPrincipal } from "@uprise/api-client";
import { Spinner } from "@uprise/ui";
import { getSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, KpiTile } from "@uprise/field";
import { cn } from "@/lib/utils";
import { liveOrigin, routeHref, sitemap, type SitemapApp, type SitemapRoute } from "@/lib/sitemap";
import { concretePath, resolverFor, type ResolvedInstance } from "@/lib/sitemap-resolvers";

type View = "tree" | "flat";
type Resolution = { items?: ResolvedInstance[]; loading: boolean };
type ResCtx = {
  state: (prefix: string) => Resolution;
  ensure: (prefix: string, resolve: () => Promise<ResolvedInstance[]>) => void;
};

// Lazily resolve dynamic-route instances, cached per prefix, shared across the page.
function useResolution(): ResCtx {
  const cache = useRef(new Map<string, ResolvedInstance[]>());
  const inflight = useRef(new Set<string>());
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const ensure = useCallback((prefix: string, resolve: () => Promise<ResolvedInstance[]>) => {
    if (cache.current.has(prefix) || inflight.current.has(prefix)) return;
    inflight.current.add(prefix);
    rerender();
    resolve()
      .then((items) => cache.current.set(prefix, items))
      .catch(() => cache.current.set(prefix, []))
      .finally(() => {
        inflight.current.delete(prefix);
        rerender();
      });
  }, []);
  const state = useCallback(
    (prefix: string): Resolution => ({ items: cache.current.get(prefix), loading: inflight.current.has(prefix) }),
    [],
  );
  return { state, ensure };
}

// ── Path rendering: highlight dynamic [segments] ──────────────────────────────
function RoutePath({ path, className }: { path: string; className?: string }) {
  const segs = path === "/" ? [] : path.slice(1).split("/");
  return (
    <span className={cn("font-mono text-sm", className)}>
      {path === "/" ? (
        <span className="text-muted-foreground">/</span>
      ) : (
        segs.map((s, i) => (
          <span key={i}>
            <span className="text-muted-foreground">/</span>
            <span className={s.startsWith("[") ? "font-semibold text-primary" : "text-foreground"}>{s}</span>
          </span>
        ))
      )}
    </span>
  );
}

function OpenLink({ href }: { href: string | null }) {
  if (!href) return <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">dynamic</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
      aria-label={`Open ${href}`}
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

// ── Tree model ────────────────────────────────────────────────────────────────
type TreeNode = { seg: string; path: string; route?: SitemapRoute; children: TreeNode[] };

function buildTree(routes: SitemapRoute[]): TreeNode {
  const root: TreeNode = { seg: "", path: "/", children: [] };
  for (const r of routes) {
    if (r.path === "/") {
      root.route = r;
      continue;
    }
    let node = root;
    let acc = "";
    for (const seg of r.path.slice(1).split("/")) {
      acc += `/${seg}`;
      let child = node.children.find((c) => c.seg === seg);
      if (!child) {
        child = { seg, path: acc, children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.route = r;
  }
  return root;
}

function TreeRow({ node, app, depth, forceOpen, res }: { node: TreeNode; app: SitemapApp; depth: number; forceOpen: boolean; res: ResCtx }) {
  const hasChildren = node.children.length > 0;
  // A dynamic leaf whose pattern maps to a list endpoint → expandable to real instances.
  const resolver = !hasChildren && node.route?.dynamic ? resolverFor(node.route.path) : null;
  const expandable = hasChildren || !!resolver;
  const [open, setOpen] = useState(depth < 1);
  const expanded = expandable && (forceOpen || open);
  const pad = { paddingLeft: `${depth * 16 + 8}px` };

  useEffect(() => {
    if (expanded && resolver) res.ensure(resolver.prefix, resolver.resolve);
  }, [expanded, resolver, res]);

  const resolution = resolver ? res.state(resolver.prefix) : null;

  return (
    <div>
      <div
        className={cn("flex items-center gap-2 rounded-lg py-1.5 pr-2 transition-colors", expandable && "cursor-pointer hover:bg-surface-variant")}
        style={pad}
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
      >
        {expandable ? (
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        ) : (
          <span className="mx-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {node.route ? <RoutePath path={node.route.path} /> : <span className="font-mono text-sm text-muted-foreground">/{node.seg}</span>}
        </span>
        {node.route ? (
          <>
            {resolver && resolution?.items ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary dark:bg-primary/20">
                {resolution.items.length}
              </span>
            ) : null}
            {node.route.group ? (
              <span className="shrink-0 rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{node.route.group}</span>
            ) : null}
            <OpenLink href={routeHref(app, node.route)} />
          </>
        ) : null}
      </div>

      {hasChildren && expanded ? (
        <div className="ml-[15px] border-l border-border">
          {node.children.map((c) => (
            <TreeRow key={c.path} node={c} app={app} depth={depth + 1} forceOpen={forceOpen} res={res} />
          ))}
        </div>
      ) : null}

      {resolver && expanded && node.route ? (
        <div className="ml-[15px] border-l border-border">
          {resolution?.loading && !resolution.items ? (
            <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              <Spinner className="h-3.5 w-3.5" /> Loading instances…
            </div>
          ) : resolution?.items && resolution.items.length > 0 ? (
            resolution.items.map((inst) => {
              const path = concretePath(node.route!.path, inst.id);
              return (
                <div key={inst.id} className="flex items-center gap-2 py-1 pr-2" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
                  <span className="mx-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="text-foreground">{inst.label}</span>
                    <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{path}</span>
                  </span>
                  <OpenLink href={`${liveOrigin(app.key, app.prodUrl)}${path}`} />
                </div>
              );
            })
          ) : (
            <div className="py-1.5 text-xs text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              No instances in this workspace.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AppSection({ app, query, view, res }: { app: SitemapApp; query: string; view: View; res: ResCtx }) {
  const q = query.trim().toLowerCase();
  const routes = useMemo(() => (q ? app.routes.filter((r) => r.path.toLowerCase().includes(q)) : app.routes), [app.routes, q]);
  const tree = useMemo(() => buildTree(routes), [routes]);
  if (routes.length === 0) return null;
  const origin = liveOrigin(app.key, app.prodUrl);

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {app.label}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary dark:bg-primary/20">
            {routes.length}
            {q ? ` / ${app.routeCount}` : ""}
          </span>
        </span>
      }
      description={origin.replace(/^https?:\/\//, "")}
      action={
        <a href={origin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Open app <ExternalLink className="h-3.5 w-3.5" />
        </a>
      }
    >
      {view === "tree" ? (
        <div className="space-y-0.5">
          {(tree.route ? [tree] : tree.children).map((n) => (
            <TreeRow key={n.path} node={n} app={app} depth={0} forceOpen={!!q} res={res} />
          ))}
        </div>
      ) : (
        <div className="space-y-0.5">
          {routes.map((r) => (
            <div key={r.path} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-variant">
              <RoutePath path={r.path} className="min-w-0 flex-1 truncate" />
              {r.group ? <span className="shrink-0 rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{r.group}</span> : null}
              <OpenLink href={routeHref(app, r)} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export default function SitemapPage() {
  // Static route data + super-admin-only, so guard client-side (no API enforces it).
  const [principal, setPrincipal] = useState<AuthPrincipal | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("tree");
  const res = useResolution();

  useEffect(() => {
    void getSession().then((p) => setPrincipal(p ?? null));
  }, []);

  const totals = useMemo(() => {
    const routes = sitemap.apps.reduce((n, a) => n + a.routeCount, 0);
    const dynamic = sitemap.apps.reduce((n, a) => n + a.routes.filter((r) => r.dynamic).length, 0);
    return { apps: sitemap.apps.length, routes, dynamic };
  }, []);

  const q = query.trim().toLowerCase();
  const noMatch = q.length > 0 && sitemap.apps.every((a) => !a.routes.some((r) => r.path.toLowerCase().includes(q)));

  return (
    <div className="page-stack">
      <PageHeader
        title="Sitemap"
        icon={Network}
        description="Every page across all frontend apps."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Super Admin" }, { label: "Sitemap" }]}
      />

      {principal === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : !principal?.isSuperAdmin ? (
        <EmptyState title="Super admins only" description="The sitemap is a platform-operator view of every app's routes." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiTile label="Apps" value={totals.apps} />
            <KpiTile label="Routes" value={totals.routes} />
            <KpiTile label="Dynamic routes" value={totals.dynamic} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchInput value={query} onValueChange={setQuery} placeholder="Search routes across all apps…" wrapperClassName="w-full max-w-md" />
            <SegmentedControl<View>
              value={view}
              onChange={setView}
              size="sm"
              aria-label="View"
              options={[
                { value: "tree", label: "Tree", icon: <ListTree className="h-3.5 w-3.5" /> },
                { value: "flat", label: "Flat", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
              ]}
            />
          </div>

          <div className="space-y-4">
            {sitemap.apps.map((app) => (
              <AppSection key={app.key} app={app} query={query} view={view} res={res} />
            ))}
            {noMatch ? <EmptyState title="No routes match" description={`Nothing matches “${query}”.`} /> : null}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

// Integrations management (connect / test / disconnect / remove external sources).
// Extracted from the standalone /settings/integrations page so it can render both
// there and as the "Integrations" tab in General settings (tenant-settings). Owns
// its own title + Connect button; the standalone page just adds a back link above.
import { useState } from "react";
import { Plug, PlusCircle, Webhook } from "lucide-react";
import {
  deleteIntegrationConnection,
  listIntegrationConnections,
  setIntegrationConnectionStatus,
  testIntegrationConnection,
  upsertIntegrationConnection,
  type IntegrationConnectionRow,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { useToast } from "@/components/ui/toast";
import { Button, ConfirmDialog, Field, FormDialog, FormSelect, Input, StatusBadge } from "@uprise/ui";
import { SectionCard } from "@uprise/field";

type ConnectionType = "ACTION_NETWORK" | "INTERNAL";

const PROVIDER_LABEL: Record<string, string> = {
  ACTION_NETWORK: "Action Network",
  INTERNAL: "Internal source",
};

const TYPE_OPTIONS: { value: ConnectionType; label: string }[] = [
  { value: "ACTION_NETWORK", label: "Action Network" },
  { value: "INTERNAL", label: "Internal source" },
];

export function IntegrationsSettings() {
  const { showToast } = useToast();
  const { data, loading, error, noPermission, refetch } = useApi(
    "/integrations/connections",
    () => listIntegrationConnections(),
    { ttlMs: 30_000 },
  );

  // ── Connect / update dialog ──
  const [connectOpen, setConnectOpen] = useState(false);
  const [type, setType] = useState<ConnectionType>("ACTION_NETWORK");
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail?: string } | null>(null);

  // ── Per-connection actions ──
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<IntegrationConnectionRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const rows = data ?? [];
  const needsBaseUrl = type === "INTERNAL";
  // Action Network issues one API key per group, so connections are keyed per
  // (type, group) — a new group is a CREATE even when another group is connected.
  const groupKey = type === "ACTION_NETWORK" ? group.trim() : "";
  // Connecting a (type, group) the tenant has no row for is a CREATE, and a create needs
  // a key. A blank key used to be accepted and silently substituted with the platform env
  // key, which connected the tenant to whichever organisation owned that key — and
  // reported success. Blank still means "keep the stored key", but only when there IS one.
  const isUpdate = rows.some((c) => c.type === type && (c.group ?? "") === groupKey);
  const needsApiKey = !isUpdate;
  const canSubmit =
    name.trim().length > 0 &&
    (!needsBaseUrl || baseUrl.trim().length > 0) &&
    (!needsApiKey || apiKey.trim().length > 0);

  function openConnect() {
    setType("ACTION_NETWORK");
    setName("");
    setGroup("");
    setApiKey("");
    setBaseUrl("");
    setTestResult(null);
    setConnectOpen(true);
  }

  async function doTest() {
    setTesting(true);
    setTestResult(null);
    const res = await testIntegrationConnection({
      type,
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
    });
    setTesting(false);
    if (!res.ok) {
      setTestResult({ ok: false, detail: res.error });
      return;
    }
    setTestResult(res.data);
  }

  async function doConnect() {
    if (!canSubmit) return;
    setSaving(true);
    const res = await upsertIntegrationConnection({
      type,
      name: name.trim(),
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      group: groupKey || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save connection", description: res.error });
      return;
    }
    showToast({
      tone: "success",
      title: "Connection saved",
      description: `${PROVIDER_LABEL[type] ?? type} is now connected.`,
    });
    setConnectOpen(false);
    void refetch();
  }

  async function doSetStatus(row: IntegrationConnectionRow, status: "ACTIVE" | "INACTIVE") {
    setBusyId(row.id);
    const res = await setIntegrationConnectionStatus(row.id, status);
    setBusyId(null);
    if (!res.ok) {
      showToast({
        tone: "error",
        title: status === "ACTIVE" ? "Couldn't reconnect" : "Couldn't disconnect",
        description: res.error,
      });
      return;
    }
    showToast({
      tone: status === "ACTIVE" ? "success" : "info",
      title: status === "ACTIVE" ? "Reconnected" : "Disconnected",
      description: `${row.name} is now ${status === "ACTIVE" ? "active" : "inactive"}.`,
    });
    void refetch();
  }

  async function doRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    const res = await deleteIntegrationConnection(removing.id);
    setRemoveBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't remove connection", description: res.error });
      return;
    }
    showToast({ tone: "info", title: "Connection removed", description: `${removing.name} has been removed.` });
    setRemoving(null);
    void refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Integrations</h3>
          {!noPermission ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Connect Action Network or an internal source with your own API key. Action Network keys are
              scoped per group, so connect one per group you administer – reconnecting the same type and group
              updates it. Only accounts you connect here are available to import from.
            </p>
          ) : null}
        </div>
        {!noPermission ? (
          <Button className="shrink-0" onClick={openConnect}>
            <PlusCircle className="mr-1 h-4 w-4" />
            Connect
          </Button>
        ) : null}
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        empty={rows.length === 0}
        emptyTitle="No connections yet"
        emptyDescription="Use Connect to link Action Network or an internal source."
        errorTitle="Can't load integrations"
        onRetry={() => void refetch()}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((c) => (
            <SectionCard key={c.id}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20 text-primary">
                  <Plug className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {PROVIDER_LABEL[c.type] ?? c.type}
                    {c.group ? ` · ${c.group}` : ""}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                <Webhook className="h-3.5 w-3.5" />
                Updated {new Date(c.updatedAt).toLocaleDateString()}
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {c.status === "ACTIVE" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => void doSetStatus(c, "INACTIVE")}
                  >
                    {busyId === c.id ? "Working…" : "Disconnect"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => void doSetStatus(c, "ACTIVE")}
                  >
                    {busyId === c.id ? "Working…" : "Reconnect"}
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => setRemoving(c)}>
                  Remove
                </Button>
              </div>
            </SectionCard>
          ))}
        </div>
      </StateRegion>

      {/* ── Connect / update dialog ──────────────────────────────── */}
      <FormDialog
        open={connectOpen}
        title="Connect an integration"
        description="Reconnecting an existing type updates its stored settings. Leave the API key blank to keep the saved one – a new connection needs its own key."
        onClose={() => setConnectOpen(false)}
        onSubmit={() => void doConnect()}
        submitLabel="Connect"
        busy={saving}
        submitDisabled={!canSubmit}
      >
        <Field label="Type" htmlFor="connection-type">
          <FormSelect
            id="connection-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ConnectionType);
              setTestResult(null);
            }}
            options={TYPE_OPTIONS}
            placeholder="Select a type"
            disabled={saving}
          />
        </Field>
        <Field label="Name" htmlFor="connection-name">
          <Input
            id="connection-name"
            placeholder="e.g. Main Action Network"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </Field>
        {type === "ACTION_NETWORK" ? (
          <Field
            label="Group (optional)"
            htmlFor="connection-group"
            hint="Action Network issues one API key per group. Name the group this key belongs to — each group you connect becomes its own selectable source."
          >
            <Input
              id="connection-group"
              placeholder="e.g. GetUp Victoria"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              disabled={saving}
            />
          </Field>
        ) : null}
        <Field
          label={needsApiKey ? "API key" : "API key (optional)"}
          htmlFor="connection-api-key"
          hint={
            needsApiKey
              ? "Required – this is your organisation's own key."
              : "Blank keeps the stored key."
          }
        >
          <Input
            id="connection-api-key"
            type="password"
            placeholder="Paste the API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={saving}
          />
        </Field>
        <Field
          label={needsBaseUrl ? "Base URL" : "Base URL (optional)"}
          htmlFor="connection-base-url"
          hint={needsBaseUrl ? "Required for an internal source." : undefined}
        >
          <Input
            id="connection-base-url"
            placeholder="https://…"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            disabled={saving}
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => void doTest()} disabled={testing || saving}>
            {testing ? "Testing…" : "Test"}
          </Button>
          {testResult ? (
            <span className={`text-sm ${testResult.ok ? "text-success" : "text-error"}`}>
              {testResult.ok ? "Connection OK" : "Connection failed"}
              {testResult.detail ? ` – ${testResult.detail}` : ""}
            </span>
          ) : null}
        </div>
      </FormDialog>

      {/* ── Remove confirmation ──────────────────────────────────── */}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove connection"
        description={
          removing
            ? `Remove ${removing.name}? Audiences that sync through it will stop syncing until you reconnect.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => void doRemove()}
        onCancel={() => setRemoving(null)}
        busy={removeBusy}
      />
    </div>
  );
}

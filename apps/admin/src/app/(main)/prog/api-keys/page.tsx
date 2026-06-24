"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import {
  issueApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeySummary,
  type IssuedApiKey,
} from "@/lib/api/api-keys";

const card = "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

function isPermissionError(msg: string) {
  return /forbidden|permission|not allowed|403/i.test(msg);
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    const res = await listApiKeys();
    if (res.ok) {
      setKeys(res.data);
    } else if (isPermissionError(res.error)) {
      setDenied(true);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    const res = await issueApiKey(name.trim());
    setCreating(false);
    if (!res.ok) {
      setCreateError(res.error);
      return;
    }
    setIssued(res.data);
    setName("");
    setKeys((prev) => [{ ...res.data }, ...prev]);
  }

  async function onRevoke(id: string) {
    if (revoking) return;
    if (typeof window !== "undefined" && !window.confirm("Revoke this API key? Any client using it will stop working immediately.")) {
      return;
    }
    setRevoking(id);
    const res = await revokeApiKey(id);
    setRevoking(null);
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } else {
      setError(res.error);
    }
  }

  async function copyKey() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the key is visible to copy manually */
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">API Keys</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Issue and revoke keys for programmatic access to your workspace.
        </p>
      </div>

      {/* One-time reveal of a freshly issued key */}
      {issued ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
            <KeyRound className="h-4 w-4" /> Copy your new key now — it won&apos;t be shown again.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-lg bg-white px-3 py-2 text-sm text-gray-900 dark:bg-gray-900 dark:text-gray-100">
              {issued.key}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setIssued(null)}
              className="text-sm text-emerald-800 underline dark:text-emerald-300"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {/* Create */}
      <div className={card}>
        <form onSubmit={onCreate} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="key-name" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Key name
            </label>
            <input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI deploy bot"
              maxLength={120}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create key
          </button>
        </form>
        {createError ? (
          <p className="px-5 pb-4 text-sm text-red-600 dark:text-red-400">{createError}</p>
        ) : null}
      </div>

      {/* List + feedback states */}
      {denied ? (
        <div className={`${card} flex flex-col items-center justify-center px-6 py-16 text-center`}>
          <ShieldAlert className="mb-3 h-8 w-8 text-gray-400" />
          <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">No access</h3>
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            You don&apos;t have permission to manage API keys. Ask a workspace owner or admin.
          </p>
        </div>
      ) : loading ? (
        <div className={`${card} flex items-center justify-center gap-2 px-6 py-16 text-gray-500 dark:text-gray-400`}>
          <Loader2 className="h-5 w-5 animate-spin" /> Loading keys…
        </div>
      ) : error ? (
        <div className={`${card} px-6 py-10 text-center`}>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-primary underline">
            Try again
          </button>
        </div>
      ) : keys.length === 0 ? (
        <div className={`${card} flex flex-col items-center justify-center px-6 py-16 text-center`}>
          <KeyRound className="mb-3 h-8 w-8 text-gray-400" />
          <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">No API keys yet</h3>
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Create your first key above to start making authenticated requests.
          </p>
        </div>
      ) : (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Key</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800/60">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{k.name}</td>
                    <td className="px-5 py-3 font-mono text-gray-600 dark:text-gray-400">{k.prefix}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                      {new Date(k.createdAt).toLocaleDateString("en-AU")}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void onRevoke(k.id)}
                        disabled={revoking === k.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-red-900/20"
                      >
                        {revoking === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

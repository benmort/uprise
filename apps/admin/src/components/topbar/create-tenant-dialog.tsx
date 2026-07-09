"use client";

import { useMemo, useState } from "react";
import { FormDialog, Field, Input } from "@uprise/ui";
import { auth, tenants } from "@uprise/api-client";

/** name → slug: lowercase, hyphenate runs of non-alphanumerics, trim hyphens, cap at 64. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Light normaliser for the subdomain field while typing — keeps it valid (lowercase,
 *  alphanumerics + hyphens) WITHOUT trimming a trailing hyphen mid-word so "acme-corp"
 *  is typeable. The final value is slugify()'d on submit. */
function normaliseSubdomainInput(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 64);
}

/** The tenant's address suffix, derived from the admin host (admin.dev.uprise.org.au →
 *  dev.uprise.org.au); falls back to uprise.org.au off-domain (localhost). */
function useBaseDomain(): string {
  return useMemo(() => {
    if (typeof window === "undefined") return "uprise.org.au";
    const host = window.location.hostname;
    if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return "uprise.org.au";
    const parts = host.split(".");
    return parts.length > 2 ? parts.slice(1).join(".") : host;
  }, []);
}

/**
 * Create-tenant modal launched from the tenant switcher. Takes a name and an editable
 * subdomain (defaults from the name until edited), checks availability, then creates the
 * tenant (API enforces the plan/role gate). Default behaviour switches into the new tenant
 * and reloads (switcher use); pass `onCreated` to instead stay put and let the caller
 * refresh in place (the tenants management page). Visibility is gated by the caller.
 */
export function CreateTenantDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (tenant: { id: string; slug: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  // Once the user edits the subdomain we stop mirroring it from the name.
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseDomain = useBaseDomain();
  // The value that actually gets created/checked (edge hyphens trimmed).
  const slug = useMemo(() => slugify(subdomain), [subdomain]);

  const reset = () => {
    setName("");
    setSubdomain("");
    setSubdomainTouched(false);
    setError(null);
  };

  const onNameChange = (value: string) => {
    setName(value);
    // Mirror name → subdomain until the user takes control of it.
    if (!subdomainTouched) setSubdomain(slugify(value));
  };

  const onSubdomainChange = (value: string) => {
    setSubdomain(normaliseSubdomainInput(value));
    setSubdomainTouched(true);
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Enter a workspace name.");
      return;
    }
    if (!slug) {
      setError("Enter a subdomain (letters, numbers and hyphens).");
      return;
    }
    setBusy(true);
    const avail = await tenants.checkAvailability(slug);
    if (avail.ok && !avail.data.available) {
      setBusy(false);
      setError(`The subdomain "${slug}" is already taken — choose another.`);
      return;
    }
    const res = await tenants.createSelfServe({ name: name.trim(), slug });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    // Management page: stay put and refresh the list. Switcher: switch into the
    // new tenant + reload so every surface re-resolves under it.
    if (onCreated) {
      setBusy(false);
      reset();
      onCreated(res.data);
      return;
    }
    await auth.selectTenant(res.data.id);
    window.location.reload();
  };

  return (
    <FormDialog
      open={open}
      title="Create workspace"
      description="Spin up a new workspace. You'll be its owner."
      onClose={() => {
        if (busy) return;
        reset();
        onClose();
      }}
      onSubmit={submit}
      submitLabel="Create workspace"
      busy={busy}
      submitDisabled={!name.trim() || !slug}
      size="sm"
    >
      <Field label="Workspace name" htmlFor="create-tenant-name" hint="Letters, numbers and spaces.">
        <Input
          id="create-tenant-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Uprise Labs"
          autoFocus
          maxLength={200}
        />
      </Field>
      <Field
        label="Subdomain"
        htmlFor="create-tenant-subdomain"
        error={error ?? undefined}
        hint={slug ? `${slug}.${baseDomain}` : "Your workspace address. Can't be changed later."}
      >
        <Input
          id="create-tenant-subdomain"
          value={subdomain}
          onChange={(e) => onSubdomainChange(e.target.value)}
          placeholder="uprise-labs"
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </FormDialog>
  );
}

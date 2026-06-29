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

/**
 * Create-tenant modal launched from the tenant switcher. Derives a slug from the
 * name, checks availability, then creates the tenant (API enforces the plan/role
 * gate). Default behaviour switches into the new tenant and reloads (switcher use);
 * pass `onCreated` to instead stay put and let the caller refresh in place (the
 * tenants management page). Visibility is gated by the caller (`canCreate`).
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = useMemo(() => slugify(name), [name]);

  const submit = async () => {
    setError(null);
    if (!slug) {
      setError("Enter a name with at least one letter or number.");
      return;
    }
    setBusy(true);
    const avail = await tenants.checkAvailability(slug);
    if (avail.ok && !avail.data.available) {
      setBusy(false);
      setError(`The address "${slug}" is already taken — try a different name.`);
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
      setName("");
      onCreated(res.data);
      return;
    }
    await auth.selectTenant(res.data.id);
    window.location.reload();
  };

  return (
    <FormDialog
      open={open}
      title="Create tenant"
      description="Spin up a new workspace. You'll be its owner."
      onClose={() => {
        if (busy) return;
        setName("");
        setError(null);
        onClose();
      }}
      onSubmit={submit}
      submitLabel="Create tenant"
      busy={busy}
      submitDisabled={!slug}
      size="sm"
    >
      <Field
        label="Tenant name"
        htmlFor="create-tenant-name"
        error={error ?? undefined}
        hint={slug ? `Address: ${slug}` : "Letters, numbers and spaces."}
      >
        <Input
          id="create-tenant-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Campaign"
          autoFocus
          maxLength={200}
        />
      </Field>
    </FormDialog>
  );
}

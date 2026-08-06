"use client";

import { useState } from "react";
import { FormDialog } from "@uprise/ui";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { testIntegrationConnection, upsertIntegrationConnection } from "@/lib/api";
import {
  nationBaseUrl,
  normaliseNationSlug,
  validateNationConnect,
  type NationConnectErrors,
} from "@/lib/nation-builder-connect";

/**
 * The guided NationBuilder connect — two fields, no provider picker, no "group" jargon.
 * Connect = test-then-save in one action: the token is proven against the nation before
 * anything is stored, so an organiser never ends up with a saved-but-broken connection.
 * Settings → Integrations remains the canonical store (and the advanced form for
 * white-label domains); this dialog just writes the same connection from the Data sync
 * surface, where a first-run organiser actually is.
 */
export function ConnectNationBuilderDialog({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires after a successful save with the connected nation's slug. */
  onConnected: (slug: string) => void;
}) {
  const { showToast } = useToast();
  const [slugInput, setSlugInput] = useState("");
  const [token, setToken] = useState("");
  const [errors, setErrors] = useState<NationConnectErrors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setSlugInput("");
    setToken("");
    setErrors({});
    setFailure("");
  };

  const submit = async () => {
    const fieldErrors = validateNationConnect({ slug: slugInput, token });
    setErrors(fieldErrors);
    setFailure("");
    if (fieldErrors.slug || fieldErrors.token) return;
    const slug = normaliseNationSlug(slugInput);
    const baseUrl = nationBaseUrl(slug);
    setBusy(true);
    try {
      // Prove the token against the nation FIRST — nothing is stored on failure.
      // Two layers of ok: the transport result AND the provider check inside it.
      const tested = await testIntegrationConnection({
        type: "NATION_BUILDER",
        apiKey: token.trim(),
        baseUrl,
      });
      if (!tested.ok || !tested.data?.ok) {
        setFailure(
          `We couldn't reach ${slug}.nationbuilder.com with that token – check it was copied in full and hasn't been revoked.`,
        );
        return;
      }
      const saved = await upsertIntegrationConnection({
        type: "NATION_BUILDER",
        name: slug,
        apiKey: token.trim(),
        group: slug,
        baseUrl,
      });
      if (!saved.ok) {
        setFailure(saved.error);
        return;
      }
      showToast({ tone: "success", title: "NationBuilder connected", description: `Nation: ${slug}` });
      reset();
      onConnected(slug);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      title="Connect NationBuilder"
      description="Takes about two minutes. You'll need to be an admin of your nation."
      onClose={() => {
        reset();
        onClose();
      }}
      onSubmit={() => void submit()}
      submitLabel={busy ? "Connecting…" : "Connect"}
      busy={busy}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nation address</span>
          <div className="flex items-center gap-2">
            <Input
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
              placeholder="castle-hill"
              aria-label="Nation address"
              autoFocus
            />
            <span className="shrink-0 text-sm text-muted-foreground">.nationbuilder.com</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Your nation's web address – paste the full address and we'll trim it for you.
          </p>
          {errors.slug && <p className="mt-1 text-xs text-error">{errors.slug}</p>}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">API token</span>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your API token"
            aria-label="API token"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            In your nation's control panel, open Settings → Developer → API token and copy the
            token. uprise stores it securely and only your organisation can use it.
          </p>
          {errors.token && <p className="mt-1 text-xs text-error">{errors.token}</p>}
        </label>

        {failure && <p className="text-sm text-error">{failure}</p>}
      </div>
    </FormDialog>
  );
}

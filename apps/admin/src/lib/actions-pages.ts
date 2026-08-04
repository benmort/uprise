import { actionPages } from "@uprise/api-client";

/**
 * Draft-first action-page creation. One type in v1 (click-to-call), so the
 * create dialog is a single confirm — the builder owns everything else.
 */

type Nav = { push: (href: string) => void };
type Toast = (input: {
  tone: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
}) => void;

export async function createActionPageAndOpen(
  router: Nav,
  showToast: Toast,
  title = "New click-to-call page",
): Promise<string | null> {
  const created = await actionPages.create({ title });
  if (!created.ok) {
    showToast({ tone: "error", title: "Could not create page", description: created.error });
    return null;
  }
  const id = String(created.data.id);
  showToast({ tone: "success", title: "Draft page created", description: "Opening the builder now." });
  router.push(`/actions/pages/${encodeURIComponent(id)}`);
  return id;
}

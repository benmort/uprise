import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Destructive-action confirmation on Radix AlertDialog – it portals to `document.body`
 * with a full-screen overlay, so it renders as a single-card overlay. `open` is
 * parent-controlled; these stories seed it `true` so the dialog shows on load.
 */
const meta: Meta<typeof ConfirmDialog> = { title: "ConfirmDialog", component: ConfirmDialog };
export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const RemoveMember: Story = {
  render: () => {
    const [open, setOpen] = React.useState(true);
    return (
      <ConfirmDialog
        open={open}
        title="Remove member"
        description="Remove Priya Nair from this workspace? They'll lose access immediately."
        confirmLabel="Remove"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    );
  },
};

export const RevokeInvitation: Story = {
  render: () => {
    const [open, setOpen] = React.useState(true);
    return (
      <ConfirmDialog
        open={open}
        title="Revoke invitation"
        description="Revoke the invitation for jordan@acf.org.au? The link will stop working."
        confirmLabel="Revoke"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    );
  },
};

export const DeleteTenant: Story = {
  render: () => {
    const [open, setOpen] = React.useState(true);
    return (
      <ConfirmDialog
        open={open}
        title="Delete tenant?"
        description="This permanently deletes GetUp and every campaign, audience and blast under it. This can't be undone."
        confirmLabel="Delete tenant"
        cancelLabel="Keep tenant"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    );
  },
};

/** Mid-action: buttons disabled and the confirm label swaps to "Working…". */
export const Busy: Story = {
  render: () => (
    <ConfirmDialog
      open
      title="Remove member"
      description="Removing Priya Nair from this workspace…"
      confirmLabel="Remove"
      busy
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  ),
};

import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { FormDialog } from "./form-dialog";

/**
 * Modal host for a create/edit form on Radix Dialog – it portals to `document.body`
 * with a full-screen overlay, so it renders as a single-card overlay. `open` is
 * parent-controlled and seeded `true` here so the form shows on load. Fields are the
 * dialog's `children`; the footer's Cancel/Submit are built in.
 */
const meta: Meta<typeof FormDialog> = { title: "FormDialog", component: FormDialog };
export default meta;
type Story = StoryObj<typeof FormDialog>;

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const ApproveMember: Story = {
  render: () => {
    const [open, setOpen] = React.useState(true);
    return (
      <FormDialog
        open={open}
        title="Approve jordan@acf.org.au"
        description="Assign their role. Self-selected role is only a hint – you decide their access."
        submitLabel="Approve"
        onClose={() => setOpen(false)}
        onSubmit={() => setOpen(false)}
      >
        <label className="block text-sm font-medium text-foreground" htmlFor="approve-role">
          Role
        </label>
        <select id="approve-role" className={inputClass} defaultValue="VOLUNTEER">
          <option value="VOLUNTEER">Volunteer (field)</option>
          <option value="ORGANISER">Organiser (staff / admin)</option>
        </select>
      </FormDialog>
    );
  },
};

export const CreateDisposition: Story = {
  render: () => {
    const [open, setOpen] = React.useState(true);
    return (
      <FormDialog
        open={open}
        title="Add disposition"
        description="A quick outcome canvassers can log against a conversation."
        submitLabel="Add disposition"
        onClose={() => setOpen(false)}
        onSubmit={() => setOpen(false)}
      >
        <label className="block text-sm font-medium text-foreground" htmlFor="disp-label">
          Label
        </label>
        <input id="disp-label" className={inputClass} placeholder="Not home" />
        <label className="block text-sm font-medium text-foreground" htmlFor="disp-code">
          Code
        </label>
        <input id="disp-code" className={inputClass} placeholder="NH" />
      </FormDialog>
    );
  },
};

/** Large variant with a longer form body. */
export const LargeScript: Story = {
  render: () => {
    const [open, setOpen] = React.useState(true);
    return (
      <FormDialog
        open={open}
        title="Edit canvassing script"
        size="lg"
        submitLabel="Save script"
        onClose={() => setOpen(false)}
        onSubmit={() => setOpen(false)}
      >
        <label className="block text-sm font-medium text-foreground" htmlFor="script-name">
          Name
        </label>
        <input id="script-name" className={inputClass} defaultValue="Door-knock intro" />
        <label className="block text-sm font-medium text-foreground" htmlFor="script-body">
          Body
        </label>
        <textarea
          id="script-body"
          rows={5}
          className={inputClass}
          defaultValue="Hi, I'm a volunteer with GetUp. Do you have a moment to talk about the upcoming election?"
        />
      </FormDialog>
    );
  },
};

/** Mid-save: fields locked, submit shows "Saving…". */
export const Busy: Story = {
  render: () => (
    <FormDialog
      open
      title="Change role"
      description="Set the role for Priya Nair."
      busy
      onClose={() => {}}
      onSubmit={() => {}}
    >
      <label className="block text-sm font-medium text-foreground" htmlFor="edit-role">
        Role
      </label>
      <select id="edit-role" className={inputClass} defaultValue="ORGANISER" disabled>
        <option value="ORGANISER">Organiser</option>
        <option value="OWNER">Owner</option>
      </select>
    </FormDialog>
  ),
};

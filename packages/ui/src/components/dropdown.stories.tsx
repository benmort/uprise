import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Building2, Check, ChevronDown, LogOut, Settings, UserCircle } from "lucide-react";
import { Dropdown, DropdownItem } from "./dropdown";

/**
 * Headless click-to-open menu (Radix-free). It has no controlled `open` prop – the
 * open state lives inside the component and is driven by the `trigger` render-prop's
 * `toggle`. To render the open menu statically these stories use a trigger that calls
 * `toggle()` once on mount. Renders a fixed/absolute-positioned menu (a body portal
 * when `portal` is set), so treat it as a single-card overlay.
 */
const meta: Meta<typeof Dropdown> = { title: "Dropdown", component: Dropdown };
export default meta;
type Story = StoryObj<typeof Dropdown>;

/** Opens the menu on mount so the story shows the real open content, not just a trigger. */
function OpenTrigger({
  open,
  toggle,
  children,
}: {
  open: boolean;
  toggle: () => void;
  children: React.ReactNode;
}) {
  const done = React.useRef(false);
  React.useEffect(() => {
    if (!done.current && !open) {
      done.current = true;
      toggle();
    }
  }, [open, toggle]);
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-2 rounded-full py-1 pl-2 pr-2 text-foreground transition-colors hover:bg-surface-variant"
    >
      {children}
      <ChevronDown
        className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

/** Topbar user menu (mirrors apps/admin UserDropdown). */
export const UserMenu: Story = {
  render: () => (
    <Dropdown
      align="end"
      contentClassName="w-64"
      trigger={(a) => (
        <OpenTrigger {...a}>
          <span className="text-sm font-medium">Sam Okafor</span>
        </OpenTrigger>
      )}
    >
      <div className="border-b border-border px-3 pb-2.5 pt-1">
        <p className="truncate text-sm font-medium text-foreground">Sam Okafor</p>
        <p className="truncate text-xs text-muted-foreground">sam@getup.org.au</p>
      </div>
      <div className="pt-1.5">
        <DropdownItem>
          <UserCircle className="h-4 w-4 text-muted-foreground" />
          Profile
        </DropdownItem>
        <DropdownItem>
          <Settings className="h-4 w-4 text-muted-foreground" />
          Account
        </DropdownItem>
      </div>
      <div className="mt-1.5 border-t border-border pt-1.5">
        <DropdownItem>
          <LogOut className="h-4 w-4 text-muted-foreground" />
          Sign out
        </DropdownItem>
      </div>
    </Dropdown>
  ),
};

/** Tenant switcher – a checked current tenant plus siblings to switch to. */
export const TenantSwitcher: Story = {
  render: () => (
    <Dropdown
      align="start"
      contentClassName="w-72"
      trigger={(a) => (
        <OpenTrigger {...a}>
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">GetUp</span>
        </OpenTrigger>
      )}
    >
      <p className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Your tenants
      </p>
      <DropdownItem>
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">GetUp</span>
        <Check className="h-4 w-4 text-primary" />
      </DropdownItem>
      <DropdownItem>
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">Australian Conservation Foundation</span>
      </DropdownItem>
      <DropdownItem>
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">Rising Tide</span>
      </DropdownItem>
    </Dropdown>
  ),
};

/** Plain action menu with a destructive item. */
export const Actions: Story = {
  render: () => (
    <Dropdown
      align="end"
      trigger={(a) => (
        <OpenTrigger {...a}>
          <span className="text-sm font-medium">Blast options</span>
        </OpenTrigger>
      )}
    >
      <DropdownItem>Duplicate blast</DropdownItem>
      <DropdownItem>Export recipients</DropdownItem>
      <DropdownItem className="text-error hover:bg-error/10">Delete blast</DropdownItem>
    </Dropdown>
  ),
};

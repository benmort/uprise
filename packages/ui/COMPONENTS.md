# `@uprise/ui` component catalogue

The shared design system for every uprise app. Radix + CVA + Tailwind v4 (CSS-first tokens),
composed with `cn`. Consumed as **source** via Next `transpilePackages` — no build step, edits
hot-reload. Tokens live in `./globals.css`; import once per app (`@import "@uprise/ui/globals.css"`)
plus an `@source` glob at `packages/ui/src/**/*.{ts,tsx}`.

Import everything from the barrel: `import { Button, Badge, Modal } from "@uprise/ui";`

## Conventions (the house rules)

- **File** `src/components/<kebab>.tsx`; **component** PascalCase; **hook** `src/hooks/use-*.ts`;
  **pure logic** `src/lib/*.ts` (only these get a `*.test.ts`; components are e2e territory).
- **Variants** via `class-variance-authority` (`const xVariants = cva(base, { variants })`, exported).
- **Classes** composed with `cn` (`twMerge(clsx(...))`). **Tokens only — never a raw hex.** New colour ⇒ add a `:root` HSL channel + map it in `@theme inline` in `globals.css`.
- `forwardRef` + `displayName`; `asChild` (Radix `Slot`) for polymorphic primitives.
- **No `next/*` imports** — link primitives are framework-agnostic; pass a router `<Link>` via `asChild`.
- Re-export from the grouped barrel `src/index.ts`; add a co-located `*.stories.tsx`.
- **In-app showcase:** `/super/kitchen-sink` (admin) renders every primitive live in both themes.

## The 21-primitive design map

The set specified by the design originator, and where each lives.

| Primitive | Component(s) | File |
|---|---|---|
| Alerts | `Alert` (variants + `dismissible`) | `alert.tsx` |
| Avatar | `Avatar` (+ `computeInitials`), `TenantAvatar` | `avatar.tsx`, `tenant-brand.tsx` |
| Badge | `Badge` (generic) · `StatusBadge`/`EventStatusBadge`/`TagChip` (domain) | `badge.tsx`, `status-badge.tsx`, … |
| Breadcrumb | `Breadcrumb`/`BreadcrumbList`/`BreadcrumbItem`/`BreadcrumbLink`/`BreadcrumbPage`/`BreadcrumbSeparator` | `breadcrumb.tsx` |
| Buttons | `Button` (`buttonVariants`) | `button.tsx` |
| Button Group | `ButtonGroup` | `button-group.tsx` |
| Cards | `Card`/`CardHeader`/`CardTitle`/`CardContent`/`CardFooter` | `card.tsx` |
| Carousel | `Carousel`/`CarouselItem` | `carousel.tsx` |
| Dropdowns | `Dropdown`/`DropdownItem` · `Select`/`SelectItem` | `dropdown.tsx`, `select.tsx` |
| Images | `Image` (`imageVariants`) | `image.tsx` |
| Links | `Link` (`linkVariants`, `asChild`) | `link.tsx` |
| List | `List`/`ListItem` | `list.tsx` |
| Modals | `Modal`* (base) · `FormDialog` (create/edit) · `ConfirmDialog` (destructive) | `modal.tsx`, `form-dialog.tsx`, `confirm-dialog.tsx` |
| Notification | `ToastProvider`/`useToast` (toasts) · `Alert dismissible` (inline banner) | `toast.tsx`, `alert.tsx` |
| Pagination | `Pagination` (numbered) · `PaginationControls` (cursor + rows-per-page) | `pagination.tsx`, `pagination-controls.tsx` |
| Popovers | `Popover`/`PopoverTrigger`/`PopoverContent`/`PopoverAnchor`/`PopoverClose` | `popover.tsx` |
| Progressbar | `Progress` (generic) · `StepProgress` (wizard) · `CapacityMeter` (gauge) | `progress.tsx`, … |
| Ribbons | `Ribbon` | `ribbon.tsx` |
| Spinners | `Spinner`/`PageSpinner` · `BrandLoadingScreen` | `spinner.tsx`, `brand-loading-screen.tsx` |
| Tabs | `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (panels) · `TabNav`/`TabNavItem` (route bars) | `tabs.tsx` |
| Tooltips | `Tooltip` (general) · `TooltipHint` (help icon) | `tooltip.tsx`, `tooltip-hint.tsx` |

Also promoted into the shared kit: **`Switch`** (`switch.tsx`) and the **`Table`** family
(`Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`/`TableCaption`, `table.tsx`).

\* `Modal` is the bare Radix-Dialog base; prefer `FormDialog`/`ConfirmDialog` for those jobs.

## Full inventory (by barrel section)

- **Primitives** — Button, ButtonGroup, Badge, Avatar, Image, Link, Ribbon, Logo, TagChip, Spinner, Skeleton
- **Forms** — Input, Textarea, Label, Select, Checkbox, RadioGroup, Switch, Field, FieldOnboarding, FormInput/Label/Select/Textarea, OtpInput, PasswordInput, PasswordStrength, PhoneNumberField, Keypad, DayChips
- **Feedback** — Alert, Toast, EmptyState, Progress, StepProgress, CapacityMeter, BrandLoadingScreen
- **Overlays** — Modal, FormDialog, ConfirmDialog, Dropdown, Popover, Tooltip, TooltipHint
- **Navigation** — Tabs/TabNav, SegmentedControl, Breadcrumb, Pagination, PaginationControls, QuickActions
- **Data display** — Card, List, Table, Carousel
- **Domain & status** — StatusBadge, EventStatusBadge, RoleSelectCards, PrinciplesList, ShareCard, AddToCalendar, QrCode, Wizard
- **Brand** — TenantBrand/TenantAvatar, TenantHead, BrandStyle, TurnstileWidget
- **Lib** — `cn`, wizard-steps, brand-css, brand-cookie, readable-on, calendar-links, qr
- **Hooks** — `useLocalStorage`, `useCountdown`

## Generic vs domain — which to reach for

Prefer the **domain** component when the data maps to a known concept; it encodes the right tokens
and labels. Use the **generic** primitive for one-off UI.

- Status pill → `StatusBadge` (known status) else `Badge`.
- Modal → `FormDialog` (create/edit) / `ConfirmDialog` (destructive) else `Modal`.
- Progress → `StepProgress` (wizard) / `CapacityMeter` (limit gauge) else `Progress`.
- Tabs → `TabNav` (route-driven bar) else `Tabs` (in-page panels).
- Pagination → `PaginationControls` (cursor/rows) else `Pagination` (numbered).

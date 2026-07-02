# uprise design system (`@uprise/ui`)

`@uprise/ui` is the component library for **uprise** — a campaigning and community-organising platform for progressive organisations (multi-tenant/multi-brand). Its surfaces are field canvassing, audience and contact management, message blasts, a shared inbox, and admin. Components are React 18 + Radix primitives, styled with Tailwind v4 CSS-first tokens and CVA variants. Design with these real components; every screen you build maps 1:1 onto code the engineers ship.

## Voice and copy
- **Australian English everywhere** — organise, colour, authorise, analyse, centre, licence (noun). Never American spellings.
- Use a spaced en-dash ` – ` for parenthetical breaks; **never** the em-dash character.
- Tone is plain, direct, and action-first — this is a tool for organisers and volunteers doing real work, not marketing copy. Button labels are verbs ("Add disposition", "Approve", "Delete tenant"). Destructive actions name what is lost.

## Colour — always tokens, never raw hex
Every colour is a semantic token; do not hardcode hex or pick arbitrary Tailwind palette values. The system is fully theme-aware (light + dark) **through these tokens**, so token-only styling is what makes a design work in both modes.

- **Brand / primary:** brand blue `#465fff` is the identity. Use `primary` / `primary-foreground` / `primary-container` (and the `brand-25…950` scale, e.g. `bg-brand-50`, `text-brand-600`) — this is per-tenant themeable, so never inline the hex.
- **Semantic status:** `success`, `warning`, `error` each pair a base with a `-container` (soft background) and `-foreground` (text/icon on it). Use them for Alert, StatusBadge, and validation — not raw green/amber/red.
- **Surfaces & text:** `background`, `foreground`, `surface`, `surface-variant`, `muted` / `muted-foreground`, `border`, `input`, `ring`. Body text is `foreground`; secondary text is `muted-foreground`; card/panel fills are `surface`.
- **Domain (canvassing) tokens:** `knock` / `knock-container` for door-knock actions, and `support-strong` / `support-lean` / `support-undecided` / `support-lean-oppose` / `support-strong-oppose` for voter-support scales. Reach for these only in field/canvassing contexts; ordinary UI uses the semantic set above.

## Type, radius, spacing
- Font is **Outfit** across `font-headline`, `font-body`, `font-label`. Don't introduce other typefaces.
- Corners use the radius scale `rounded-sm/md/lg/xl` (base `--radius` ≈ 0.6rem). Cards and dialogs are `rounded-lg`+; inputs/buttons `rounded-md`.
- Prefer the components' built-in sizing/variants over ad-hoc padding.

## Composition patterns — reach for the built component
- **Modals:** `FormDialog` hosts a create/edit form (title, description, children fields, built-in Cancel/Submit, `busy` state, `size`); `ConfirmDialog` is the destructive/confirm prompt (name the consequence, use its destructive confirm). Both are Radix-portalled overlays — don't rebuild a modal by hand.
- **Status & tags:** `StatusBadge` for lifecycle/state; `TagChip` for labels and merge-variable chips; `Alert` for inline info/success/warning/error banners (with the matching semantic token).
- **Forms:** compose `Field` (label + control + hint + error) with `Input`, `Textarea`, `FormSelect`, `Checkbox`, `RadioGroup`, `PasswordInput` (+ `PasswordStrength`), `OtpInput`, `PhoneNumberField`, `Keypad`. Use `FormLabel`/`Label` for standalone labels. Show validation via the control's error state, not custom red text.
- **Onboarding / wizards:** `StepProgress` for the segmented header bar; `RoleSelectCards` for role choice; `FieldOnboarding` for the first-run volunteer primer; `PrinciplesList` for principle/feature rows.
- **Tenancy & identity:** `TenantBrand` renders a tenant's gradient brand avatar + plan badge; `Avatar` for people; `Logo` for the uprise mark/wordmark.
- **Structure & feedback:** `Card` for panels, `EmptyState` for zero-data (with an optional CTA), `Skeleton` for loading, `Spinner` for inline/page loading, `PaginationControls`, `DayChips` for day-of-week selection, `QuickActions` for a row of primary actions, `Dropdown` menus, `TooltipHint` for help affordances.
- **Toasts:** wrap the app in `ToastProvider`; fire toasts through its hook rather than rendering ad-hoc notifications.

## Don'ts
- Don't hardcode colours, fonts, or radii — use tokens/utilities so light/dark and per-tenant theming keep working.
- Don't hand-roll a component that already exists here (dialogs, badges, form fields, empty/loading states).
- Don't use American spellings or em-dashes.

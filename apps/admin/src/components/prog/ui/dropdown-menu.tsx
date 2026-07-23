// Retiring prog/ui → @uprise/ui. The full Radix DropdownMenu compound has been ported into
// the shared kit (retokenised); this re-exports it so all 67 consumers keep working
// unchanged. Repointed to `@uprise/ui` next, then this is deleted. Zero functional regression.
export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@uprise/ui";

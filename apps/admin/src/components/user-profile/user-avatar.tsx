import { Avatar, AvatarFallback, AvatarImage } from "@/components/prog/ui/avatar";
import { getDefaultPlaceholderAvatar } from "./placeholder-avatars";

/** Two-letter initials from a display name or email (prog parity). */
export function avatarInitials(name?: string | null): string {
  const t = (name ?? "").trim();
  if (!t) return "U";
  if (t.includes("@")) return t[0]!.toUpperCase();
  const parts = t.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (first + last).toUpperCase() || "U";
}

/**
 * The single way uprise renders a person (prog's radix Avatar). Falls back to a
 * deterministic Bauhaus placeholder when `placeholder` + a `seed` are given, else
 * to initials. Size via `className` (e.g. "h-11 w-11"); defaults to the prog size-8.
 */
export function UserAvatar({
  src,
  name,
  seed,
  placeholder = false,
  className,
}: {
  src?: string | null;
  name?: string | null;
  seed?: string | number | null;
  placeholder?: boolean;
  className?: string;
}) {
  const imgSrc =
    src || (placeholder && seed != null && seed !== "" ? getDefaultPlaceholderAvatar(seed) : undefined);
  return (
    <Avatar className={className}>
      {imgSrc ? <AvatarImage src={imgSrc} alt={name ?? "User"} /> : null}
      <AvatarFallback>{avatarInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

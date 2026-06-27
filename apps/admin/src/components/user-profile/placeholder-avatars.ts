export const BAUHAUS_PLACEHOLDER_AVATARS = [
  "/avatars/bauhaus-1.svg",
  "/avatars/bauhaus-2.svg",
  "/avatars/bauhaus-3.svg",
  "/avatars/bauhaus-4.svg",
  "/avatars/bauhaus-5.svg",
  "/avatars/bauhaus-6.svg",
  "/avatars/bauhaus-7.svg",
  "/avatars/bauhaus-8.svg",
] as const;

/** Pick a stable placeholder avatar for a user when they have no profile image. */
export function getDefaultPlaceholderAvatar(userId: number | string): string {
  let index: number;
  if (typeof userId === "string") {
    index = userId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  } else {
    index = userId;
  }
  const i = Math.abs(index) % BAUHAUS_PLACEHOLDER_AVATARS.length;
  return BAUHAUS_PLACEHOLDER_AVATARS[i]!;
}

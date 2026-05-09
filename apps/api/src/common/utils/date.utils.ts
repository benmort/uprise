export function nowIso(): string {
  return new Date().toISOString();
}

export function floorToMinute(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      0,
      0,
    ),
  );
}

export function toUtcMinuteBucket(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return floorToMinute(date).toISOString();
}

export function isWithinQuietHours(
  date: Date,
  quietStartHour: number,
  quietEndHour: number,
): boolean {
  const hour = date.getHours();
  if (quietStartHour === quietEndHour) return false;
  if (quietStartHour > quietEndHour) {
    return hour >= quietStartHour || hour < quietEndHour;
  }
  return hour >= quietStartHour && hour < quietEndHour;
}

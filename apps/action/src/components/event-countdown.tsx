"use client";

import { useCountdown, type CountdownStatus } from "@uprise/ui";

/** Thin client wrapper: the live "Starts in …" label for the (server-rendered) event hero. */
export function EventCountdown({
  startsAt,
  endsAt,
  status,
}: {
  startsAt: string;
  endsAt: string;
  status?: CountdownStatus;
}) {
  return <>{useCountdown(startsAt, endsAt, status)}</>;
}

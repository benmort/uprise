import { Skeleton } from "@uprise/ui";

/**
 * Walk-view route skeleton. Matches the homepage's route skeleton (app/loading.tsx) so the
 * dashboard→turf transition shows one consistent loading shape; the branded "Loading your
 * turf…" screen then takes over inside WalkView while the assignment fetches.
 */
export default function TurfLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

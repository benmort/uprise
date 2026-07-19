import { Skeleton } from "@uprise/ui";

/** Walk-view route skeleton — a big map/list block over the stop list, matching the
 *  turf screen's shape so the dashboard→turf transition never flashes blank. */
export default function TurfLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

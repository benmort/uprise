import { Skeleton } from "@uprise/ui";

/** Door-entry route skeleton — resident header + disposition pad shape, so opening a
 *  door from the walk view never flashes blank. */
export default function DoorLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

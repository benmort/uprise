import { Skeleton } from "@uprise/ui";

/**
 * Route-transition skeleton for the field surface (Next wraps the segment in a
 * Suspense boundary). Shown while a screen's bundle loads on navigation, so moving
 * between pages is never a blank flash. Renders inside FieldShell's padded <main>.
 */
export default function FieldLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

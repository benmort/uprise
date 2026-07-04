import { Skeleton } from "@/components/ui/skeleton";

/**
 * Panel-level loading state for the geo explorer. Because the (geo) layout is
 * the persistent shell, only the panel area skeletons during a kind switch –
 * the search box and toggles never flicker.
 */
export default function GeoExplorerLoading() {
  return (
    <div className="section-stack">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import { DelayedWorkspaceLoader } from "@/components/shell/delayed-workspace-loader";

export default function MainLoading() {
  return (
    <div className="page-stack min-h-[calc(100vh-80px)] py-6">
      <div className="section-stack">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-80" />
      </div>
      {/* If the load runs past 2s, the branded workspace dialogue takes over from the skeletons. */}
      <DelayedWorkspaceLoader />
    </div>
  );
}

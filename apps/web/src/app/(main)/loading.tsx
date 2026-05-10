import { Loader2 } from "lucide-react";

export default function MainLoading() {
  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center">
      <div className="flex items-center gap-2 text-sm font-label text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading ..</span>
      </div>
    </div>
  );
}

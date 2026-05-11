import { Button } from "@/components/ui/button";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
};

export function PaginationControls({
  page,
  pageSize,
  total,
  onPrev,
  onNext,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={!canPrev} onClick={onPrev}>
        Previous
      </Button>
      <span className="text-xs text-muted-foreground">
        Page {Math.min(page + 1, totalPages)} of {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={!canNext} onClick={onNext}>
        Next
      </Button>
    </div>
  );
}

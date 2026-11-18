import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExploreHistoryButtons({
  canBack,
  canForward,
  onBack,
  onForward,
  className,
}: {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  className?: string;
}) {
  const button =
    "flex size-8 items-center justify-center rounded-lg border border-line/60 bg-surface-2/50 text-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={onBack}
        disabled={!canBack}
        aria-label="Back"
        title="Back"
        className={button}
      >
        <ArrowLeft className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onForward}
        disabled={!canForward}
        aria-label="Forward"
        title="Forward"
        className={button}
      >
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}

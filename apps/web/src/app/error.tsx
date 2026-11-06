"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Plane } from "lucide-react";
import { Button, EmptyState, Panel } from "@/components/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("route render error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Panel>
        <EmptyState
          icon={<Plane className="size-6" />}
          title="This screen hit turbulence"
          description={
            "A live data error interrupted this page. Your watchlist, notes, and alerts are safe — retry the view or head back to search."
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={reset}>
                Retry
              </Button>
              <Button size="sm" variant="outline" onClick={() => router.push("/search")}>
                Back to search
              </Button>
            </div>
          }
        />
        {error.digest && (
          <p className="mt-1 text-center font-mono text-[9px] text-subtle">
            Error ref: {error.digest}
          </p>
        )}
      </Panel>
    </div>
  );
}

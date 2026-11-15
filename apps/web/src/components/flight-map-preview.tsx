"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Fullscreen, LocateFixed, MapPinned, Minimize2 } from "lucide-react";
import type { Flight } from "@/lib/types";
import { cn, isFreshTimestamp } from "@/lib/utils";

/** MapLibre is heavy; load it only when a map is actually on screen. */
const FlightMap = dynamic(() => import("./flight-map").then((m) => m.FlightMap), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-line/70 bg-surface">
      <p className="text-sm text-muted">Loading live map…</p>
    </div>
  ),
});

export function FlightMapPreview({
  flight,
  className,
  isExpanded = false,
  onToggleExpand,
  hideControls = false,
}: {
  flight: Flight;
  className?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  hideControls?: boolean;
}) {
  const [recenterSignal, setRecenterSignal] = useState(0);
  const isLive =
    Boolean(flight.telemetry.hasLiveLocation) &&
    isFreshTimestamp(flight.fetchedAt);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-line/70 bg-surface",
        className,
      )}
    >
      <FlightMap
        flight={flight}
        className="absolute inset-0"
        showAttribution={false}
        recenterSignal={recenterSignal}
      />

      {!hideControls && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-line/70 bg-surface/95 p-1 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setRecenterSignal((value) => value + 1)}
            className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label="Center on aircraft"
            title="Center on aircraft"
          >
            <LocateFixed className="size-4" />
          </button>
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              aria-label={isExpanded ? "Collapse map" : "Expand map"}
              title={isExpanded ? "Collapse map" : "Expand map"}
            >
              {isExpanded ? (
                <Minimize2 className="size-4" />
              ) : (
                <Fullscreen className="size-4" />
              )}
            </button>
          )}
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur",
          isLive
            ? "border-landed/35 bg-landed/10 text-landed"
            : "border-line/60 bg-surface/90 text-subtle",
        )}
      >
        <MapPinned className="size-3.5" />
        {isLive ? "Live flight map" : "Route map · no live position"}
      </div>
    </div>
  );
}

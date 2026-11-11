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
    <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-line bg-surface-2">
      <p className="text-[11px] text-muted">Loading live map…</p>
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
        "relative overflow-hidden rounded-xl border border-line bg-surface",
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
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-lg border border-line/70 bg-surface/90 p-1 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setRecenterSignal((value) => value + 1)}
            className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-accent"
            aria-label="Center on aircraft"
            title="Center on aircraft"
          >
            <LocateFixed className="size-3.5" />
          </button>
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-accent"
              aria-label={isExpanded ? "Collapse map" : "Expand map"}
              title={isExpanded ? "Collapse map" : "Expand map"}
            >
              {isExpanded ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Fullscreen className="size-3.5" />
              )}
            </button>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-md border border-line/60 bg-surface/85 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted shadow-sm backdrop-blur">
        <MapPinned className="size-3 text-accent" />
        {isLive ? "Live flight map" : "Route map · position not reported"}
      </div>
    </div>
  );
}

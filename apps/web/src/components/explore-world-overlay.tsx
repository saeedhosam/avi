import { Globe2 } from "lucide-react";
import { AIRPORT_TRAFFIC_BUCKETS } from "@/lib/airport-traffic";
import { cn } from "@/lib/utils";
import { ExploreHistoryButtons } from "./explore-history-buttons";

export function ExploreWorldOverlay({
  airportCount,
  visible,
  canBack,
  canForward,
  onBack,
  onForward,
}: {
  airportCount: number;
  visible: boolean;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "pointer-events-none absolute inset-0 z-10 transition-all duration-300 ease-out",
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      )}
    >
      <header className="map-overlay-top pointer-events-auto absolute left-3 right-3 rounded-xl border border-line/70 bg-surface/90 p-4 shadow-2xl backdrop-blur-xl sm:left-4 sm:right-4 lg:w-[min(38rem,calc(100%-2rem))]">
        <div className="flex flex-wrap items-center gap-2">
          {(canBack || canForward) && (
            <ExploreHistoryButtons
              canBack={canBack}
              canForward={canForward}
              onBack={onBack}
              onForward={onForward}
            />
          )}
          <Globe2 className="size-3.5 text-accent" />
          <span className="label-caps text-accent">Global airport map</span>
          <span className="ml-auto rounded-full border border-line/70 px-2 py-1 text-[11px] font-medium tabular text-muted">
            {airportCount.toLocaleString()} airports
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          The world&apos;s non-stop network
        </h1>
        <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted sm:text-sm">
          Airport dots are coloured by their active route count. Select any
          airport to open its direct-route explorer.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
          {AIRPORT_TRAFFIC_BUCKETS.map((bucket) => (
            <span
              key={bucket.id}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: bucket.color }}
              />
              {bucket.range}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-subtle">
          Active route counts from the bundled airports-routes dataset, not live
          schedules.
        </p>
      </header>
    </div>
  );
}

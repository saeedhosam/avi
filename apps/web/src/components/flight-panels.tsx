"use client";

import Link from "next/link";
import {
  Armchair,
  Bolt,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Plane,
  Wifi,
} from "lucide-react";
import type { AircraftInfo, FlightTimelineEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FlightTimelineView({
  events,
  className,
}: {
  events: FlightTimelineEvent[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line/70 bg-surface/80 p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[15px] font-semibold text-ink">Event timeline</p>
          <p className="mt-0.5 text-xs text-subtle">
            Gate and airborne progression
          </p>
        </div>
        <Clock3 className="size-4 text-subtle" />
      </div>

      <ol className="mt-4">
        {events.map((event, index) => (
          <li key={`${event.title}-${index}`} className="flex gap-3">
            <div className="flex w-5 shrink-0 flex-col items-center">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border",
                  event.isCurrent
                    ? "border-accent bg-accent text-[color:var(--bg)]"
                    : event.isCompleted
                      ? "border-landed/50 bg-landed/90 text-[color:var(--bg)]"
                      : "border-line bg-surface-3",
                )}
              >
                {event.isCompleted && !event.isCurrent ? (
                  <Check className="size-3" />
                ) : event.isCurrent ? (
                  <Circle className="size-1.5 fill-current" />
                ) : null}
              </span>
              {index < events.length - 1 && (
                <span
                  className={cn(
                    "w-px flex-1",
                    event.isCompleted ? "bg-landed/40" : "bg-line",
                  )}
                  style={{ minHeight: 28 }}
                />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p
                  className={cn(
                    "text-[13px]",
                    event.isCurrent
                      ? "font-semibold text-accent"
                      : event.isCompleted
                        ? "font-medium text-ink"
                        : "text-muted",
                  )}
                >
                  {event.title}
                </p>
                <p
                  className={cn(
                    "font-mono text-xs tabular",
                    event.isCurrent ? "text-accent" : "text-subtle",
                  )}
                >
                  {event.time}
                </p>
              </div>
              {event.description && (
                <p className="mt-1 text-xs leading-relaxed text-subtle">
                  {event.description}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AircraftInfoCard({
  aircraft,
  airlineCode,
  className,
}: {
  aircraft: AircraftInfo;
  airlineCode?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line/70 bg-surface/80 p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink">Aircraft</p>
        <span className="font-mono text-xs text-subtle">
          {aircraft.registration}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-surface-2 text-muted">
          <Plane className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {aircraft.model}
          </p>
          <p className="text-xs text-subtle">
            Airframe age {aircraft.age ?? "not reported"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line/50 pt-3">
        <AmenityPill
          icon={<Wifi className="size-3.5" />}
          label="Wi-Fi"
          available={aircraft.wifiAvailable}
        />
        <AmenityPill
          icon={<Bolt className="size-3.5" />}
          label="Power"
          available={aircraft.powerOutlets}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-2/50 px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <Armchair className="mt-0.5 size-3.5 shrink-0 text-subtle" />
          <p className="text-xs leading-relaxed text-muted">
            {aircraft.seatLayout ?? "Seat layout not reported."}
          </p>
        </div>
        <Link
          href={`/airplanes?model=${encodeURIComponent(aircraft.model)}${
            airlineCode ? `&airline=${encodeURIComponent(airlineCode)}` : ""
          }`}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-ink"
        >
          Seatmap
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function AmenityPill({
  icon,
  label,
  available,
}: {
  icon: React.ReactNode;
  label: string;
  available: boolean | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-2.5 py-2">
      <span className={available ? "text-landed" : "text-subtle"}>{icon}</span>
      <span
        className={cn(
          "text-xs",
          available ? "text-ink" : "text-subtle",
        )}
      >
        {available == null ? `${label} not reported` : label}
      </span>
    </div>
  );
}

export function RouteProgress({
  origin,
  destination,
  progress,
  status,
  className,
}: {
  origin: string;
  destination: string;
  progress: number;
  status: string;
  className?: string;
}) {
  const clamped =
    status === "LANDED"
      ? 1
      : status === "SCHEDULED" || status === "CANCELLED"
        ? 0
        : Math.min(0.98, Math.max(0, progress));

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <p className="font-mono text-lg font-semibold text-ink">{origin}</p>
      <div className="relative h-5 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-accent"
          style={{ width: `${clamped * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: `calc(${clamped * 100}% - 8px)` }}
        >
          <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[color:var(--bg)]">
            <Plane className="size-2.5 rotate-90" />
          </span>
        </div>
      </div>
      <p className="font-mono text-lg font-semibold text-ink">{destination}</p>
    </div>
  );
}

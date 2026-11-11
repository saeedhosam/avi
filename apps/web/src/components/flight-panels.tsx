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
        "rounded-2xl border border-line bg-surface p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-ink">Flight event timeline</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Real-time gate and airborne progression
          </p>
        </div>
        <Clock3 className="size-4 text-subtle" />
      </div>
      <div className="mt-4 space-y-0">
        {events.map((event, index) => (
          <div key={`${event.title}-${index}`} className="flex gap-3">
            <div className="flex w-6 shrink-0 flex-col items-center">
              <div
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border",
                  event.isCurrent
                    ? "border-ink bg-accent text-[color:var(--bg)]"
                    : event.isCompleted
                      ? "border-landed/60 bg-landed text-[color:var(--bg)]"
                      : "border-line bg-surface-3",
                )}
              >
                {event.isCompleted && !event.isCurrent ? (
                  <Check className="size-2.5" />
                ) : event.isCurrent ? (
                  <Circle className="size-1.5 fill-current" />
                ) : null}
              </div>
              {index < events.length - 1 && (
                <div
                  className={cn(
                    "w-px flex-1",
                    event.isCompleted ? "bg-landed/40" : "bg-line",
                  )}
                  style={{ minHeight: 30 }}
                />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p
                  className={cn(
                    "text-xs font-semibold",
                    event.isCurrent
                      ? "font-bold text-accent"
                      : event.isCompleted
                        ? "text-ink"
                        : "text-muted",
                  )}
                >
                  {event.title}
                </p>
                <p
                  className={cn(
                    "text-[10px] font-medium",
                    event.isCurrent ? "text-accent" : "text-subtle",
                  )}
                >
                  {event.time}
                </p>
              </div>
              {event.description && (
                <p className="mt-0.5 text-[10px] leading-relaxed text-subtle">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
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
        "rounded-2xl border border-line bg-surface p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Aircraft specifications</p>
        <span className="font-mono text-[10px] font-semibold text-accent">
          Reg: {aircraft.registration}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <div className="flex size-10 items-center justify-center rounded-xl border border-accent/35 bg-surface-3 text-accent">
          <Plane className="size-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-ink">{aircraft.model}</p>
          <p className="text-[11px] text-muted">
            Airframe age: {aircraft.age ?? "Not reported"}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-3">
        <AmenityPill
          icon={<Wifi className="size-3.5" />}
          label="Satellite Wi-Fi"
          available={aircraft.wifiAvailable}
        />
        <AmenityPill
          icon={<Bolt className="size-3.5" />}
          label="USB & power"
          available={aircraft.powerOutlets}
        />
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-2 px-2.5 py-2">
        <div className="flex items-start gap-2">
          <Armchair className="mt-0.5 size-3.5 shrink-0 text-accent-2" />
          <p className="text-[10px] font-medium leading-relaxed text-muted">
            {aircraft.seatLayout ?? "Seat layout not reported by the provider."}
          </p>
        </div>
        <Link
          href={`/airplanes?model=${encodeURIComponent(aircraft.model)}${
            airlineCode ? `&airline=${encodeURIComponent(airlineCode)}` : ""
          }`}
          className="ml-2 flex shrink-0 items-center gap-1 rounded border border-accent/30 bg-accent-soft px-2 py-0.5 text-[9px] font-bold text-accent transition-colors hover:bg-accent/25"
        >
          View seatmap <ChevronRight className="size-3" />
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
    <div className="flex items-center gap-1.5 rounded-lg border border-line/70 bg-surface-2 px-2 py-1.5">
      <span className={available ? "text-landed" : "text-subtle"}>{icon}</span>
      <span
        className={cn(
          "text-[10px] font-medium",
          available ? "text-ink" : "text-subtle",
        )}
      >
        {available == null ? `${label}: not reported` : label}
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
      <div className="text-left">
        <p className="font-mono text-lg font-black text-ink">{origin}</p>
      </div>
      <div className="relative h-5 flex-1">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-accent to-accent-2"
          style={{ width: `${clamped * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: `calc(${clamped * 100}% - 8px)` }}
        >
          <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[color:var(--bg)]">
            <Plane className="size-2 rotate-90" />
          </span>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-lg font-black text-ink">{destination}</p>
      </div>
    </div>
  );
}

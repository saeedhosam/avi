"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plane,
  Clock,
  ArrowRightLeft,
  X,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Compass,
  Search,
} from "lucide-react";
import type { DirectFlightConnection, OperatingCarrierRoute } from "@/lib/types";
import { HAUL_META, cn, formatDuration } from "@/lib/utils";

interface RouteTimetableProps {
  connection: DirectFlightConnection;
  onClose?: () => void;
  onSwap?: () => void;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["su", "mo", "tu", "we", "th", "fr", "sa"];
const FULL_WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatOperatingScheduleText(days: number[]): string {
  if (!days || days.length === 0) return "Seasonal schedule";
  if (days.length === 7) return "Daily non-stop service";
  if (days.length === 1) return `Weekly service on ${FULL_WEEKDAY_NAMES[days[0]]}s`;
  if (days.length <= 3) {
    const names = days.map((d) => FULL_WEEKDAY_NAMES[d].slice(0, 3));
    return `${days.length}x weekly on ${names.join(", ")}`;
  }
  return `${days.length} days per week`;
}

export function RouteTimetable({ connection, onClose, onSwap }: RouteTimetableProps) {
  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showTimetable, setShowTimetable] = useState(true);
  const [selectedCarrierCode, setSelectedCarrierCode] = useState<string>("ALL");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();

  const prevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const carriers: OperatingCarrierRoute[] = useMemo(() => {
    if (connection.operatingCarriers.length > 0) {
      return connection.operatingCarriers;
    }
    return [
      {
        airlineCode: connection.origin.hubAirlines[0]?.slice(0, 2).toUpperCase() ?? "FL",
        airlineName: connection.origin.hubAirlines[0] ?? "Scheduled Airline",
        flightNumbers: [],
        dailyFrequencies: connection.dailyFlightsCount,
        weeklyFrequencies: connection.weeklyFlightsCount ?? 7,
        operatingDays: connection.operatingDays ?? [0, 1, 2, 3, 4, 5, 6],
        aircraftTypes: [],
      },
    ];
  }, [connection]);

  const activeCarrier = useMemo(() => {
    if (selectedCarrierCode === "ALL") return null;
    return carriers.find((c) => c.airlineCode === selectedCarrierCode) ?? null;
  }, [carriers, selectedCarrierCode]);

  // Operating weekdays set (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const operatingWeekdays = useMemo(() => {
    if (activeCarrier?.operatingDays?.length) {
      return new Set(activeCarrier.operatingDays);
    }
    const set = new Set<number>();
    for (const c of carriers) {
      for (const day of c.operatingDays ?? []) set.add(day);
    }
    if (set.size === 0 && connection.operatingDays?.length) {
      for (const day of connection.operatingDays) set.add(day);
    }
    return set.size > 0 ? set : new Set([0, 1, 2, 3, 4, 5, 6]);
  }, [activeCarrier, carriers, connection.operatingDays]);

  const operatingDaysList = useMemo(
    () => Array.from(operatingWeekdays).sort((a, b) => a - b),
    [operatingWeekdays],
  );

  // Calendar matrix calculation
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: Array<{
      day: number;
      hasFlight: boolean;
      isToday: boolean;
      dayOfWeek: number;
    } | null> = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dayOfWeek = new Date(year, month, d).getDay();
      const hasFlight = operatingWeekdays.has(dayOfWeek);
      const isToday =
        year === todayYear && month === todayMonth && d === todayDate;

      days.push({
        day: d,
        hasFlight,
        isToday,
        dayOfWeek,
      });
    }

    return days;
  }, [year, month, operatingWeekdays, todayYear, todayMonth, todayDate]);

  // Default selected day: first operating day on or after today in current view
  const defaultInitialDay = useMemo(() => {
    for (const slot of calendarDays) {
      if (slot && slot.hasFlight) {
        if (year === todayYear && month === todayMonth) {
          if (slot.day >= todayDate) return slot.day;
        } else {
          return slot.day;
        }
      }
    }
    return null;
  }, [calendarDays, month, todayDate, todayMonth, todayYear, year]);

  const [selectedDay, setSelectedDay] = useState<number | null>(() => defaultInitialDay);

  const distanceMiles = Math.round(connection.distanceKm * 0.621371);
  const flightDuration = formatDuration(connection.estimatedDurationMinutes);
  const haulMeta = HAUL_META[connection.haulCategory];
  const weeklyCount =
    connection.weeklyFlightsCount ?? connection.dailyFlightsCount * 7;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-surface rounded-t-2xl sm:rounded-none border-t sm:border-t-0 sm:border-r border-line/80 text-ink shadow-2xl backdrop-blur-xl">
      {/* Mobile Drawer Grab Handle */}
      <div className="flex items-center justify-center pt-2 pb-1 sm:hidden">
        <div className="h-1.5 w-12 rounded-full bg-line" />
      </div>

      {/* Top Banner with Clean Emerald Status Pill */}
      <div className="flex items-center justify-between border-b border-line/60 bg-surface-2/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="size-3.5" />
          <span>
            {weeklyCount} weekly flight{weeklyCount > 1 ? "s" : ""} · {formatOperatingScheduleText(operatingDaysList)}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            aria-label="Close route panel"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Route Header */}
      <div className="p-4 border-b border-line/60 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold tracking-tight text-ink">
            {connection.origin.city} → {connection.destination.city}
          </h2>
          {onSwap && (
            <button
              onClick={onSwap}
              className="flex size-7 items-center justify-center rounded-full border border-line/80 bg-surface-2 text-muted hover:text-ink hover:border-accent/40 transition-colors cursor-pointer"
              title="Swap origin and destination"
              aria-label="Swap route direction"
            >
              <ArrowRightLeft className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
          <span className="font-mono text-ink font-bold">
            {connection.origin.city} ({connection.origin.iata})
          </span>
          <span>→</span>
          <span className="font-mono text-ink font-bold">
            {connection.destination.city} ({connection.destination.iata})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-medium text-muted/80">
          <span>{distanceMiles.toLocaleString()} miles</span>
          <span>·</span>
          <span>{Math.round(connection.distanceKm).toLocaleString()} km</span>
          <span>·</span>
          <span className="flex items-center gap-1 font-semibold text-accent">
            <Clock className="size-3" />
            <span>{flightDuration}</span>
          </span>
          <span>·</span>
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted border border-line/60">
            {haulMeta.label}
          </span>
        </div>
      </div>

      {/* Operating Airlines Summary */}
      <div className="p-4 border-b border-line/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-subtle flex items-center gap-1.5">
            <Plane className="size-3 text-accent" />
            <span>Operating Airlines ({carriers.length})</span>
          </p>
          {carriers.length > 1 && (
            <button
              onClick={() => setSelectedCarrierCode("ALL")}
              className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors",
                selectedCarrierCode === "ALL"
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-ink",
              )}
            >
              View All
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {carriers.map((carrier) => {
            const isCarrierActive =
              selectedCarrierCode === "ALL" ||
              selectedCarrierCode === carrier.airlineCode;
            const carrierDays = carrier.operatingDays ?? connection.operatingDays ?? [];

            return (
              <button
                key={carrier.airlineCode}
                onClick={() =>
                  setSelectedCarrierCode((prev) =>
                    prev === carrier.airlineCode ? "ALL" : carrier.airlineCode,
                  )
                }
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-xs transition-all text-left cursor-pointer",
                  selectedCarrierCode === carrier.airlineCode
                    ? "border-accent/60 bg-accent-soft text-accent"
                    : isCarrierActive
                      ? "border-line/70 bg-surface-2/60 hover:border-accent/40 text-ink"
                      : "border-line/40 bg-surface-2/30 opacity-60 hover:opacity-100 text-muted",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-black text-accent shrink-0">
                    {carrier.airlineCode}
                  </span>
                  <span className="font-semibold text-ink truncate">
                    {carrier.airlineName}
                  </span>
                </div>
                <div className="text-right shrink-0 text-[10px] text-muted">
                  <span className="font-medium">
                    {carrierDays.length === 7
                      ? "Daily"
                      : carrierDays.length === 1
                        ? `Weekly (${FULL_WEEKDAY_NAMES[carrierDays[0]].slice(0, 3)})`
                        : `${carrierDays.length}x weekly`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timetable Calendar Toggle */}
      <div className="p-4 border-b border-line/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-accent" />
            <span className="text-xs font-extrabold text-ink">Service Frequency Calendar</span>
          </div>
          <button
            onClick={() => setShowTimetable((prev) => !prev)}
            className="text-[11px] font-bold text-accent hover:underline cursor-pointer"
          >
            {showTimetable ? "Hide calendar" : "Show calendar"}
          </button>
        </div>

        {/* Timetable Calendar Matrix with Beautiful Avi Colors */}
        {showTimetable && (
          <div className="mt-2 rounded-xl border border-line/70 bg-surface-2/40 p-3">
            {/* Month Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-line/50">
              <span className="text-xs font-black tracking-wide text-ink">
                {MONTH_NAMES[month]} {year}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={prevMonth}
                  className="flex size-6 items-center justify-center rounded border border-line bg-surface text-muted hover:text-ink transition-colors cursor-pointer"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="size-3" />
                </button>
                <button
                  onClick={nextMonth}
                  className="flex size-6 items-center justify-center rounded border border-line bg-surface text-muted hover:text-ink transition-colors cursor-pointer"
                  aria-label="Next month"
                >
                  <ChevronRight className="size-3" />
                </button>
              </div>
            </div>

            {/* Weekdays: su, mo, tu, we, th, fr, sa */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
              {WEEKDAY_NAMES.map((name) => (
                <span
                  key={name}
                  className="text-[9.5px] font-mono font-bold uppercase text-muted/70"
                >
                  {name}
                </span>
              ))}
            </div>

            {/* Days Grid: Green on operating days, clean muted on non-operating */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarDays.map((slot, index) => {
                if (!slot) {
                  return <div key={`empty-${index}`} className="h-7 w-7" />;
                }
                const isSelected = selectedDay === slot.day;
                const isOperating = slot.hasFlight;

                return (
                  <button
                    key={`day-${slot.day}`}
                    disabled={!isOperating}
                    onClick={() => isOperating && setSelectedDay(slot.day)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold transition-all mx-auto",
                      isOperating
                        ? isSelected
                          ? "bg-emerald-500 text-white font-extrabold shadow-md scale-105"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer"
                        : slot.isToday
                          ? "bg-surface-3 text-ink font-extrabold border border-line/80 cursor-default"
                          : "text-muted/40 cursor-default select-none",
                      slot.isToday && isOperating && !isSelected && "ring-1.5 ring-emerald-500/60",
                    )}
                    title={
                      isOperating
                        ? `${MONTH_NAMES[month]} ${slot.day} - Flight operates non-stop`
                        : `${MONTH_NAMES[month]} ${slot.day} - No scheduled flight`
                    }
                  >
                    {slot.day}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-2.5 pt-2 border-t border-line/40 flex items-center justify-between text-[10px] text-muted">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded bg-emerald-500/20 border border-emerald-500/50" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Flight operates
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded bg-surface-3 border border-line" />
                <span>Today</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded bg-transparent text-muted/40 font-mono text-[8px] flex items-center justify-center">
                  ·
                </span>
                <span>No flights</span>
              </div>
            </div>

            {/* Selected Day Projection */}
            {selectedDay && (
              <div className="mt-3 pt-2.5 border-t border-line/50 flex flex-col gap-1 text-[11px]">
                <div className="flex items-center justify-between font-bold text-ink">
                  <span>
                    {FULL_WEEKDAY_NAMES[new Date(year, month, selectedDay).getDay()]},{" "}
                    {MONTH_NAMES[month]} {selectedDay}, {year}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    Scheduled Service
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted text-[10px]">
                  <span>Estimated block time: ~{flightDuration}</span>
                  <span className="font-semibold text-ink">Non-stop</span>
                </div>
                <p className="text-[9.5px] text-subtle italic mt-0.5">
                  Operated by {activeCarrier?.airlineName ?? carriers.map((c) => c.airlineName).join(", ")}. Timetables may vary by season.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Flight Search & Booking Actions */}
      <div className="p-4 space-y-3">
        <Link
          href={`/search?origin=${encodeURIComponent(connection.origin.iata)}&dest=${encodeURIComponent(connection.destination.iata)}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent text-bg hover:opacity-90 font-extrabold text-xs py-3 shadow-lg transition-all hover:scale-[1.01]"
        >
          <Search className="size-3.5" />
          <span>Search Flights on Avi</span>
        </Link>

        <a
          href={`https://www.google.com/travel/flights?q=flights%20from%20${connection.origin.iata}%20to%20${connection.destination.iata}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 hover:bg-surface-3 text-ink font-bold text-xs py-2.5 transition-all"
        >
          <span>Check Prices on Google Flights</span>
          <ExternalLink className="size-3.5 text-muted" />
        </a>

        {/* Airport Directory & Explorer Links */}
        <div className="pt-2 space-y-1.5 text-[11px]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
            <Compass className="size-3 text-accent" />
            <span>More Aviation Resources</span>
          </p>
          <a
            href={`https://www.google.com/travel/flights?q=Flights%20from%20${connection.origin.city}%20to%20${connection.destination.city}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-accent hover:underline text-[10.5px]"
          >
            <ExternalLink className="size-2.5" />
            <span>
              All flights from {connection.origin.city} to {connection.destination.city}
            </span>
          </a>
          <a
            href={`https://www.google.com/travel/flights?q=Flights%20from%20${connection.origin.iata}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-accent hover:underline text-[10.5px]"
          >
            <ExternalLink className="size-2.5" />
            <span>All non-stop flights from {connection.origin.city} ({connection.origin.iata})</span>
          </a>
          <a
            href={`https://www.google.com/travel/flights?q=Flights%20to%20${connection.destination.iata}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-accent hover:underline text-[10.5px]"
          >
            <ExternalLink className="size-2.5" />
            <span>All flights to {connection.destination.city} ({connection.destination.iata})</span>
          </a>
        </div>
      </div>
    </div>
  );
}

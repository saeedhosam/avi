"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Droplets,
  Eye,
  Gauge,
  Loader2,
  Navigation,
  PlaneLanding,
  Snowflake,
  Sun,
  Umbrella,
  Wind,
} from "lucide-react";
import type {
  Airport,
  DestinationArrivalForecast,
  FlightCategory,
  RealtimeAirportWeather,
} from "@/lib/types";
import { cn, weatherIcon } from "@/lib/utils";

function WeatherGlyph({
  condition,
  className,
}: {
  condition: string;
  className?: string;
}) {
  const icon = weatherIcon(condition);
  const Icon =
    icon === "storm"
      ? CloudLightning
      : icon === "snow"
        ? Snowflake
        : icon === "rain"
          ? CloudRain
          : icon === "fog"
            ? CloudFog
            : icon === "cloud"
              ? Cloud
              : Sun;
  return <Icon className={className} />;
}

function categoryColor(category: string) {
  if (!category || category === "UNKNOWN" || category.includes("Not reported")) {
    return "#94A3B8";
  }
  if (category.includes("VFR") && !category.includes("MVFR")) return "#10B981";
  if (category.includes("MVFR")) return "#F59E0B";
  return "#EF4444";
}

export function DestinationWeatherCard({
  forecast,
  loading,
  error,
  className,
}: {
  forecast: DestinationArrivalForecast | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
}) {
  const [tab, setTab] = useState<"hourly" | "daily" | "advisory">("hourly");

  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-[220px] items-center justify-center rounded-2xl border border-line bg-surface",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2 text-muted">
          <Loader2 className="size-5 animate-spin text-accent" />
          <p className="text-[11px] font-semibold">
            Fetching destination arrival weather…
          </p>
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noreferrer"
            className="text-[9px] text-subtle underline-offset-2 hover:underline"
          >
            Weather data by Open-Meteo
          </a>
        </div>
      </div>
    );
  }

  if (!forecast) {
    return (
      <div
        className={cn(
          "flex min-h-[220px] items-center justify-center rounded-2xl border border-delayed/30 bg-delayed/10",
          className,
        )}
      >
        <div className="max-w-md px-4 text-center">
          <p className="text-[11px] font-bold text-delayed">
            Arrival weather unavailable
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            {error ??
              "Open-Meteo did not return a complete forecast for the arrival time. No estimated weather is substituted."}
          </p>
        </div>
      </div>
    );
  }

  const catColor = categoryColor(forecast.advisory.flightCategory);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-surface",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line/60 p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-accent">
            <Sun className="size-4.5" />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">
              Destination Arrival Weather
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-accent-2">
              {forecast.airportCity} ({forecast.airportCode}) · Arrival planning
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-accent/30 bg-accent-soft px-1.5 py-1 text-[8px] font-bold text-accent">
            OPEN-METEO MODEL
          </span>
          <span
            className="rounded-md border px-1.5 py-1 text-[8px] font-bold"
            style={{
              color: catColor,
              borderColor: `${catColor}55`,
              backgroundColor: `${catColor}15`,
            }}
          >
            {forecast.advisory.flightCategory.replace(/ \(.*/, "")}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="rounded-xl border border-accent/30 bg-surface-2 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-accent">
                At estimated arrival · {forecast.arrivalTime}
              </p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-3xl font-black leading-none text-ink">
                  {forecast.arrivalTempC}°C
                </p>
                <p className="mb-0.5 text-[11px] text-muted">
                  / {forecast.arrivalTempF}°F
                </p>
              </div>
              <p className="mt-1 text-xs font-semibold text-accent-2">
                {forecast.arrivalCondition}
              </p>
            </div>
            <WeatherGlyph
              condition={forecast.arrivalCondition}
              className="size-9 text-ink"
            />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line/60 pt-2.5">
            <WeatherMetric
              icon={<Umbrella className="size-3" />}
              label="Precip"
              value={`${forecast.precipitationChance}%`}
            />
            <WeatherMetric
              icon={<Wind className="size-3" />}
              label="Wind"
              value={forecast.windCondition}
            />
            <WeatherMetric
              icon={<Eye className="size-3" />}
              label="Visibility"
              value={forecast.visibility}
            />
            <WeatherMetric
              icon={<Droplets className="size-3" />}
              label="Humidity"
              value={`${forecast.humidity}%`}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {(
            [
              { value: "hourly", label: "Hourly at arrival" },
              { value: "daily", label: "3-day outlook" },
              { value: "advisory", label: "Advisories" },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors",
                tab === item.value
                  ? "bg-accent text-[color:var(--bg)]"
                  : "text-muted hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "hourly" && (
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {forecast.hourlyForecast.map((hour) => (
              <div
                key={`${hour.time}-${hour.isArrivalTarget}`}
                className={cn(
                  "rounded-lg border p-2",
                  hour.isArrivalTarget
                    ? "border-accent/60 bg-accent-soft"
                    : "border-line/60 bg-surface-2/70",
                )}
              >
                <div className="flex items-center justify-between">
                  <p
                    className={cn(
                      "text-[10px] font-bold tabular",
                      hour.isArrivalTarget ? "text-accent" : "text-ink",
                    )}
                  >
                    {hour.time}
                  </p>
                  <WeatherGlyph
                    condition={hour.condition}
                    className={cn(
                      "size-3.5",
                      hour.isArrivalTarget ? "text-accent" : "text-muted",
                    )}
                  />
                </div>
                <p className="mt-1 text-xs font-bold text-ink">{hour.tempC}°C</p>
                <p className="truncate text-[8px] text-subtle">
                  {hour.condition}
                </p>
                <div className="mt-1 flex items-center justify-between text-[8px] text-subtle">
                  <span className="flex items-center gap-0.5">
                    <Umbrella className="size-2.5" />
                    {hour.precipProbabilityPercent}%
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Wind className="size-2.5" />
                    {hour.windSpeedKnots}kt
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "daily" && (
          <div className="mt-2.5 space-y-1.5">
            {forecast.dailyForecast.map((day, index) => (
              <div
                key={`${day.dayName}-${day.dateString}`}
                className="flex items-center gap-2 rounded-lg border border-line/60 bg-surface-2/70 px-2.5 py-2"
              >
                <div className="w-14 shrink-0">
                  <p className="text-[10px] font-bold text-ink">
                    {index === 0 ? "Today" : day.dayName}
                  </p>
                  <p className="text-[8px] text-subtle">{day.dateString}</p>
                </div>
                <WeatherGlyph condition={day.condition} className="size-4 text-muted" />
                <p className="min-w-0 flex-1 truncate text-[9px] text-muted">
                  {day.condition}
                </p>
                <p className="shrink-0 text-[10px] font-bold text-ink tabular">
                  {day.tempHighC}° <span className="text-subtle">{day.tempLowC}°</span>
                </p>
                <span className="flex w-8 shrink-0 items-center justify-end gap-0.5 text-[8px] text-accent-2">
                  <Umbrella className="size-2.5" />
                  {day.precipProbabilityPercent}%
                </span>
              </div>
            ))}
            <div className="rounded-lg border border-line/60 bg-surface-2/50 px-2.5 py-2">
              <p className="label-caps text-subtle">Packing advice</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                {forecast.packingAdvice}
              </p>
            </div>
          </div>
        )}

        {tab === "advisory" && (
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            <AdvisoryTile
              icon={<PlaneLanding className="size-3.5" />}
              label="Flight category"
              value={forecast.advisory.flightCategory}
              color={catColor}
            />
            <AdvisoryTile
              icon={<Navigation className="size-3.5" />}
              label="Crosswind"
              value={
                forecast.advisory.crosswindKnots != null
                  ? `${forecast.advisory.crosswindKnots} kt${
                      forecast.advisory.crosswindRisk
                        ? ` · ${forecast.advisory.crosswindRisk}`
                        : ""
                    }`
                  : "Not reported"
              }
            />
            <AdvisoryTile
              icon={<Eye className="size-3.5" />}
              label="Runway visual range"
              value={forecast.advisory.runwayVisualRange ?? "Not reported"}
            />
            <AdvisoryTile
              icon={<Gauge className="size-3.5" />}
              label="Arrival notice"
              value={forecast.advisory.arrivalNotice ?? "Not reported"}
            />
            <div className="rounded-lg border border-dashed border-line bg-surface-2/50 px-2.5 py-2 sm:col-span-2">
              <p className="label-caps text-subtle">Arrival preparation</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                {forecast.packingAdvice}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WeatherMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-subtle">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 truncate text-[9px] font-semibold text-ink">{value}</p>
    </div>
  );
}

function AdvisoryTile({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-line/60 bg-surface-2/70 p-2.5">
      <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-subtle">
        <span style={{ color: color ?? "var(--accent)" }}>{icon}</span>
        {label}
      </p>
      <p
        className="mt-1 text-[10px] font-semibold leading-relaxed"
        style={{ color: color ?? "var(--text)" }}
      >
        {value}
      </p>
    </div>
  );
}

export function AirportWeatherCard({
  origin,
  destination,
  className,
}: {
  origin: Airport;
  destination: Airport;
  className?: string;
}) {
  const [weather, setWeather] = useState<
    Record<string, RealtimeAirportWeather>
  >({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetch(
      `/api/weather/airports?codes=${encodeURIComponent(origin.code)},${encodeURIComponent(destination.code)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((response) => response.json())
      .then((data: { live?: boolean; weather?: Record<string, RealtimeAirportWeather> }) => {
        if (data.live && data.weather) setWeather(data.weather);
        else setFailed(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [origin.code, destination.code]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-surface",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
        <p className="text-sm font-bold text-ink">Airport weather conditions</p>
        <span
          className={cn(
            "flex items-center gap-1 text-[9px] font-bold",
            failed ? "text-delayed" : "text-landed",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              failed ? "bg-delayed" : "animate-pulse-dot bg-landed",
            )}
          />
          {loading
            ? "FETCHING OPEN-METEO"
            : failed
              ? "WEATHER UNAVAILABLE"
              : "OPEN-METEO MODEL"}
        </span>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        <AirportWeatherPane
          airport={origin}
          label="DEPARTURE"
          live={weather[origin.code]}
          loading={loading}
        />
        <AirportWeatherPane
          airport={destination}
          label="ARRIVAL"
          live={weather[destination.code]}
          loading={loading}
        />
      </div>
    </div>
  );
}

function AirportWeatherPane({
  airport,
  label,
  live,
  loading,
}: {
  airport: Airport;
  label: string;
  live?: RealtimeAirportWeather;
  loading: boolean;
}) {
  const category = live?.flightCategory;

  return (
    <div className="rounded-xl border border-line/70 bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <p className="label-caps text-subtle">{label}</p>
        <p className="font-mono text-xs font-black text-accent">{airport.code}</p>
      </div>
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-[10px] text-muted">
          <Loader2 className="size-3 animate-spin text-accent" />
          Loading live conditions…
        </div>
      ) : live ? (
        <>
          <div className="mt-1.5 flex items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold text-ink">
                {live.tempC}°C{" "}
                <span className="text-[10px] font-medium text-muted">
                  / {live.tempF}°F
                </span>
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-accent-2">
                {live.condition}
              </p>
            </div>
            {category && (
              <span
                className="rounded-md border px-1.5 py-0.5 text-[8px] font-bold"
                style={{
                  color: categoryColor(category),
                  borderColor: `${categoryColor(category)}55`,
                  backgroundColor: `${categoryColor(category)}15`,
                }}
              >
                {category}
              </span>
            )}
          </div>
          <div className="mt-2 space-y-1 border-t border-line/50 pt-2 text-[10px] text-muted">
            <p className="flex items-center gap-1.5">
              <Wind className="size-3 text-subtle" /> {live.wind}
            </p>
            <p className="flex items-center gap-1.5">
              <Eye className="size-3 text-subtle" /> Visibility: {live.visibility}
            </p>
            <p className="flex items-center gap-1.5">
              <Droplets className="size-3 text-subtle" /> Humidity: {live.humidity}%
            </p>
            {live.metarRaw && (
              <p className="mt-1 rounded-md bg-surface px-1.5 py-1 font-mono text-[8px] leading-relaxed text-subtle">
                {live.metarRaw}
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[10px] leading-relaxed text-subtle">
          Live weather is unavailable for {airport.code}. No stale weather is
          displayed.
        </p>
      )}
    </div>
  );
}

export function FlightCategoryBadge({
  category,
}: {
  category: FlightCategory;
}) {
  return (
    <span
      className="rounded-md border px-1.5 py-0.5 text-[8px] font-bold"
      style={{
        color: categoryColor(category),
        borderColor: `${categoryColor(category)}55`,
        backgroundColor: `${categoryColor(category)}15`,
      }}
    >
      {category}
    </span>
  );
}

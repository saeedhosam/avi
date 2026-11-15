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
import { PALETTE } from "@/lib/palette";
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
    return PALETTE.weather.UNKNOWN;
  }
  if (category.includes("VFR") && !category.includes("MVFR")) {
    return PALETTE.weather.VFR;
  }
  if (category.includes("MVFR")) return PALETTE.weather.MVFR;
  return PALETTE.weather.IFR;
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
          "flex min-h-[220px] items-center justify-center rounded-xl border border-line/70 bg-surface/80",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <Loader2 className="size-5 animate-spin text-accent" />
          <p className="text-sm text-muted">
            Fetching destination arrival weather…
          </p>
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-subtle underline-offset-2 hover:underline"
          >
            Weather by Open-Meteo
          </a>
        </div>
      </div>
    );
  }

  if (!forecast) {
    return (
      <div
        className={cn(
          "flex min-h-[220px] items-center justify-center rounded-xl border border-delayed/30 bg-delayed/8",
          className,
        )}
      >
        <div className="max-w-sm px-6 text-center">
          <p className="text-sm font-medium text-delayed">
            Arrival weather unavailable
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
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
        "overflow-hidden rounded-xl border border-line/70 bg-surface/80",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Sun className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink">
              Destination weather
            </p>
            <p className="truncate text-xs text-muted">
              {forecast.airportCity} ({forecast.airportCode}) · arrival planning
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-subtle">
            Open-Meteo
          </span>
          <span
            className="rounded-md border px-2 py-1 text-xs font-medium"
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
        <div className="rounded-lg bg-surface-2/50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-subtle">
                At estimated arrival · {forecast.arrivalTime}
              </p>
              <div className="mt-1.5 flex items-end gap-2">
                <p className="text-3xl font-semibold leading-none tracking-tight text-ink">
                  {forecast.arrivalTempC}°C
                </p>
                <p className="mb-1 text-xs text-subtle">
                  {forecast.arrivalTempF}°F
                </p>
              </div>
              <p className="mt-1.5 text-[13px] font-medium text-accent-2">
                {forecast.arrivalCondition}
              </p>
            </div>
            <WeatherGlyph
              condition={forecast.arrivalCondition}
              className="size-8 text-muted"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-line/50 pt-3 sm:grid-cols-4">
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

        <div className="mt-4 flex items-center gap-1 rounded-lg border border-line/70 bg-surface-2/50 p-1">
          {(
            [
              { value: "hourly", label: "Hourly" },
              { value: "daily", label: "3-day" },
              { value: "advisory", label: "Advisories" },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              aria-pressed={tab === item.value}
              className={cn(
                "min-h-9 flex-1 rounded-md px-2 text-xs font-medium transition-colors",
                tab === item.value
                  ? "bg-surface-4 text-ink"
                  : "text-muted hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "hourly" && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {forecast.hourlyForecast.map((hour) => (
              <div
                key={`${hour.time}-${hour.isArrivalTarget}`}
                className={cn(
                  "rounded-lg px-2.5 py-2",
                  hour.isArrivalTarget
                    ? "bg-accent-soft ring-1 ring-accent/35"
                    : "bg-surface-2/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <p
                    className={cn(
                      "font-mono text-xs tabular",
                      hour.isArrivalTarget
                        ? "font-semibold text-accent"
                        : "text-muted",
                    )}
                  >
                    {hour.time}
                  </p>
                  <WeatherGlyph
                    condition={hour.condition}
                    className={cn(
                      "size-3.5",
                      hour.isArrivalTarget ? "text-accent" : "text-subtle",
                    )}
                  />
                </div>
                <p className="mt-1 text-sm font-medium text-ink">
                  {hour.tempC}°C
                </p>
                <p className="truncate text-xs text-subtle">{hour.condition}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-subtle">
                  <span className="flex items-center gap-1">
                    <Umbrella className="size-3" />
                    {hour.precipProbabilityPercent}%
                  </span>
                  <span className="flex items-center gap-1">
                    <Wind className="size-3" />
                    {hour.windSpeedKnots}kt
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "daily" && (
          <div className="mt-3 space-y-1.5">
            {forecast.dailyForecast.map((day, index) => (
              <div
                key={`${day.dayName}-${day.dateString}`}
                className="flex items-center gap-3 rounded-lg bg-surface-2/50 px-3 py-2.5"
              >
                <div className="w-16 shrink-0">
                  <p className="text-[13px] font-medium text-ink">
                    {index === 0 ? "Today" : day.dayName}
                  </p>
                  <p className="text-xs text-subtle">{day.dateString}</p>
                </div>
                <WeatherGlyph
                  condition={day.condition}
                  className="size-4 shrink-0 text-subtle"
                />
                <p className="min-w-0 flex-1 truncate text-xs text-muted">
                  {day.condition}
                </p>
                <p className="shrink-0 font-mono text-xs tabular text-ink">
                  {day.tempHighC}°{" "}
                  <span className="text-subtle">{day.tempLowC}°</span>
                </p>
                <span className="flex w-10 shrink-0 items-center justify-end gap-1 font-mono text-xs text-accent-2">
                  <Umbrella className="size-3" />
                  {day.precipProbabilityPercent}%
                </span>
              </div>
            ))}
            <div className="rounded-lg bg-surface-2/50 px-3 py-2.5">
              <p className="label-caps text-subtle">Packing advice</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                {forecast.packingAdvice}
              </p>
            </div>
          </div>
        )}

        {tab === "advisory" && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
            <div className="rounded-lg bg-surface-2/50 px-3 py-2.5 sm:col-span-2">
              <p className="label-caps text-subtle">Arrival preparation</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
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
      <p className="flex items-center gap-1 text-xs text-subtle">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-ink">{value}</p>
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
    <div className="rounded-lg bg-surface-2/50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs text-subtle">
        <span style={{ color: color ?? "var(--accent)" }}>{icon}</span>
        {label}
      </p>
      <p
        className="mt-1 text-[13px] font-medium leading-relaxed"
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
        "overflow-hidden rounded-xl border border-line/70 bg-surface/80",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
        <p className="text-[15px] font-semibold text-ink">Airport weather</p>
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs",
            failed ? "text-delayed" : "text-muted",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              failed ? "bg-delayed" : "animate-pulse-dot bg-landed",
            )}
          />
          {loading
            ? "Fetching"
            : failed
              ? "Unavailable"
              : "Open-Meteo"}
        </span>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        <AirportWeatherPane
          airport={origin}
          label="Departure"
          live={weather[origin.code]}
          loading={loading}
        />
        <AirportWeatherPane
          airport={destination}
          label="Arrival"
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
    <div className="rounded-lg bg-surface-2/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-subtle">{label}</p>
        <p className="font-mono text-xs font-medium text-ink">{airport.code}</p>
      </div>
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-muted">
          <Loader2 className="size-3.5 animate-spin text-accent" />
          Loading conditions…
        </div>
      ) : live ? (
        <>
          <div className="mt-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-lg font-semibold text-ink">
                {live.tempC}°C{" "}
                <span className="text-xs font-normal text-subtle">
                  {live.tempF}°F
                </span>
              </p>
              <p className="text-xs text-accent-2">{live.condition}</p>
            </div>
            {category && (
              <span
                className="rounded-md border px-2 py-1 text-xs font-medium"
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
          <div className="mt-2.5 space-y-1 border-t border-line/50 pt-2.5 text-xs text-muted">
            <p className="flex items-center gap-1.5">
              <Wind className="size-3 text-subtle" /> {live.wind}
            </p>
            <p className="flex items-center gap-1.5">
              <Eye className="size-3 text-subtle" /> {live.visibility}
            </p>
            <p className="flex items-center gap-1.5">
              <Droplets className="size-3 text-subtle" /> {live.humidity}% humidity
            </p>
          </div>
        </>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-subtle">
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
      className="rounded-md border px-2 py-1 text-xs font-medium"
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

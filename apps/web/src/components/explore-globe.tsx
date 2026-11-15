"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { LngLatBounds, type MapLayerMouseEvent } from "maplibre-gl";
import {
  gatewayRoutesResponseSchema,
  type DirectFlightConnection,
  type DestinationArrivalForecast,
  type HaulCategory,
} from "@avi/shared";
import { useMapLibre } from "@/lib/use-maplibre";
import {
  collection,
  ensureLayer,
  lineFeature,
  pointFeature,
  setGeoJson,
} from "@/lib/maplibre";
import { routeCoordinates } from "@/lib/geo";
import { PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { UpgradeCta } from "@/components/upgrade-cta";

const HAUL_COLORS: Record<string, string> = {
  SHORT_HAUL: PALETTE.haul.SHORT_HAUL,
  MEDIUM_HAUL: PALETTE.haul.MEDIUM_HAUL,
  LONG_HAUL: PALETTE.haul.LONG_HAUL,
};

const HAUL_LABELS: Record<HaulCategory, string> = {
  ALL: "All ranges",
  SHORT_HAUL: "Short-haul",
  MEDIUM_HAUL: "Medium-haul",
  LONG_HAUL: "Long-haul",
};

export interface ExploreGlobeProps {
  iata: string;
  airportName: string;
  city: string;
  /**
   * Route network rendered by the server. `null` means the gateway was
   * unconfigured or unreachable; the client then retries on mount.
   */
  initialRoutes?: DirectFlightConnection[] | null;
}

export function ExploreGlobe({
  iata,
  airportName,
  city,
  initialRoutes,
}: ExploreGlobeProps) {
  const seededCount = initialRoutes?.length ?? 0;
  const [connections, setConnections] = useState<DirectFlightConnection[]>(
    initialRoutes ?? [],
  );
  const [loading, setLoading] = useState(seededCount === 0);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [airline, setAirline] = useState<string | null>(null);
  const [haul, setHaul] = useState<HaulCategory>("ALL");
  const [selected, setSelected] = useState<DirectFlightConnection | null>(
    initialRoutes?.[0] ?? null,
  );
  const [weather, setWeather] = useState<DestinationArrivalForecast | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const { containerRef, map } = useMapLibre({
    center: [15, 22],
    zoom: 2.1,
    minZoom: 1,
    maxZoom: 8,
  });

  useEffect(() => {
    // The server already supplied cached gateway data for this render. Only
    // refetch after the user asks (refresh button) or when the first render
    // was an honest empty/unavailable state.
    if (refreshToken === 0 && seededCount > 0) return;

    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/gateway/airports/${iata}/routes`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body && typeof body.message === "string"
              ? body.message
              : `Gateway returned HTTP ${response.status}`,
          );
        }
        const parsed = gatewayRoutesResponseSchema.safeParse(body);
        if (!parsed.success) {
          throw new Error("The gateway returned an invalid route payload.");
        }
        return parsed.data.routes;
      })
      .then((routes) => {
        if (!active) return;
        setConnections(routes);
        setSelected((current) =>
          current && routes.some((route) => route.id === current.id)
            ? current
            : routes[0] ?? null,
        );
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Live route data is temporarily unavailable.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [iata, refreshToken, seededCount]);

  const origin = connections[0]?.origin ?? null;

  const airlines = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    for (const connection of connections) {
      for (const carrier of connection.operatingCarriers) {
        const key = carrier.airlineCode || carrier.airlineName;
        const current = map.get(key);
        if (current) current.count += 1;
        else
          map.set(key, {
            code: carrier.airlineCode,
            name: carrier.airlineName,
            count: 1,
          });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [connections]);

  const visible = useMemo(
    () =>
      connections.filter((connection) => {
        if (haul !== "ALL" && connection.haulCategory !== haul) return false;
        if (airline) {
          return connection.operatingCarriers.some(
            (carrier) =>
              carrier.airlineCode === airline || carrier.airlineName === airline,
          );
        }
        return true;
      }),
    [connections, haul, airline],
  );

  // Keep the inspected destination inside the active filter set. Changing a
  // filter must not leave a hidden route open in the detail panel.
  useEffect(() => {
    if (!visible.length) {
      setSelected(null);
      return;
    }
    setSelected((current) =>
      current && visible.some((route) => route.id === current.id)
        ? current
        : (visible[0] ?? null),
    );
  }, [visible]);

  // Globe projection + route layers.
  useEffect(() => {
    if (!map) return;
    try {
      map.setProjection({ type: "globe" });
    } catch {
      // Older/embedded MapLibre builds may not expose globe; the map still works.
    }
  }, [map]);

  useEffect(() => {
    if (!map || !origin) return;
    const features = visible.map((connection) =>
      lineFeature(
        routeCoordinates(
          [origin.longitude, origin.latitude],
          [connection.destination.longitude, connection.destination.latitude],
        ) as [number, number][],
        {
          id: connection.id,
          haul: connection.haulCategory,
          destination: connection.destination.iata,
        },
      ),
    );
    setGeoJson(map, "avi-explore-routes", collection(features));
    ensureLayer(map, {
      id: "avi-explore-route-lines",
      type: "line",
      source: "avi-explore-routes",
      paint: {
        "line-color": [
          "match",
          ["get", "haul"],
          "SHORT_HAUL",
          HAUL_COLORS.SHORT_HAUL,
          "MEDIUM_HAUL",
          HAUL_COLORS.MEDIUM_HAUL,
          "LONG_HAUL",
          HAUL_COLORS.LONG_HAUL,
          PALETTE.haul.ALL,
        ],
        "line-width": 1.4,
        "line-opacity": 0.82,
      },
    });

    setGeoJson(
      map,
      "avi-explore-points",
      collection(
        visible.map((connection) =>
          pointFeature(
            connection.id,
            [connection.destination.longitude, connection.destination.latitude],
            {
              id: connection.id,
              iata: connection.destination.iata,
              city: connection.destination.city,
              haul: connection.haulCategory,
            },
          ),
        ),
      ),
    );
    ensureLayer(map, {
      id: "avi-explore-point-circles",
      type: "circle",
      source: "avi-explore-points",
      paint: {
        "circle-radius": 4.2,
        "circle-color": [
          "match",
          ["get", "haul"],
          "SHORT_HAUL",
          HAUL_COLORS.SHORT_HAUL,
          "MEDIUM_HAUL",
          HAUL_COLORS.MEDIUM_HAUL,
          "LONG_HAUL",
          HAUL_COLORS.LONG_HAUL,
          PALETTE.haul.ALL,
        ],
        "circle-stroke-color": "rgba(226,239,255,0.75)",
        "circle-stroke-width": 0.8,
      },
    });
    ensureLayer(map, {
      id: "avi-explore-point-labels",
      type: "symbol",
      source: "avi-explore-points",
      minzoom: 2,
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": PALETTE.text,
        "text-halo-color": PALETTE.background,
        "text-halo-width": 1.4,
      },
    });

    const bounds = new LngLatBounds();
    bounds.extend([origin.longitude, origin.latitude]);
    for (const connection of visible) {
      bounds.extend([
        connection.destination.longitude,
        connection.destination.latitude,
      ]);
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 70, duration: 0, maxZoom: 3.1 });
    }
  }, [map, origin, visible]);

  useEffect(() => {
    if (!map || !selected || !origin) return;
    setGeoJson(
      map,
      "avi-explore-selected",
      collection([
        lineFeature(
          routeCoordinates(
            [origin.longitude, origin.latitude],
            [selected.destination.longitude, selected.destination.latitude],
          ) as [number, number][],
          { id: selected.id },
        ),
      ]),
    );
    ensureLayer(map, {
      id: "avi-explore-selected-line",
      type: "line",
      source: "avi-explore-selected",
      paint: {
        "line-color": PALETTE.accent,
        "line-width": 3.4,
        "line-opacity": 0.95,
      },
    });
  }, [map, selected, origin]);

  useEffect(() => {
    if (!map) return;
    const onClick = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id !== "string") return;
      const connection = visible.find((item) => item.id === id);
      if (connection) setSelected(connection);
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", "avi-explore-point-circles", onClick);
    map.on("click", "avi-explore-route-lines", onClick);
    map.on("mouseenter", "avi-explore-point-circles", onEnter);
    map.on("mouseleave", "avi-explore-point-circles", onLeave);
    return () => {
      map.off("click", "avi-explore-point-circles", onClick);
      map.off("click", "avi-explore-route-lines", onClick);
      map.off("mouseenter", "avi-explore-point-circles", onEnter);
      map.off("mouseleave", "avi-explore-point-circles", onLeave);
    };
  }, [map, visible]);

  useEffect(() => {
    if (!selected) {
      setWeather(null);
      return;
    }
    let active = true;
    setWeather(null);
    setWeatherLoading(true);
    const params = new URLSearchParams({
      lat: String(selected.destination.latitude),
      lon: String(selected.destination.longitude),
      code: selected.destination.iata,
      name: selected.destination.name,
      city: selected.destination.city,
      country: selected.destination.country,
      arrival: "12:00",
    });
    fetch(`/api/weather?${params.toString()}`)
      .then((response) => response.json())
      .then((body: { live?: boolean; forecast?: DestinationArrivalForecast }) => {
        if (!active) return;
        setWeather(body.live && body.forecast ? body.forecast : null);
      })
      .catch(() => {
        if (active) setWeather(null);
      })
      .finally(() => {
        if (active) setWeatherLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative overflow-hidden rounded-xl border border-line/70 bg-surface">
        <div ref={containerRef} className="h-[440px] w-full sm:h-[540px] xl:h-[620px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
          <div className="rounded-lg border border-line/70 bg-bg/85 px-3 py-2 backdrop-blur">
            <p className="label-caps text-accent">Globe · live cache</p>
            <p className="mt-1 text-sm font-medium text-ink">
              {origin ? `${origin.city} (${origin.iata})` : city}
            </p>
            <p className="text-xs text-subtle">
              {loading && connections.length === 0
                ? "Loading direct network…"
                : `${visible.length} of ${connections.length} direct destinations`}
            </p>
            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              disabled={loading}
              className="pointer-events-auto mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line/70 px-2 text-xs font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
          <div className="pointer-events-auto flex max-w-[70%] flex-wrap justify-end gap-1.5">
            {(["ALL", "SHORT_HAUL", "MEDIUM_HAUL", "LONG_HAUL"] as HaulCategory[]).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setHaul(option)}
                  aria-pressed={haul === option}
                  className={cn(
                    "min-h-9 rounded-md border px-2.5 text-xs font-medium backdrop-blur transition-colors",
                    haul === option
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-line/70 bg-bg/80 text-muted hover:text-ink",
                  )}
                >
                  {option === "ALL" ? "All" : HAUL_LABELS[option]}
                </button>
              ),
            )}
          </div>
        </div>
        {error ? (
          <div className="absolute inset-x-3 bottom-3 rounded-lg border border-cancelled/30 bg-surface/95 p-3.5 text-sm leading-relaxed text-ink backdrop-blur sm:inset-x-4 sm:bottom-4">
            {error} The explorer never falls back to a static route dataset.
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-line/70 bg-surface/80 p-4">
          <p className="label-caps text-subtle">Filter by airline</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setAirline(null)}
              aria-pressed={!airline}
              className={cn(
                "min-h-9 rounded-md border px-2.5 text-xs font-medium",
                !airline
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-line/70 text-muted hover:text-ink",
              )}
            >
              All
            </button>
            {airlines.map((carrier) => {
              const code = carrier.code || carrier.name;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setAirline(code)}
                  aria-pressed={airline === code}
                  className={cn(
                    "min-h-9 rounded-md border px-2.5 text-xs font-medium",
                    airline === code
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-line/70 text-muted hover:text-ink",
                  )}
                >
                  {code} · {carrier.count}
                </button>
              );
            })}
          </div>
        </section>

        {selected ? (
          <section className="rounded-xl border border-line/70 bg-surface/80 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-semibold tracking-[0.14em] text-accent">
                  {selected.destination.iata}
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
                  {selected.destination.city}
                </h2>
                <p className="text-[13px] text-muted">{selected.destination.name}</p>
              </div>
              <span className="rounded-md border border-line/70 px-2 py-1 text-xs font-medium tabular text-muted">
                {Math.round(selected.distanceKm).toLocaleString()} km
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <div>
                <dt className="text-xs text-subtle">Duration</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selected.durationFormatted ? `~${selected.durationFormatted}` : "Not reported"}
                  {selected.durationEstimated ? (
                    <span className="ml-1 text-xs font-normal text-subtle">
                      estimate
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Daily flights</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selected.dailyFlightsCount ?? "Not reported"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Airlines</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selected.operatingCarriers.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Weather</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {weatherLoading
                    ? "Loading…"
                    : weather?.dataAvailable
                      ? `${weather.arrivalTempC}°C · ${weather.arrivalCondition}`
                      : "Unavailable"}
                </dd>
              </div>
            </dl>
            {weather?.dataAvailable ? (
              <p className="mt-2.5 text-xs leading-relaxed text-muted">
                {weather.windCondition} · {weather.visibility} ·{" "}
                {weather.advisory.arrivalNotice}
              </p>
            ) : null}
            <div className="mt-4 grid gap-2">
              <Link
                href={`/cabin/B77W/14A`}
                className="rounded-lg bg-accent px-3 py-2.5 text-center text-[13px] font-semibold text-[color:var(--bg)]"
              >
                Track &amp; unlock 3D cabin in app
              </Link>
              <a
                href="aeroquest://cabin/B77W/14A"
                className="rounded-lg border border-line/70 px-3 py-2.5 text-center text-[13px] font-medium text-ink"
              >
                Open AeroQuest mobile
              </a>
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-line/70 bg-surface/80 p-4 text-xs leading-relaxed text-muted">
          <p className="label-caps text-subtle">What this page shows</p>
          <p className="mt-2">
            Non-stop destinations from {airportName}. Distances are computed from
            verified airport coordinates; durations are distance-derived
            estimates unless marked as a schedule. Route statistics are cached
            for 7 days on the Hetzner gateway.
          </p>
          <p className="mt-2">
            Missing providers, weather, or airline frequencies are shown as
            unavailable. AeroQuest never fills them with a guessed value.
          </p>
        </section>

        <UpgradeCta
          title="Keep the globe. Unlock the trip."
          body="The route explorer stays free. AeroQuest Pro or the $4.99 Single-Trip Pass adds live tracking, saved trip cabins, Sprint Mode, and the offline in-flight HUD."
        />
      </div>
    </div>
  );
}

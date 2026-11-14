"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

const HAUL_COLORS: Record<string, string> = {
  SHORT_HAUL: "#34d399",
  MEDIUM_HAUL: "#fbbf24",
  LONG_HAUL: "#f472b6",
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
}

export function ExploreGlobe({ iata, airportName, city }: ExploreGlobeProps) {
  const [connections, setConnections] = useState<DirectFlightConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [airline, setAirline] = useState<string | null>(null);
  const [haul, setHaul] = useState<HaulCategory>("ALL");
  const [selected, setSelected] = useState<DirectFlightConnection | null>(null);
  const [weather, setWeather] = useState<DestinationArrivalForecast | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const { containerRef, map } = useMapLibre({
    center: [15, 22],
    zoom: 2.1,
    minZoom: 1,
    maxZoom: 8,
  });

  useEffect(() => {
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
        setSelected((current) => current ?? routes[0] ?? null);
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
  }, [iata]);

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
          "#22d3ee",
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
          "#22d3ee",
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
        "text-size": 9,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#e2e8f0",
        "text-halo-color": "#050b14",
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
        "line-color": "#f8fafc",
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface">
        <div ref={containerRef} className="h-[560px] w-full" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="rounded-2xl border border-line/80 bg-bg/85 px-3 py-2 backdrop-blur">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent">
              Globe projection · live gateway cache
            </p>
            <p className="mt-0.5 text-sm font-semibold text-ink">
              {origin ? `${origin.city} (${origin.iata})` : city}
            </p>
            <p className="text-[10px] text-subtle">
              {loading
                ? "Loading direct network…"
                : `${visible.length} of ${connections.length} direct destinations`}
            </p>
          </div>
          <div className="pointer-events-auto flex max-w-[70%] flex-wrap justify-end gap-1.5">
            {(["ALL", "SHORT_HAUL", "MEDIUM_HAUL", "LONG_HAUL"] as HaulCategory[]).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setHaul(option)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors",
                    haul === option
                      ? "border-accent bg-accent text-[color:var(--bg)]"
                      : "border-line bg-bg/80 text-muted hover:text-ink",
                  )}
                >
                  {option === "ALL" ? "All" : HAUL_LABELS[option]}
                </button>
              ),
            )}
          </div>
        </div>
        {error ? (
          <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-[#f87171]/40 bg-[#2a0f14]/95 p-4 text-sm text-[#fecaca] backdrop-blur">
            {error} The explorer never falls back to a static route dataset.
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <section className="rounded-3xl border border-line bg-surface p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent">
            Filter by airline
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setAirline(null)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-bold",
                !airline
                  ? "border-accent bg-accent text-[color:var(--bg)]"
                  : "border-line text-muted hover:text-ink",
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
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[10px] font-bold",
                    airline === code
                      ? "border-accent bg-accent text-[color:var(--bg)]"
                      : "border-line text-muted hover:text-ink",
                  )}
                >
                  {code} · {carrier.count}
                </button>
              );
            })}
          </div>
        </section>

        {selected ? (
          <section className="rounded-3xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-accent">
                  {selected.destination.iata}
                </p>
                <h2 className="mt-1 text-xl font-black text-ink">
                  {selected.destination.city}
                </h2>
                <p className="text-xs text-muted">{selected.destination.name}</p>
              </div>
              <span className="rounded-full border border-line px-2 py-1 text-[10px] font-bold text-muted">
                {Math.round(selected.distanceKm).toLocaleString()} km
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[9px] uppercase tracking-wider text-subtle">Duration</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {selected.durationFormatted ? `~${selected.durationFormatted}` : "Not reported"}
                  {selected.durationEstimated ? (
                    <span className="ml-1 text-[9px] font-normal text-subtle">
                      distance estimate
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-wider text-subtle">Daily flights</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {selected.dailyFlightsCount ?? "Not reported"}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-wider text-subtle">Airlines</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {selected.operatingCarriers.length}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] uppercase tracking-wider text-subtle">Weather</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {weatherLoading
                    ? "Loading…"
                    : weather?.dataAvailable
                      ? `${weather.arrivalTempC}°C · ${weather.arrivalCondition}`
                      : "Unavailable"}
                </dd>
              </div>
            </dl>
            {weather?.dataAvailable ? (
              <p className="mt-2 text-[11px] text-muted">
                {weather.windCondition} · {weather.visibility} ·{" "}
                {weather.advisory.arrivalNotice}
              </p>
            ) : null}
            <div className="mt-4 grid gap-2">
              <Link
                href={`/cabin/B77W/14A`}
                className="rounded-xl bg-accent px-3 py-2.5 text-center text-xs font-bold text-[color:var(--bg)]"
              >
                Track & Unlock 3D Cabin in App
              </Link>
              <a
                href="aeroquest://cabin/B77W/14A"
                className="rounded-xl border border-line px-3 py-2.5 text-center text-xs font-bold text-ink"
              >
                Open AeroQuest mobile
              </a>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-line bg-surface p-4 text-[11px] leading-relaxed text-muted">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent">
            What this page shows
          </p>
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
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe2, MapPin, RefreshCw } from "lucide-react";
import { LngLatBounds, type MapLayerMouseEvent } from "maplibre-gl";
import {
  gatewayRoutesResponseSchema,
  type DirectFlightConnection,
  type DestinationArrivalForecast,
} from "@avi/shared";
import { useMapLibre } from "@/lib/use-maplibre";
import {
  createLocalBasemapStyle,
  scheduleBasemapUpgrade,
} from "@/lib/local-basemap";
import {
  collection,
  ensureLayer,
  lineFeature,
  pointFeature,
  setGeoJson,
} from "@/lib/maplibre";
import { routeCoordinates } from "@/lib/geo";
import {
  AIRPORT_TRAFFIC_BUCKETS,
  AIRPORT_TRAFFIC_COLOR_EXPRESSION,
} from "@/lib/airport-traffic";
import { PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

export interface ExploreGlobeProps {
  iata: string;
  airportName: string;
  city: string;
  country: string;
  /** Active route count from the airports-routes catalogue, keyed by IATA. */
  trafficByIata: Record<string, number>;
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
  country,
  trafficByIata,
  initialRoutes,
}: ExploreGlobeProps) {
  const seededCount = initialRoutes?.length ?? 0;
  const [connections, setConnections] = useState<DirectFlightConnection[]>(
    initialRoutes ?? [],
  );
  const [loading, setLoading] = useState(seededCount === 0);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selected, setSelected] = useState<DirectFlightConnection | null>(
    initialRoutes?.[0] ?? null,
  );
  const [weather, setWeather] = useState<DestinationArrivalForecast | null>(
    null,
  );
  const [weatherLoading, setWeatherLoading] = useState(false);
  const { containerRef, map } = useMapLibre({
    center: [15, 22],
    zoom: 2.1,
    minZoom: 1,
    maxZoom: 6,
    style: createLocalBasemapStyle,
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
            : (routes[0] ?? null),
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

  // Keep the inspected destination valid when the network is refreshed.
  useEffect(() => {
    if (!connections.length) {
      setSelected(null);
      return;
    }
    setSelected((current) =>
      current && connections.some((route) => route.id === current.id)
        ? current
        : (connections[0] ?? null),
    );
  }, [connections]);

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
    if (!map) return;
    return scheduleBasemapUpgrade(map);
  }, [map]);

  useEffect(() => {
    if (!map || !origin) return;
    const features = connections.map((connection) =>
      lineFeature(
        routeCoordinates(
          [origin.longitude, origin.latitude],
          [connection.destination.longitude, connection.destination.latitude],
        ) as [number, number][],
        {
          id: connection.id,
          destination: connection.destination.iata,
          count: trafficByIata[connection.destination.iata] ?? 0,
        },
      ),
    );
    setGeoJson(map, "avi-explore-routes", collection(features));
    ensureLayer(map, {
      id: "avi-explore-route-lines",
      type: "line",
      source: "avi-explore-routes",
      paint: {
        "line-color": AIRPORT_TRAFFIC_COLOR_EXPRESSION,
        "line-width": 1.4,
        "line-opacity": 0.82,
      },
    });

    setGeoJson(
      map,
      "avi-explore-points",
      collection(
        connections.map((connection) =>
          pointFeature(
            connection.id,
            [connection.destination.longitude, connection.destination.latitude],
            {
              id: connection.id,
              iata: connection.destination.iata,
              city: connection.destination.city,
              count: trafficByIata[connection.destination.iata] ?? 0,
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
        "circle-color": AIRPORT_TRAFFIC_COLOR_EXPRESSION,
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
    for (const connection of connections) {
      bounds.extend([
        connection.destination.longitude,
        connection.destination.latitude,
      ]);
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 70, duration: 0, maxZoom: 3.1 });
    }
  }, [map, origin, connections, trafficByIata]);

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
      const connection = connections.find((item) => item.id === id);
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
  }, [map, connections]);

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
      .then(
        (body: { live?: boolean; forecast?: DestinationArrivalForecast }) => {
          if (!active) return;
          setWeather(body.live && body.forecast ? body.forecast : null);
        },
      )
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
    <div className="explore-map relative h-full w-full overflow-hidden bg-surface">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 z-10">
        <header className="pointer-events-auto absolute left-3 right-3 top-3 rounded-xl border border-line/70 bg-surface/90 p-4 shadow-2xl backdrop-blur-xl sm:left-4 sm:right-4 sm:top-4 lg:right-auto lg:w-[min(30rem,calc(100%_-_26rem))]">
          <div className="flex items-center gap-2">
            <Globe2 className="size-3.5 text-accent" />
            <span className="label-caps text-accent">
              Direct route explorer
            </span>
            <span className="ml-auto flex items-center gap-1.5 rounded-full border border-line/70 px-2 py-1 text-[11px] font-medium text-muted">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  loading
                    ? "animate-pulse-dot bg-accent"
                    : error
                      ? "bg-delayed"
                      : "bg-landed",
                )}
              />
              {loading ? "Syncing" : error ? "Unavailable" : "Live cache"}
            </span>
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Non-stop from {origin?.city ?? city}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {airportName} · {iata}
          </p>
          <p className="mt-2 hidden text-xs leading-relaxed text-muted sm:block">
            Destinations are coloured by each airport&apos;s active route count
            and paired with cached arrival weather.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
            {AIRPORT_TRAFFIC_BUCKETS.map((bucket) => (
              <span
                key={bucket.id}
                title={bucket.range}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: bucket.color }}
                />
                {bucket.label}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line/70 px-2.5 text-xs text-muted">
              <MapPin className="size-3.5" /> {origin?.city ?? city}, {country}
            </span>
            <span className="text-xs text-subtle">
              {loading && connections.length === 0
                ? "Loading direct network…"
                : `${connections.length} direct destinations`}
            </span>
            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              disabled={loading}
              aria-label="Refresh route data"
              title="Refresh route data"
              className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line/70 px-2.5 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-cancelled/30 bg-cancelled/10 px-3 py-2 text-xs leading-relaxed text-ink"
            >
              {error} The explorer never falls back to a static route dataset.
            </p>
          ) : null}
        </header>

        <div className="pointer-events-auto absolute inset-x-3 bottom-3 lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-4 lg:w-[360px]">
          {selected ? (
            <section className="rounded-xl border border-line/70 bg-surface/90 p-4 shadow-2xl backdrop-blur-xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-semibold tracking-[0.14em] text-accent">
                    {selected.destination.iata}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
                    {selected.destination.city}
                  </h2>
                  <p className="text-[13px] text-muted">
                    {selected.destination.name}
                  </p>
                  <p className="mt-1 text-[11px] text-subtle">
                    {(trafficByIata[selected.destination.iata] ?? 0) > 0
                      ? `~${trafficByIata[selected.destination.iata]} active routes`
                      : "No active routes in the reference catalogue"}
                  </p>
                </div>
                <span className="rounded-md border border-line/70 px-2 py-1 text-xs font-medium tabular text-muted">
                  {Math.round(selected.distanceKm).toLocaleString()} km
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                <div>
                  <dt className="text-xs text-subtle">Duration</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {selected.durationFormatted
                      ? `~${selected.durationFormatted}`
                      : "Not reported"}
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
                  href="/cabin/B77W/14A"
                  className="rounded-lg bg-accent px-3 py-2.5 text-center text-[13px] font-semibold text-[color:var(--bg)]"
                >
                  Open 3D cabin preview
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

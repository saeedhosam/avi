"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  AIRPORT_HITBOX_RADIUS_EXPRESSION,
  AIRPORT_TRAFFIC_COLOR_EXPRESSION,
  AIRPORT_TRAFFIC_RADIUS_EXPRESSION,
  airportTrafficColor,
} from "@/lib/airport-traffic";
import { PALETTE } from "@/lib/palette";
import { EXPLORE_HOME_EVENT } from "@/lib/explore-events";
import type { ExploreAirport, ExploreView } from "@/lib/explore-types";
import { cn } from "@/lib/utils";
import { ExploreAirportOverlay } from "./explore-airport-overlay";
import { ExploreWorldOverlay } from "./explore-world-overlay";

const WORLD_HITBOX_LAYER = "avi-world-airport-hitbox";

interface WorldHover {
  iata: string;
  city: string;
  count: number;
  x: number;
  y: number;
  flip: boolean;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

async function requestRoutes(
  iata: string,
  signal?: AbortSignal,
): Promise<DirectFlightConnection[]> {
  const response = await fetch(
    `/api/gateway/airports/${encodeURIComponent(iata)}/routes`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    },
  );
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
}

export interface ExploreExperienceProps {
  airports: ExploreAirport[];
  initialAirport: ExploreAirport | null;
  initialRoutes: DirectFlightConnection[] | null;
}

export function ExploreExperience({
  airports,
  initialAirport,
  initialRoutes,
}: ExploreExperienceProps) {
  const airportByIata = useMemo(
    () => new Map(airports.map((airport) => [airport.iata, airport])),
    [airports],
  );
  const trafficByIata = useMemo(
    () =>
      Object.fromEntries(
        airports.map((airport) => [airport.iata, airport.destCount]),
      ) as Record<string, number>,
    [airports],
  );

  const initialTrail = useMemo<ExploreView[]>(
    () =>
      initialAirport
        ? [{ kind: "world" }, { kind: "airport", iata: initialAirport.iata }]
        : [{ kind: "world" }],
    [initialAirport],
  );
  const [trail, setTrail] = useState<ExploreView[]>(initialTrail);
  const [trailIndex, setTrailIndex] = useState(initialTrail.length - 1);
  const [selectedAirport, setSelectedAirport] = useState<ExploreAirport | null>(
    initialAirport,
  );
  const [displayAirport, setDisplayAirport] = useState<ExploreAirport | null>(
    initialAirport,
  );
  const [connections, setConnections] = useState<DirectFlightConnection[]>(
    initialRoutes ?? [],
  );
  const [selectedRoute, setSelectedRoute] =
    useState<DirectFlightConnection | null>(initialRoutes?.[0] ?? null);
  const [routesLoading, setRoutesLoading] = useState(
    Boolean(initialAirport && initialRoutes === null),
  );
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [weather, setWeather] = useState<DestinationArrivalForecast | null>(
    null,
  );
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [worldHover, setWorldHover] = useState<WorldHover | null>(null);

  const routeCacheRef = useRef(new Map<string, DirectFlightConnection[]>());
  const prefetchingRef = useRef(new Set<string>());
  const requestIdRef = useRef(0);
  const worldCameraRef = useRef<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const lastViewRef = useRef<"world" | "airport">(
    initialAirport ? "airport" : "world",
  );
  const lastFitIataRef = useRef<string | null>(null);
  const lastFlyIataRef = useRef<string | null>(null);
  const hoveredWorldIataRef = useRef<string | null>(null);

  const [initialMapView] = useState(() =>
    initialAirport
      ? {
          center: [initialAirport.longitude, initialAirport.latitude] as [
            number,
            number,
          ],
          zoom: 2.6,
        }
      : { center: [12, 18] as [number, number], zoom: 1.8 },
  );
  const { containerRef, map } = useMapLibre({
    center: initialMapView.center,
    zoom: initialMapView.zoom,
    minZoom: 1,
    maxZoom: 6,
    style: createLocalBasemapStyle,
  });

  const updateUrl = useCallback((iata?: string) => {
    if (typeof window === "undefined") return;
    window.history.replaceState(
      window.history.state,
      "",
      iata ? `/explore/${iata}` : "/explore",
    );
  }, []);

  const selectAirport = useCallback(
    (iata: string) => {
      const airport = airportByIata.get(iata);
      if (!airport) return;
      const current = trail[trailIndex];
      if (current?.kind === "airport" && current.iata === iata) return;

      const cached = routeCacheRef.current.get(iata) ?? [];
      setRefreshToken(0);
      setSelectedAirport(airport);
      setDisplayAirport(airport);
      setConnections(cached);
      setSelectedRoute(cached[0] ?? null);
      updateUrl(iata);

      const next: ExploreView[] = [
        ...trail.slice(0, trailIndex + 1),
        { kind: "airport", iata },
      ];
      setTrail(next);
      setTrailIndex(next.length - 1);
    },
    [airportByIata, trail, trailIndex, updateUrl],
  );

  const applyView = useCallback(
    (view: ExploreView, index: number) => {
      setTrailIndex(index);
      setRefreshToken(0);
      if (view.kind === "world") {
        setSelectedAirport(null);
        updateUrl();
        return;
      }
      const airport = airportByIata.get(view.iata) ?? null;
      const cached = routeCacheRef.current.get(view.iata) ?? [];
      setSelectedAirport(airport);
      setDisplayAirport(airport);
      setConnections(cached);
      setSelectedRoute(cached[0] ?? null);
      if (airport) updateUrl(airport.iata);
    },
    [airportByIata, updateUrl],
  );

  const goBack = useCallback(() => {
    if (trailIndex > 0) applyView(trail[trailIndex - 1], trailIndex - 1);
  }, [applyView, trail, trailIndex]);

  const goForward = useCallback(() => {
    if (trailIndex < trail.length - 1) {
      applyView(trail[trailIndex + 1], trailIndex + 1);
    }
  }, [applyView, trail, trailIndex]);

  const goWorld = useCallback(() => {
    setTrail([{ kind: "world" }]);
    setTrailIndex(0);
    setRefreshToken(0);
    setSelectedAirport(null);
    updateUrl();
  }, [updateUrl]);

  useEffect(() => {
    const onHome = () => goWorld();
    window.addEventListener(EXPLORE_HOME_EVENT, onHome);
    return () => window.removeEventListener(EXPLORE_HOME_EVENT, onHome);
  }, [goWorld]);

  useEffect(() => {
    if (initialAirport && initialRoutes !== null) {
      routeCacheRef.current.set(initialAirport.iata, initialRoutes);
    }
  }, [initialAirport, initialRoutes]);

  const prefetchAirport = useCallback((iata: string) => {
    if (
      !iata ||
      routeCacheRef.current.has(iata) ||
      prefetchingRef.current.has(iata)
    ) {
      return;
    }
    prefetchingRef.current.add(iata);
    void requestRoutes(iata)
      .then((routes) => routeCacheRef.current.set(iata, routes))
      .catch(() => {
        // Prefetch is best-effort; the click path retries.
      })
      .finally(() => prefetchingRef.current.delete(iata));
  }, []);

  useEffect(() => {
    if (!selectedAirport) {
      setRoutesLoading(false);
      setRoutesError(null);
      return;
    }

    const iata = selectedAirport.iata;
    if (refreshToken === 0) {
      const cached = routeCacheRef.current.get(iata);
      if (cached) {
        setConnections(cached);
        setRoutesLoading(false);
        setRoutesError(null);
        return;
      }
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    setConnections([]);
    setSelectedRoute(null);
    setRoutesLoading(true);
    setRoutesError(null);

    void requestRoutes(iata, controller.signal)
      .then((routes) => {
        if (requestId !== requestIdRef.current) return;
        routeCacheRef.current.set(iata, routes);
        setConnections(routes);
        setRoutesLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        setRoutesError(
          cause instanceof Error
            ? cause.message
            : "Live route data is temporarily unavailable.",
        );
        setRoutesLoading(false);
      });

    return () => controller.abort();
  }, [selectedAirport, refreshToken]);

  useEffect(() => {
    if (!connections.length) {
      setSelectedRoute(null);
      return;
    }
    setSelectedRoute((current) =>
      current && connections.some((route) => route.id === current.id)
        ? current
        : (connections[0] ?? null),
    );
  }, [connections]);

  useEffect(() => {
    if (selectedAirport) {
      setDisplayAirport(selectedAirport);
      return;
    }
    // Keep the last airport card mounted while it fades out.
    const timer = window.setTimeout(() => setDisplayAirport(null), 320);
    return () => window.clearTimeout(timer);
  }, [selectedAirport]);

  useEffect(() => {
    if (!selectedRoute) {
      setWeather(null);
      return;
    }
    let active = true;
    setWeather(null);
    setWeatherLoading(true);
    const params = new URLSearchParams({
      lat: String(selectedRoute.destination.latitude),
      lon: String(selectedRoute.destination.longitude),
      code: selectedRoute.destination.iata,
      name: selectedRoute.destination.name,
      city: selectedRoute.destination.city,
      country: selectedRoute.destination.country,
      arrival: "12:00",
    });
    fetch(`/api/weather?${params.toString()}`)
      .then((response) => response.json())
      .then(
        (body: { live?: boolean; forecast?: DestinationArrivalForecast }) => {
          if (active) {
            setWeather(body.live && body.forecast ? body.forecast : null);
          }
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
  }, [selectedRoute]);

  useEffect(() => {
    if (!map) return;
    try {
      map.setProjection({ type: "globe" });
    } catch {
      // Older/embedded MapLibre builds may not expose globe.
    }
  }, [map]);

  useEffect(() => {
    if (!map) return;
    return scheduleBasemapUpgrade(map);
  }, [map]);

  // World dots are created once; their opacity is animated by the mode effect.
  useEffect(() => {
    if (!map) return;

    setGeoJson(
      map,
      "avi-world-airports",
      collection(
        airports.map((airport) =>
          pointFeature(airport.iata, [airport.longitude, airport.latitude], {
            iata: airport.iata,
            city: airport.city,
            count: airport.destCount,
          }),
        ),
      ),
    );

    ensureLayer(map, {
      id: "avi-world-airport-circles",
      type: "circle",
      source: "avi-world-airports",
      paint: {
        "circle-radius": AIRPORT_TRAFFIC_RADIUS_EXPRESSION,
        "circle-color": AIRPORT_TRAFFIC_COLOR_EXPRESSION,
        "circle-opacity": 0.9,
        "circle-stroke-color": "rgba(233,239,245,0.35)",
        "circle-stroke-width": 0.5,
      },
    });

    // Invisible, larger circles keep quiet airports easy to hover and tap.
    ensureLayer(map, {
      id: WORLD_HITBOX_LAYER,
      type: "circle",
      source: "avi-world-airports",
      paint: {
        "circle-radius": AIRPORT_HITBOX_RADIUS_EXPRESSION,
        "circle-color": PALETTE.accent,
        "circle-opacity": 0,
      },
    });
  }, [map, airports]);

  // Airport-mode layers are created once with empty data and zero opacity.
  useEffect(() => {
    if (!map) return;

    setGeoJson(map, "avi-explore-routes", collection([]));
    setGeoJson(map, "avi-explore-points", collection([]));
    setGeoJson(map, "avi-explore-selected", collection([]));
    setGeoJson(map, "avi-explore-origin", collection([]));

    ensureLayer(map, {
      id: "avi-explore-route-lines",
      type: "line",
      source: "avi-explore-routes",
      paint: {
        "line-color": AIRPORT_TRAFFIC_COLOR_EXPRESSION,
        "line-width": 1.4,
        "line-opacity": 0,
      },
    });
    ensureLayer(map, {
      id: "avi-explore-point-circles",
      type: "circle",
      source: "avi-explore-points",
      paint: {
        "circle-radius": 4.2,
        "circle-color": AIRPORT_TRAFFIC_COLOR_EXPRESSION,
        "circle-stroke-color": "rgba(226,239,255,0.75)",
        "circle-stroke-width": 0.8,
        "circle-opacity": 0,
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
        "text-opacity": 0,
      },
    });
    ensureLayer(map, {
      id: "avi-explore-selected-line",
      type: "line",
      source: "avi-explore-selected",
      paint: {
        "line-color": PALETTE.accent,
        "line-width": 3.4,
        "line-opacity": 0,
      },
    });
    ensureLayer(map, {
      id: "avi-explore-origin-circle",
      type: "circle",
      source: "avi-explore-origin",
      paint: {
        "circle-radius": 6.5,
        "circle-color": PALETTE.accent,
        "circle-stroke-color": PALETTE.map.highlight,
        "circle-stroke-width": 2,
        "circle-opacity": 0,
      },
    });
    ensureLayer(map, {
      id: "avi-explore-origin-label",
      type: "symbol",
      source: "avi-explore-origin",
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, -1.5],
        "text-anchor": "bottom",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": PALETTE.text,
        "text-halo-color": PALETTE.background,
        "text-halo-width": 1.4,
        "text-opacity": 0,
      },
    });
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (!selectedAirport) {
      const timer = window.setTimeout(() => {
        setGeoJson(map, "avi-explore-origin", collection([]));
      }, 360);
      return () => window.clearTimeout(timer);
    }
    setGeoJson(
      map,
      "avi-explore-origin",
      collection([
        pointFeature(
          "origin",
          [selectedAirport.longitude, selectedAirport.latitude],
          { iata: selectedAirport.iata, city: selectedAirport.city },
        ),
      ]),
    );
  }, [map, selectedAirport]);

  useEffect(() => {
    if (!map) return;
    const origin = connections[0]?.origin ?? null;
    const originCoords: [number, number] | null = origin
      ? [origin.longitude, origin.latitude]
      : selectedAirport
        ? [selectedAirport.longitude, selectedAirport.latitude]
        : null;

    if (!originCoords || !connections.length) {
      const timer = window.setTimeout(() => {
        setGeoJson(map, "avi-explore-routes", collection([]));
        setGeoJson(map, "avi-explore-points", collection([]));
      }, 360);
      return () => window.clearTimeout(timer);
    }

    setGeoJson(
      map,
      "avi-explore-routes",
      collection(
        connections.map((connection) =>
          lineFeature(
            routeCoordinates(originCoords, [
              connection.destination.longitude,
              connection.destination.latitude,
            ]) as [number, number][],
            {
              id: connection.id,
              destination: connection.destination.iata,
              count: trafficByIata[connection.destination.iata] ?? 0,
            },
          ),
        ),
      ),
    );
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
  }, [map, connections, selectedAirport, trafficByIata]);

  useEffect(() => {
    if (!map) return;
    const origin = connections[0]?.origin ?? null;
    const originCoords: [number, number] | null = origin
      ? [origin.longitude, origin.latitude]
      : selectedAirport
        ? [selectedAirport.longitude, selectedAirport.latitude]
        : null;
    if (!originCoords || !selectedRoute) {
      const timer = window.setTimeout(() => {
        setGeoJson(map, "avi-explore-selected", collection([]));
      }, 360);
      return () => window.clearTimeout(timer);
    }
    setGeoJson(
      map,
      "avi-explore-selected",
      collection([
        lineFeature(
          routeCoordinates(originCoords, [
            selectedRoute.destination.longitude,
            selectedRoute.destination.latitude,
          ]) as [number, number][],
          { id: selectedRoute.id },
        ),
      ]),
    );
  }, [map, selectedRoute, connections, selectedAirport]);

  useEffect(() => {
    if (!map) return;
    const inAirport = Boolean(selectedAirport);
    const duration = prefersReducedMotion() ? 0 : 350;

    const setCircleOpacity = (id: string, value: number) => {
      if (!map.getLayer(id)) return;
      map.setPaintProperty(id, "circle-opacity-transition", {
        duration,
        delay: 0,
      });
      map.setPaintProperty(id, "circle-opacity", value);
    };
    const setLineOpacity = (id: string, value: number) => {
      if (!map.getLayer(id)) return;
      map.setPaintProperty(id, "line-opacity-transition", {
        duration,
        delay: 0,
      });
      map.setPaintProperty(id, "line-opacity", value);
    };
    const setTextOpacity = (id: string, value: number) => {
      if (!map.getLayer(id)) return;
      map.setPaintProperty(id, "text-opacity-transition", {
        duration,
        delay: 0,
      });
      map.setPaintProperty(id, "text-opacity", value);
    };

    setCircleOpacity("avi-world-airport-circles", inAirport ? 0.18 : 0.9);
    hoveredWorldIataRef.current = null;
    setWorldHover(null);

    setLineOpacity(
      "avi-explore-route-lines",
      inAirport && connections.length ? 0.82 : 0,
    );
    setCircleOpacity(
      "avi-explore-point-circles",
      inAirport && connections.length ? 1 : 0,
    );
    setTextOpacity(
      "avi-explore-point-labels",
      inAirport && connections.length ? 1 : 0,
    );
    setLineOpacity(
      "avi-explore-selected-line",
      inAirport && selectedRoute ? 0.95 : 0,
    );
    setCircleOpacity("avi-explore-origin-circle", inAirport ? 1 : 0);
    setTextOpacity("avi-explore-origin-label", inAirport ? 1 : 0);
  }, [map, selectedAirport, connections, selectedRoute]);

  useEffect(() => {
    if (!map) return;
    const inAirport = Boolean(selectedAirport);
    const duration = prefersReducedMotion() ? 0 : 1100;

    if (inAirport && selectedAirport) {
      if (lastViewRef.current === "world") {
        const center = map.getCenter();
        worldCameraRef.current = {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
        };
      }
      lastViewRef.current = "airport";

      if (connections.length) {
        if (lastFitIataRef.current !== selectedAirport.iata) {
          lastFitIataRef.current = selectedAirport.iata;
          const bounds = new LngLatBounds();
          const origin = connections[0]?.origin;
          bounds.extend(
            origin
              ? [origin.longitude, origin.latitude]
              : [selectedAirport.longitude, selectedAirport.latitude],
          );
          for (const connection of connections) {
            bounds.extend([
              connection.destination.longitude,
              connection.destination.latitude,
            ]);
          }
          if (!bounds.isEmpty()) {
            requestAnimationFrame(() => {
              try {
                map.stop();
                map.fitBounds(bounds, {
                  padding: 70,
                  duration,
                  maxZoom: 3.1,
                  essential: true,
                });
              } catch {
                // The map may have been removed before the frame ran.
              }
            });
          }
        }
      } else if (lastFlyIataRef.current !== selectedAirport.iata) {
        lastFlyIataRef.current = selectedAirport.iata;
        requestAnimationFrame(() => {
          try {
            map.stop();
            map.flyTo({
              center: [selectedAirport.longitude, selectedAirport.latitude],
              zoom: 3.2,
              duration,
              essential: true,
            });
          } catch {
            // The map may have been removed before the frame ran.
          }
        });
      }
      return;
    }

    if (lastViewRef.current === "airport") {
      lastViewRef.current = "world";
      lastFitIataRef.current = null;
      lastFlyIataRef.current = null;
      const view = worldCameraRef.current ?? {
        center: [12, 18] as [number, number],
        zoom: 1.8,
      };
      requestAnimationFrame(() => {
        try {
          map.stop();
          map.flyTo({
            center: view.center,
            zoom: view.zoom,
            duration,
            essential: true,
          });
        } catch {
          // The map may have been removed before the frame ran.
        }
      });
    }
  }, [map, selectedAirport, connections]);

  useEffect(() => {
    if (!map) return;
    const onWorldClick = (event: MapLayerMouseEvent) => {
      if (selectedAirport) return;
      const iata = event.features?.[0]?.properties?.iata;
      if (typeof iata === "string") selectAirport(iata);
    };
    const onWorldMove = (event: MapLayerMouseEvent) => {
      if (selectedAirport) return;
      const iata = event.features?.[0]?.properties?.iata;
      if (typeof iata !== "string") return;
      const airport = airportByIata.get(iata);
      if (!airport) return;
      map.getCanvas().style.cursor = "pointer";
      if (hoveredWorldIataRef.current !== iata) {
        hoveredWorldIataRef.current = iata;
        prefetchAirport(iata);
      }
      const width = map.getContainer().clientWidth;
      const edge = Math.min(88, width / 2);
      setWorldHover({
        iata,
        city: airport.city,
        count: airport.destCount,
        x: Math.min(Math.max(event.point.x, edge), width - edge),
        y: event.point.y,
        flip: event.point.y < 150,
      });
    };
    const onWorldLeave = () => {
      map.getCanvas().style.cursor = "";
      if (hoveredWorldIataRef.current === null) return;
      hoveredWorldIataRef.current = null;
      setWorldHover(null);
    };
    const onRouteClick = (event: MapLayerMouseEvent) => {
      if (!selectedAirport) return;
      const id = event.features?.[0]?.properties?.id;
      if (typeof id !== "string") return;
      const connection = connections.find((item) => item.id === id);
      if (connection) setSelectedRoute(connection);
    };
    const onRouteEnter = () => {
      if (!selectedAirport) return;
      map.getCanvas().style.cursor = "pointer";
    };
    const onRouteLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", WORLD_HITBOX_LAYER, onWorldClick);
    map.on("mousemove", WORLD_HITBOX_LAYER, onWorldMove);
    map.on("mouseleave", WORLD_HITBOX_LAYER, onWorldLeave);
    map.on("dragstart", onWorldLeave);
    map.on("click", "avi-explore-point-circles", onRouteClick);
    map.on("click", "avi-explore-route-lines", onRouteClick);
    map.on("mouseenter", "avi-explore-point-circles", onRouteEnter);
    map.on("mouseleave", "avi-explore-point-circles", onRouteLeave);

    return () => {
      map.off("click", WORLD_HITBOX_LAYER, onWorldClick);
      map.off("mousemove", WORLD_HITBOX_LAYER, onWorldMove);
      map.off("mouseleave", WORLD_HITBOX_LAYER, onWorldLeave);
      map.off("dragstart", onWorldLeave);
      map.off("click", "avi-explore-point-circles", onRouteClick);
      map.off("click", "avi-explore-route-lines", onRouteClick);
      map.off("mouseenter", "avi-explore-point-circles", onRouteEnter);
      map.off("mouseleave", "avi-explore-point-circles", onRouteLeave);
    };
  }, [
    map,
    selectedAirport,
    connections,
    selectAirport,
    prefetchAirport,
    airportByIata,
  ]);

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-surface",
        selectedAirport ? "explore-map" : "explore-world-map",
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {worldHover && !selectedAirport && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute z-20 -translate-x-1/2",
            worldHover.flip ? "translate-y-0" : "-translate-y-full",
          )}
          style={{
            left: worldHover.x,
            top: worldHover.flip ? worldHover.y + 16 : worldHover.y - 14,
          }}
        >
          <div className="relative flex max-w-[10.5rem] items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-2 py-1 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.95)]">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor: airportTrafficColor(worldHover.count),
              }}
            />
            <span className="shrink-0 font-mono text-[11px] font-semibold tracking-[0.12em] text-ink">
              {worldHover.iata}
            </span>
            <span className="truncate text-[10px] text-muted">
              {worldHover.city}
            </span>
            <span className="ml-auto shrink-0 rounded-sm bg-surface-3 px-1 py-px text-[9px] tabular text-subtle">
              {worldHover.count}
            </span>
            <span
              className={cn(
                "absolute left-1/2 size-1.5 -translate-x-1/2 rotate-45 border-line-strong bg-surface-2",
                worldHover.flip
                  ? "-top-[3.5px] border-l border-t"
                  : "-bottom-[3.5px] border-r border-b",
              )}
            />
          </div>
        </div>
      )}

      <ExploreWorldOverlay
        airportCount={airports.length}
        visible={!selectedAirport}
        canBack={trailIndex > 0}
        canForward={trailIndex < trail.length - 1}
        onBack={goBack}
        onForward={goForward}
      />
      <ExploreAirportOverlay
        airport={displayAirport}
        connections={connections}
        loading={routesLoading}
        error={routesError}
        selectedRoute={selectedRoute}
        weather={weather}
        weatherLoading={weatherLoading}
        trafficByIata={trafficByIata}
        visible={Boolean(selectedAirport)}
        canBack={trailIndex > 0}
        canForward={trailIndex < trail.length - 1}
        onBack={goBack}
        onForward={goForward}
        onRefresh={() => setRefreshToken((value) => value + 1)}
      />
    </div>
  );
}

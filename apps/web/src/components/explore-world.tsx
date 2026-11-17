"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Globe2 } from "lucide-react";
import type { MapLayerMouseEvent } from "maplibre-gl";
import {
  AIRPORT_TRAFFIC_BUCKETS,
  AIRPORT_TRAFFIC_COLOR_EXPRESSION,
  AIRPORT_TRAFFIC_RADIUS_EXPRESSION,
} from "@/lib/airport-traffic";
import { useMapLibre } from "@/lib/use-maplibre";
import {
  createLocalBasemapStyle,
  scheduleBasemapUpgrade,
} from "@/lib/local-basemap";
import {
  collection,
  ensureLayer,
  pointFeature,
  setGeoJson,
} from "@/lib/maplibre";
import { PALETTE } from "@/lib/palette";

export interface ExploreWorldAirport {
  iata: string;
  city: string;
  latitude: number;
  longitude: number;
  destCount: number;
}

export function ExploreWorld({
  airports,
}: {
  airports: ExploreWorldAirport[];
}) {
  const router = useRouter();
  const { containerRef, map } = useMapLibre({
    center: [12, 18],
    zoom: 1.8,
    minZoom: 1,
    maxZoom: 6,
    style: createLocalBasemapStyle,
  });

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

    const features = airports.map((airport) =>
      pointFeature(airport.iata, [airport.longitude, airport.latitude], {
        iata: airport.iata,
        city: airport.city,
        count: airport.destCount,
      }),
    );

    setGeoJson(map, "avi-world-airports", collection(features));
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

    const labelPaints = {
      "text-color": PALETTE.text,
      "text-halo-color": PALETTE.background,
      "text-halo-width": 1.4,
    } as const;

    ensureLayer(map, {
      id: "avi-world-airport-labels-mega",
      type: "symbol",
      source: "avi-world-airports",
      minzoom: 1.4,
      filter: [">=", ["get", "count"], 160],
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: labelPaints,
    });
    ensureLayer(map, {
      id: "avi-world-airport-labels-major",
      type: "symbol",
      source: "avi-world-airports",
      minzoom: 2.4,
      filter: [">=", ["get", "count"], 40],
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: labelPaints,
    });
    ensureLayer(map, {
      id: "avi-world-airport-labels-mid",
      type: "symbol",
      source: "avi-world-airports",
      minzoom: 4,
      filter: [">=", ["get", "count"], 10],
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: labelPaints,
    });
    ensureLayer(map, {
      id: "avi-world-airport-labels-all",
      type: "symbol",
      source: "avi-world-airports",
      minzoom: 5.5,
      filter: [">=", ["get", "count"], 1],
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: labelPaints,
    });
  }, [map, airports]);

  useEffect(() => {
    if (!map) return;
    return scheduleBasemapUpgrade(map);
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const onClick = (event: MapLayerMouseEvent) => {
      const iata = event.features?.[0]?.properties?.iata;
      if (typeof iata === "string") router.push(`/explore/${iata}`);
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", "avi-world-airport-circles", onClick);
    map.on("mouseenter", "avi-world-airport-circles", onEnter);
    map.on("mouseleave", "avi-world-airport-circles", onLeave);
    return () => {
      map.off("click", "avi-world-airport-circles", onClick);
      map.off("mouseenter", "avi-world-airport-circles", onEnter);
      map.off("mouseleave", "avi-world-airport-circles", onLeave);
    };
  }, [map, router]);

  return (
    <div className="explore-world-map relative h-full w-full overflow-hidden bg-surface">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 z-10">
        <header className="pointer-events-auto absolute left-3 right-3 top-3 rounded-xl border border-line/70 bg-surface/90 p-4 shadow-2xl backdrop-blur-xl sm:left-4 sm:right-4 sm:top-4 lg:w-[min(38rem,calc(100%-2rem))]">
          <div className="flex flex-wrap items-center gap-2">
            <Globe2 className="size-3.5 text-accent" />
            <span className="label-caps text-accent">Global airport map</span>
            <span className="ml-auto rounded-full border border-line/70 px-2 py-1 text-[11px] font-medium tabular text-muted">
              {airports.length.toLocaleString()} airports
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
            Active route counts from the bundled airports-routes dataset, not
            live schedules.
          </p>
        </header>
      </div>
    </div>
  );
}

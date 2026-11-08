"use client";

// Shield global constructors from MapLibre / Mapbox cross-library serialization conflict
if (typeof window !== "undefined") {
  try {
    const orig = Object.defineProperty;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Object as any).defineProperty = function <T>(
      obj: T,
      prop: PropertyKey,
      desc: PropertyDescriptor & ThisType<unknown>,
    ): T {
      if (prop === "_classRegistryKey" && (obj === Set || obj === Error || obj === Map)) {
        return obj;
      }
      return orig.call(Object, obj, prop, desc) as T;
    };
  } catch {}
}

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Box,
  Key,
  LocateFixed,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { AirportNode, TerminalAmenity } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MapboxAirportMapProps {
  airport: AirportNode;
  amenities?: TerminalAmenity[];
  selectedAmenity?: TerminalAmenity | null;
  onSelectAmenity?: (amenity: TerminalAmenity) => void;
  className?: string;
  activeLevel?: number;
}

const MAP_STYLES = [
  { id: "dark", label: "Tactical Dark", url: "mapbox://styles/mapbox/dark-v11" },
  { id: "satellite", label: "Satellite 4K", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { id: "standard", label: "Mapbox 3D Standard", url: "mapbox://styles/mapbox/standard" },
];

export function MapboxAirportMap({
  airport,
  amenities = [],
  selectedAmenity = null,
  onSelectAmenity,
  className,
  activeLevel = 1,
}: MapboxAirportMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // Token from environment or local override
  const envToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "";
  const [token, setToken] = useState<string>(envToken);
  const [tokenInput, setTokenInput] = useState("");

  const [activeStyle, setActiveStyle] = useState<string>("dark");
  const [is3D, setIs3D] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(15.5);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize Mapbox map
  useEffect(() => {
    if (!containerRef.current) return;
    if (!token) {
      setMapLoaded(false);
      return;
    }

    try {
      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAP_STYLES.find((s) => s.id === activeStyle)?.url || "mapbox://styles/mapbox/dark-v11",
        center: [airport.longitude, airport.latitude],
        zoom: 15.5,
        minZoom: 11,
        maxZoom: 20,
        pitch: is3D ? 58 : 0,
        bearing: -15,
        antialias: true,
        attributionControl: false,
      });

      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-right",
      );

      map.on("load", () => {
        setMapLoaded(true);

        try {
          const style = map.getStyle();
          const layers = style?.layers;
          const labelLayerId = layers?.find(
            (layer) => layer.type === "symbol" && layer.layout && "text-field" in layer.layout,
          )?.id;

          if (map.getSource("composite") && !map.getLayer("3d-buildings")) {
            map.addLayer(
              {
                id: "3d-buildings",
                source: "composite",
                "source-layer": "building",
                filter: ["==", "extrude", "true"],
                type: "fill-extrusion",
                minzoom: 13,
                paint: {
                  "fill-extrusion-color": [
                    "interpolate",
                    ["linear"],
                    ["get", "height"],
                    0,
                    "#142236",
                    30,
                    "#1e3656",
                    80,
                    "#2e5684",
                  ],
                  "fill-extrusion-height": ["get", "height"],
                  "fill-extrusion-base": ["get", "min_height"],
                  "fill-extrusion-opacity": 0.88,
                },
              },
              labelLayerId,
            );
          }
        } catch (err) {
          console.warn("Could not inject 3D buildings layer:", err);
        }
      });

      map.on("zoom", () => {
        setCurrentZoom(Number(map.getZoom().toFixed(1)));
      });

      mapRef.current = map;

      return () => {
        map.remove();
        mapRef.current = null;
        setMapLoaded(false);
      };
    } catch (e) {
      console.warn("Mapbox initialization error:", e);
    }
  }, [token, activeStyle, airport.iata, airport.latitude, airport.longitude, is3D]);

  // Recenter when airport changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    mapRef.current.flyTo({
      center: [airport.longitude, airport.latitude],
      zoom: 15.5,
      pitch: is3D ? 58 : 0,
      bearing: -15,
      essential: true,
      duration: 1200,
    });
  }, [airport.iata, airport.latitude, airport.longitude, mapLoaded, is3D]);

  // Place Gate & Amenity 3D Markers on Terminal footprint
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const map = mapRef.current;

    // Filter amenities for current floor
    const floorAmenities = amenities.filter(
      (a) => a.level === activeLevel && (a.category === "GATE" || a.category === "LOUNGE" || a.category === "SECURITY"),
    );

    // Spread markers in a concourse layout around airport center coordinates
    floorAmenities.forEach((item) => {
      // Calculate realistic micro-offsets based on position.x and position.y
      const lonOffset = (item.position.x - 0.5) * 0.012;
      const latOffset = (0.5 - item.position.y) * 0.008;
      const lngLat: [number, number] = [
        airport.longitude + lonOffset,
        airport.latitude + latOffset,
      ];

      const isSelected = selectedAmenity?.id === item.id;
      const el = document.createElement("div");
      el.className = cn(
        "group relative flex items-center justify-center cursor-pointer transition-transform duration-200",
        isSelected ? "scale-125 z-30" : "scale-100 z-10 hover:scale-110",
      );

      const isGate = item.category === "GATE";
      const isSecurity = item.category === "SECURITY";

      el.innerHTML = `
        <div class="relative flex items-center justify-center px-1.5 py-0.5 rounded-md border font-mono text-[9px] font-bold shadow-lg backdrop-blur ${
          isSelected
            ? "border-cyan-400 bg-cyan-950 text-cyan-300 ring-2 ring-cyan-400"
            : isSecurity
              ? "border-red-400/80 bg-red-950/90 text-red-300"
              : isGate
                ? "border-blue-400/80 bg-slate-900/90 text-sky-200"
                : "border-amber-400/80 bg-amber-950/90 text-amber-300"
        }">
          <span>${item.gateNumber ? `G ${item.gateNumber}` : item.name.slice(0, 10)}</span>
        </div>
      `;

      el.addEventListener("click", () => {
        onSelectAmenity?.(item);
        map.flyTo({
          center: lngLat,
          zoom: Math.max(map.getZoom(), 16.5),
          pitch: 62,
          essential: true,
          duration: 800,
        });
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [mapLoaded, amenities, activeLevel, selectedAmenity, airport.latitude, airport.longitude, onSelectAmenity]);

  const handleToggle3D = () => {
    if (!mapRef.current) return;
    const next = !is3D;
    setIs3D(next);
    mapRef.current.easeTo({
      pitch: next ? 60 : 0,
      bearing: next ? -25 : 0,
      duration: 800,
    });
  };

  const handleZoom = (delta: number) => {
    if (!mapRef.current) return;
    mapRef.current.easeTo({ zoom: mapRef.current.getZoom() + delta, duration: 300 });
  };

  const handleRecenter = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [airport.longitude, airport.latitude],
      zoom: 15.5,
      pitch: is3D ? 58 : 0,
      bearing: -15,
      essential: true,
    });
  };

  // If no token is provided, display helpful token configuration banner
  if (!token) {
    return (
      <div
        className={cn(
          "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-line bg-[#081320] p-6 text-center",
          className,
        )}
      >
        <div className="flex size-14 items-center justify-center rounded-2xl border border-accent/40 bg-accent-soft text-accent shadow-xl shadow-accent/10">
          <Key className="size-7" />
        </div>
        <h3 className="mt-3 text-base font-black text-ink">Mapbox 3D Indoor Terminal Maps</h3>
        <p className="mt-1 max-w-md text-xs text-muted">
          To render Mapbox 3D extruded terminals, photorealistic satellite imagery, and high-precision indoor gates for{" "}
          <strong className="text-ink">{airport.name}</strong>, please supply your Mapbox public access token.
        </p>

        <div className="mt-4 flex w-full max-w-sm items-center gap-1.5">
          <input
            type="text"
            placeholder="pk.eyJ1..."
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="h-8 w-full rounded-md border border-line bg-surface-2 px-2.5 font-mono text-[11px] text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              if (tokenInput.trim()) {
                setToken(tokenInput.trim());
              }
            }}
            className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-surface-0 hover:bg-accent/90"
          >
            Activate
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-line bg-surface-2/60 p-2.5 text-left text-[11px] text-subtle">
          <p className="font-semibold text-ink">Where to add permanently:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted">
            <li>
              Local: in <code className="font-mono text-accent">apps/web/.env.local</code> as{" "}
              <code className="font-mono text-ink">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk...</code>
            </li>
            <li>
              GitHub Actions: In Repository Secrets as{" "}
              <code className="font-mono text-accent">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-[#081320]",
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* Top HUD: Map Style Switcher & 3D Status */}
      <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1.5">
        <div className="flex rounded-lg border border-line/80 bg-surface/90 p-0.5 shadow-lg backdrop-blur">
          {MAP_STYLES.map((style) => (
            <button
              key={style.id}
              onClick={() => setActiveStyle(style.id)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors",
                activeStyle === style.id
                  ? "bg-accent text-surface-0 shadow-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              {style.label}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-1.5 rounded-lg border border-line/80 bg-surface/90 px-2 py-1 font-mono text-[9px] font-bold text-ink shadow-lg backdrop-blur sm:flex">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>MAPBOX 3D</span>
          <span className="text-accent">Z{currentZoom}</span>
        </div>
      </div>

      {/* Right Controls HUD */}
      <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5 rounded-xl border border-line/80 bg-surface/90 p-1 shadow-xl backdrop-blur">
        <button
          type="button"
          onClick={handleRecenter}
          className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-accent"
          title="Recenter on terminal"
          aria-label="Recenter on terminal"
        >
          <LocateFixed className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={handleToggle3D}
          className={cn(
            "flex size-7 items-center justify-center rounded-lg transition-colors",
            is3D
              ? "bg-accent-soft text-accent"
              : "text-muted hover:bg-surface-2 hover:text-ink",
          )}
          title={is3D ? "Switch to 2D Top View" : "Switch to 3D Extruded Perspective"}
          aria-label="Toggle 3D View"
        >
          <Box className="size-3.5" />
        </button>

        <div className="my-0.5 h-px bg-line/60" />

        <button
          type="button"
          onClick={() => handleZoom(0.8)}
          className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(-0.8)}
          className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut className="size-3.5" />
        </button>
      </div>

      {/* Floor & Gates Status Footer */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-lg border border-line/80 bg-surface/90 px-2.5 py-1 text-[10px] font-semibold text-subtle shadow-lg backdrop-blur">
        <span className="font-mono font-bold text-accent">{airport.iata}</span>
        <span>·</span>
        <span>Level {activeLevel} Concourse</span>
        <span>·</span>
        <span className="text-ink">{amenities.filter((a) => a.level === activeLevel).length} Interactive Gates & Points</span>
      </div>
    </div>
  );
}

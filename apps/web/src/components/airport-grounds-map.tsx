"use client";

import { useEffect, useRef, useState } from "react";
import { Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Box, Layers, LocateFixed, ZoomIn, ZoomOut } from "lucide-react";
import type { AirportNode } from "@/lib/types";
import { useMapLibre } from "@/lib/use-maplibre";
import { cn } from "@/lib/utils";

export interface AirportGroundsMapProps {
  airport: AirportNode;
  className?: string;
  onSelectTerminal?: () => void;
  hasIndoorSchematic?: boolean;
}

export function AirportGroundsMap({
  airport,
  className,
  onSelectTerminal,
  hasIndoorSchematic = false,
}: AirportGroundsMapProps) {
  const { containerRef, map } = useMapLibre({
    center: [airport.longitude, airport.latitude],
    zoom: 14.8,
    minZoom: 10,
    maxZoom: 18,
    attribution: true,
  });

  const markerRef = useRef<Marker | null>(null);
  const [pitch3D, setPitch3D] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(14.8);

  // Update map center when airport changes
  useEffect(() => {
    if (!map) return;
    map.flyTo({
      center: [airport.longitude, airport.latitude],
      zoom: 14.8,
      essential: true,
      duration: 1200,
    });
  }, [map, airport.iata, airport.latitude, airport.longitude]);

  // Airport center marker with radar ping
  useEffect(() => {
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    const el = document.createElement("div");
    el.className = "group relative flex items-center justify-center cursor-pointer";
    el.innerHTML = `
      <div class="absolute -inset-3 rounded-full bg-accent/20 animate-ping"></div>
      <div class="relative flex size-8 items-center justify-center rounded-full border-2 border-accent bg-bg shadow-xl shadow-accent/30">
        <span class="font-mono text-[9px] font-black text-accent tracking-wider">${airport.iata}</span>
      </div>
      <div class="pointer-events-none absolute bottom-full mb-2 hidden -translate-x-1/2 left-1/2 whitespace-nowrap rounded-md border border-line bg-surface/95 px-2 py-1 text-[10px] font-bold text-ink shadow-lg group-hover:block backdrop-blur">
        ${airport.name} · ${airport.city}
      </div>
    `;

    const marker = new Marker({ element: el })
      .setLngLat([airport.longitude, airport.latitude])
      .addTo(map);

    markerRef.current = marker;

    const onZoom = () => {
      setCurrentZoom(Number(map.getZoom().toFixed(1)));
    };
    map.on("zoom", onZoom);

    return () => {
      map.off("zoom", onZoom);
      marker.remove();
      markerRef.current = null;
    };
  }, [map, airport]);

  const handleRecenter = () => {
    if (!map) return;
    map.flyTo({
      center: [airport.longitude, airport.latitude],
      zoom: 14.8,
      pitch: pitch3D ? 50 : 0,
      bearing: 0,
      essential: true,
    });
  };

  const toggle3D = () => {
    if (!map) return;
    const next = !pitch3D;
    setPitch3D(next);
    map.easeTo({
      pitch: next ? 55 : 0,
      bearing: next ? -20 : 0,
      duration: 700,
    });
  };

  const handleZoom = (delta: number) => {
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() + delta, duration: 300 });
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-surface",
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* Floating HUD Badges */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-line/80 bg-surface/90 px-2.5 py-1 text-[10px] font-bold text-ink shadow-lg backdrop-blur">
          <span className="size-2 rounded-full bg-landed animate-pulse" />
          <span>Airfield & Grounds View</span>
          <span className="font-mono text-accent">Z{currentZoom}</span>
        </div>
        <div className="hidden rounded-lg border border-line/80 bg-surface/90 px-2.5 py-1 font-mono text-[9px] text-muted shadow-lg backdrop-blur sm:block">
          {Math.abs(airport.latitude).toFixed(4)}°
          {airport.latitude >= 0 ? "N" : "S"},{" "}
          {Math.abs(airport.longitude).toFixed(4)}°
          {airport.longitude >= 0 ? "E" : "W"}
        </div>
      </div>

      {/* Map Action Controls */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 rounded-xl border border-line/80 bg-surface/90 p-1 shadow-xl backdrop-blur">
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
          onClick={toggle3D}
          className={cn(
            "flex size-7 items-center justify-center rounded-lg transition-colors",
            pitch3D
              ? "bg-accent-soft text-accent"
              : "text-muted hover:bg-surface-2 hover:text-ink",
          )}
          title={pitch3D ? "Switch to 2D Top View" : "Switch to 3D Aerial Perspective"}
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

      {/* Bottom Switch to Indoor CAD Prompt if layout is available */}
      {hasIndoorSchematic && onSelectTerminal && (
        <div className="absolute bottom-3 left-3 z-10">
          <button
            type="button"
            onClick={onSelectTerminal}
            className="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-surface/95 px-3 py-1.5 text-[11px] font-bold text-accent shadow-xl backdrop-blur transition-all hover:bg-accent-soft hover:border-accent"
          >
            <Layers className="size-3.5" />
            Switch to Multi-Level Indoor Concourse Map
          </button>
        </div>
      )}
    </div>
  );
}

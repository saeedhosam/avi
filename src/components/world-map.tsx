"use client";

import { useMemo, useRef, useState } from "react";
import { Globe2, Minus, Plus, RotateCcw } from "lucide-react";
import worldData from "@/data/world-countries.json";
import type { AirportNode, DirectFlightConnection } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CountryFeature {
  n: string;
  lat: number;
  lon: number;
  a: number;
  r: number[][][];
}

const countries = worldData as CountryFeature[];

const WIDTH = 1000;
const HEIGHT = 500;

function r2(value: number) {
  return Math.round(value * 100) / 100;
}

function mercatorX(lon: number) {
  return ((lon + 180) / 360) * WIDTH;
}

function mercatorY(lat: number) {
  const clamped = Math.max(-82, Math.min(82, lat));
  const rad = (clamped * Math.PI) / 180;
  const norm = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
  return norm * HEIGHT;
}

export interface WorldMapProps {
  airports?: AirportNode[];
  connections?: DirectFlightConnection[];
  origin?: AirportNode | null;
  selected?: AirportNode | null;
  selectedRoute?: DirectFlightConnection | null;
  onSelectAirport?: (iata: string) => void;
  onMapClick?: () => void;
  showLabels?: boolean;
  variant?: "light" | "dark";
  className?: string;
  showControls?: boolean;
  showBadge?: boolean;
  progress?: number;
  planePosition?: { latitude: number; longitude: number };
  heightClass?: string;
}

export function WorldMap({
  airports = [],
  connections = [],
  origin = null,
  selected = null,
  selectedRoute = null,
  onSelectAirport,
  onMapClick,
  showLabels = true,
  variant = "light",
  className,
  showControls = true,
  showBadge = true,
  progress,
  planePosition,
}: WorldMapProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  );

  const dark = variant === "dark";
  const palette = dark
    ? {
        ocean: "#08131F",
        land: "#12263A",
        border: "#22435F",
        label: "#5D7C97",
        route: "#D94A6A",
        routeGlow: "rgba(217,74,106,0.22)",
        origin: "#00E5FF",
        destination: "#38BDF8",
        selected: "#FFB800",
      }
    : {
        ocean: "#CBE7F9",
        land: "#F2F3F5",
        border: "#D3D8E0",
        label: "#7B8592",
        route: "#D94A6A",
        routeGlow: "rgba(217,74,106,0.2)",
        origin: "#0077FF",
        destination: "#0A335C",
        selected: "#FFB800",
      };

  const countryPaths = useMemo(() => {
    return countries.map((country) => {
      const path = country.r
        .map((ring) =>
          ring
            .map(([lat, lon], index) => {
              const x = mercatorX(lon).toFixed(1);
              const y = mercatorY(lat).toFixed(1);
              return `${index === 0 ? "M" : "L"}${x},${y}`;
            })
            .join(" ") + " Z",
        )
        .join(" ");
      return { name: country.n, path, area: country.a };
    });
  }, []);

  const labels = useMemo(() => {
    return countries
      .filter((country) => country.a >= 40)
      .map((country) => ({
        name: country.n,
        x: r2(mercatorX(country.lon)),
        y: r2(mercatorY(country.lat)),
        area: country.a,
      }))
      .sort((a, b) => b.area - a.area)
      .slice(0, 42);
  }, []);

  const arcs = useMemo(() => {
    return connections
      .map((connection) => {
        const from = connection.origin;
        const to = connection.destination;
        const x1 = r2(mercatorX(from.longitude));
        const y1 = r2(mercatorY(from.latitude));
        const x2 = r2(mercatorX(to.longitude));
        const y2 = r2(mercatorY(to.latitude));
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        const curve = Math.min(110, length * 0.22 + 14);
        const controlX = r2(midX - (dy / (length || 1)) * curve);
        const controlY = r2(midY + (dx / (length || 1)) * curve);
        const isSelected =
          selectedRoute?.origin.iata === from.iata &&
          selectedRoute?.destination.iata === to.iata;
        const isOriginRoute = !origin || origin.iata === from.iata;
        return {
          id: `${from.iata}-${to.iata}`,
          x1,
          y1,
          x2,
          y2,
          controlX,
          controlY,
          isSelected,
          isOriginRoute,
          connection,
        };
      })
      .filter((arc) => arc.isOriginRoute || arc.isSelected);
  }, [connections, origin, selectedRoute]);

  const visibleAirportMap = useMemo(() => {
    const map = new Map<string, AirportNode>();
    for (const airport of airports) map.set(airport.iata, airport);
    if (origin) map.set(origin.iata, origin);
    if (selected) map.set(selected.iata, selected);
    for (const connection of connections) {
      map.set(connection.origin.iata, connection.origin);
      map.set(connection.destination.iata, connection.destination);
    }
    return [...map.values()];
  }, [airports, connections, origin, selected]);

  const selectedArc = arcs.find((arc) => arc.isSelected);
  const plane = useMemo(() => {
    if (!selectedArc || progress == null) return null;
    const t = Math.max(0, Math.min(1, progress));
    const x = r2(
      (1 - t) ** 2 * selectedArc.x1 +
      2 * (1 - t) * t * selectedArc.controlX +
      t ** 2 * selectedArc.x2,
    );
    const y = r2(
      (1 - t) ** 2 * selectedArc.y1 +
      2 * (1 - t) * t * selectedArc.controlY +
      t ** 2 * selectedArc.y2,
    );
    return { x, y, angle: Math.atan2(selectedArc.controlY - selectedArc.y1, selectedArc.controlX - selectedArc.x1) * (180 / Math.PI) + 90 };
  }, [selectedArc, progress]);

  const planeMarker = useMemo(() => {
    if (planePosition) {
      return {
        x: r2(mercatorX(planePosition.longitude)),
        y: r2(mercatorY(planePosition.latitude)),
        angle: 0,
      };
    }
    return plane;
  }, [plane, planePosition]);

  const applyZoom = (delta: number) => {
    setZoom((value) => Math.max(1, Math.min(5, Number((value + delta).toFixed(2)))));
  };

  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    applyZoom(event.deltaY > 0 ? -0.18 : 0.18);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line/80",
        dark ? "bg-[#08131F]" : "bg-[#CBE7F9]",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={(event) => {
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
          };
          (event.target as Element).setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const scale = WIDTH / (event.currentTarget.clientWidth || 1);
          setPan({
            x: drag.current.panX + (event.clientX - drag.current.x) * scale,
            y: drag.current.panY + (event.clientY - drag.current.y) * scale,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onMapClick?.();
        }}
        role="img"
        aria-label="Interactive world route map"
      >
        <defs>
          <linearGradient id="ocean-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dark ? "#0A1A2B" : "#D7EDFC"} />
            <stop offset="100%" stopColor={palette.ocean} />
          </linearGradient>
          <filter id="route-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="plane-halo">
            <stop offset="0%" stopColor={palette.route} stopOpacity="0.45" />
            <stop offset="100%" stopColor={palette.route} stopOpacity="0" />
          </radialGradient>
          <clipPath id="world-clip">
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} />
          </clipPath>
        </defs>

        <rect width={WIDTH} height={HEIGHT} fill="url(#ocean-grad)" />
        <g
          transform={`translate(${pan.x} ${pan.y}) translate(${WIDTH / 2} ${HEIGHT / 2}) scale(${zoom}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`}
          clipPath="url(#world-clip)"
        >
          <g>
            {countryPaths.map((country) => (
              <path
                key={country.name}
                d={country.path}
                fill={palette.land}
                stroke={palette.border}
                strokeWidth={0.55 / zoom}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {showLabels && (
            <g pointerEvents="none">
              {labels.map((label) => (
                <text
                  key={`${label.name}-${label.x}`}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fill={palette.label}
                  fontSize={Math.max(4.5, 7 / Math.sqrt(zoom))}
                  fontWeight={600}
                  letterSpacing="0.06em"
                  opacity={0.86}
                >
                  {label.name.toUpperCase()}
                </text>
              ))}
            </g>
          )}

          <g>
            {arcs.map((arc) => (
              <g key={arc.id}>
                <path
                  d={`M${arc.x1},${arc.y1} Q${arc.controlX},${arc.controlY} ${arc.x2},${arc.y2}`}
                  fill="none"
                  stroke={arc.isSelected ? "#C2185B" : palette.route}
                  strokeOpacity={arc.isSelected ? 0.9 : 0.55}
                  strokeWidth={arc.isSelected ? 2.2 : 1}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  filter={arc.isSelected ? "url(#route-glow)" : undefined}
                />
                {arc.isSelected && (
                  <path
                    d={`M${arc.x1},${arc.y1} Q${arc.controlX},${arc.controlY} ${arc.x2},${arc.y2}`}
                    fill="none"
                    stroke="#FF5C8A"
                    strokeOpacity={0.4}
                    strokeWidth={5}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
              </g>
            ))}
          </g>

          <g>
            {visibleAirportMap.map((airport) => {
              const isOrigin = origin?.iata === airport.iata;
              const isSelected = selected?.iata === airport.iata;
              const isDest =
                selectedRoute?.destination.iata === airport.iata ||
                connectionDestination(connections, airport.iata);
              const x = r2(mercatorX(airport.longitude));
              const y = r2(mercatorY(airport.latitude));
              const color = isOrigin
                ? palette.origin
                : isSelected
                  ? palette.selected
                  : isDest
                    ? palette.destination
                    : dark
                      ? "#57748E"
                      : "#6C829A";
              const radius = isOrigin || isSelected ? 5 : isDest ? 3.6 : 2.4;
              return (
                <g
                  key={airport.iata}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectAirport?.(airport.iata);
                  }}
                  className="cursor-pointer"
                >
                  <title>{`${airport.city} (${airport.iata}) · ${airport.name}`}</title>
                  {(isOrigin || isSelected) && (
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 5}
                      fill={color}
                      opacity={0.15}
                      className="animate-pulse-dot"
                    />
                  )}
                  <circle cx={x} cy={y} r={radius + 2.5} fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    fill={color}
                    stroke={dark ? "#06101A" : "#FFFFFF"}
                    strokeWidth={1.3 / zoom}
                  />
                  {isOrigin && (
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 3}
                      fill="none"
                      stroke={color}
                      strokeWidth={1 / zoom}
                      opacity={0.8}
                    />
                  )}
                  {(isOrigin || isSelected) && (
                    <g pointerEvents="none">
                      <rect
                        x={x + 9}
                        y={y - 16}
                        width={airport.iata.length * 7 + 46}
                        height={19}
                        rx={4}
                        fill={dark ? "rgba(7,14,23,0.92)" : "rgba(255,255,255,0.95)"}
                        stroke={palette.border}
                        strokeWidth={0.6}
                      />
                      <text
                        x={x + 14}
                        y={y - 3.5}
                        fill={color}
                        fontSize={7.5}
                        fontWeight={800}
                        fontFamily="var(--font-geist-mono), monospace"
                      >
                        {airport.iata}
                      </text>
                      <text
                        x={x + 14 + airport.iata.length * 5.4}
                        y={y - 3.5}
                        fill={dark ? "#D8E5F0" : "#16283B"}
                        fontSize={6.8}
                        fontWeight={600}
                      >
                        {airport.city}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {planeMarker && (
            <g transform={`translate(${planeMarker.x} ${planeMarker.y})`}>
              <circle r={34} fill="url(#plane-halo)" />
              <circle
                r={13}
                fill="none"
                stroke="#D94A6A"
                strokeWidth={1}
                opacity={0.7}
                className="animate-radar-pulse"
              />
              <g transform={`rotate(${planeMarker.angle})`}>
                <path
                  d="M0,-13 L3.5,-3 L14,3 L14,6.5 L4,4.5 L4,10.5 L7,13 L0,11.5 L-7,13 L-4,10.5 L-4,4.5 L-14,6.5 L-14,3 L-3.5,-3 Z"
                  fill="#D94A6A"
                  stroke="#FFF"
                  strokeWidth={0.8}
                />
              </g>
            </g>
          )}
        </g>
      </svg>

      {showControls && (
        <>
          {showBadge && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-line/70 bg-surface/85 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted backdrop-blur">
              <Globe2 className="size-3 text-accent" />
              Web Mercator · Natural Earth
            </div>
          )}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1">
            <MapButton label="Zoom in" onClick={() => applyZoom(0.35)}>
              <Plus className="size-3.5" />
            </MapButton>
            <MapButton label="Zoom out" onClick={() => applyZoom(-0.35)}>
              <Minus className="size-3.5" />
            </MapButton>
            <MapButton
              label="Reset view"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <RotateCcw className="size-3.5" />
            </MapButton>
          </div>
          <div className="absolute bottom-3 left-3 rounded-lg border border-line/70 bg-surface/85 px-2 py-1 text-[9px] font-bold text-muted backdrop-blur">
            {zoom.toFixed(1)}× · {arcs.length} routes · {visibleAirportMap.length} airports
          </div>
        </>
      )}
    </div>
  );
}

function connectionDestination(
  connections: DirectFlightConnection[],
  iata: string,
) {
  return connections.some((connection) => connection.destination.iata === iata);
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md border border-line/70 bg-surface/90 text-muted backdrop-blur transition-colors hover:border-accent/50 hover:text-accent"
    >
      {children}
    </button>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, Route } from "lucide-react";
import type {
  AirportTerminalLayout,
  AmenityCategory,
  ConcourseFloor,
  TerminalAmenity,
} from "@/lib/types";
import { PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

export const AMENITY_META: Record<
  AmenityCategory,
  { label: string; color: string; short: string }
> = {
  ALL: { label: "All", color: PALETTE.amenities.ALL, short: "ALL" },
  GATE: { label: "Gates", color: PALETTE.amenities.GATE, short: "G" },
  LOUNGE: { label: "Lounges", color: PALETTE.amenities.LOUNGE, short: "L" },
  SECURITY: {
    label: "Security",
    color: PALETTE.amenities.SECURITY,
    short: "S",
  },
  DINING: {
    label: "Dining & Coffee",
    color: PALETTE.amenities.DINING,
    short: "D",
  },
  SHOPPING: {
    label: "Duty Free & Shops",
    color: PALETTE.amenities.SHOPPING,
    short: "SH",
  },
  RESTROOM: {
    label: "Restrooms",
    color: PALETTE.amenities.RESTROOM,
    short: "WC",
  },
  TRANSIT: {
    label: "Transit & Baggage",
    color: PALETTE.amenities.TRANSIT,
    short: "B",
  },
};

const W = 1000;
const H = 620;

export function TerminalMap({
  layout,
  floor,
  amenities,
  selectedAmenity,
  showWalkingRoute,
  onSelectAmenity,
  className,
}: {
  layout: AirportTerminalLayout;
  floor: ConcourseFloor;
  amenities: TerminalAmenity[];
  selectedAmenity: TerminalAmenity | null;
  showWalkingRoute: boolean;
  onSelectAmenity: (amenity: TerminalAmenity) => void;
  className?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  );

  const selected = selectedAmenity;
  const routePath = useMemo(() => {
    if (!selected || !showWalkingRoute) return null;
    const security = floor.securityPosition;
    const hub = floor.centralHubCenter;
    const target = selected.position;
    return `M${security.x * W},${security.y * H} L${hub.x * W},${hub.y * H} L${target.x * W},${target.y * H}`;
  }, [selected, showWalkingRoute, floor]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-surface",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full touch-none"
        preserveAspectRatio="xMidYMid meet"
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) =>
            Math.max(1, Math.min(2.8, value + (event.deltaY > 0 ? -0.12 : 0.12))),
          );
        }}
        onPointerDown={(event) => {
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const scale = W / (event.currentTarget.clientWidth || 1);
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
      >
        <defs>
          <radialGradient id="terminal-bg" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="var(--surface-3)" />
            <stop offset="100%" stopColor="var(--surface)" />
          </radialGradient>
          <filter id="amenity-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="terminal-grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path
              d="M 36 0 L 0 0 0 36"
              fill="none"
              stroke="var(--accent)"
              strokeOpacity="0.05"
              strokeWidth="0.7"
            />
          </pattern>
        </defs>

        <rect width={W} height={H} fill="url(#terminal-bg)" />
        <rect width={W} height={H} fill="url(#terminal-grid)" />

        <g
          transform={`translate(${pan.x} ${pan.y}) translate(${W / 2} ${H / 2}) scale(${zoom * 1.18}) translate(${-W / 2} ${-H / 2})`}
        >
          {/* Concourse shells */}
          <g>
            {floor.concourseSections.map((section) => {
              const x1 = section.start.x * W;
              const y1 = section.start.y * H;
              const x2 = section.end.x * W;
              const y2 = section.end.y * H;
              const width = Math.max(10, section.width * H);
              return (
                <g key={section.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="var(--surface)"
                    strokeWidth={width + 14}
                    strokeLinecap="round"
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="var(--surface-3)"
                    strokeWidth={width + 6}
                    strokeLinecap="round"
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="var(--border-strong)"
                    strokeWidth={width}
                    strokeLinecap="round"
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="var(--accent)"
                    strokeOpacity={0.22}
                    strokeWidth={0.9}
                    strokeDasharray="8 7"
                  />
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - width / 2 - 6}
                    textAnchor="middle"
                    fill="var(--muted)"
                    fontSize={8}
                    fontWeight={700}
                  >
                    {section.name}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Central hub / security / entrance */}
          <g>
            <circle
              cx={floor.centralHubCenter.x * W}
              cy={floor.centralHubCenter.y * H}
              r={26}
              fill="var(--surface-3)"
              stroke="var(--border-strong)"
              strokeWidth={1.5}
            />
            <circle
              cx={floor.centralHubCenter.x * W}
              cy={floor.centralHubCenter.y * H}
              r={16}
              fill="var(--surface-2)"
              stroke="var(--accent-2)"
              strokeOpacity={0.4}
              strokeWidth={0.8}
            />
            <text
              x={floor.centralHubCenter.x * W}
              y={floor.centralHubCenter.y * H + 3}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize={6.5}
              fontWeight={700}
            >
              HUB
            </text>

            <circle
              cx={floor.securityPosition.x * W}
              cy={floor.securityPosition.y * H}
              r={12}
              fill="var(--accent-2)"
              fillOpacity={0.18}
              stroke="var(--accent-2)"
              strokeWidth={1.3}
            />
            <text
              x={floor.securityPosition.x * W}
              y={floor.securityPosition.y * H + 3}
              textAnchor="middle"
              fill="var(--text)"
              fontSize={7}
              fontWeight={800}
            >
              S
            </text>
            <text
              x={floor.securityPosition.x * W + 17}
              y={floor.securityPosition.y * H + 2.5}
              fill="var(--text)"
              fontSize={6.5}
              fontWeight={700}
            >
              SECURITY
            </text>

            <circle
              cx={floor.entrancePosition.x * W}
              cy={floor.entrancePosition.y * H}
              r={9}
              fill="var(--muted)"
              fillOpacity={0.18}
              stroke="var(--muted)"
              strokeWidth={1.2}
            />
            <text
              x={floor.entrancePosition.x * W}
              y={floor.entrancePosition.y * H + 26}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize={6.5}
              fontWeight={700}
            >
              ENTRANCE
            </text>
          </g>

          {/* Walking route */}
          {routePath && (
            <g>
              <path
                d={routePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={7}
                strokeOpacity={0.16}
                strokeLinecap="round"
              />
              <path
                d={routePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="7 6"
                strokeLinecap="round"
                className="animate-dash-flow"
              />
              <text
                x={selected!.position.x * W + 12}
                y={selected!.position.y * H - 20}
                fill="var(--accent)"
                fontSize={7}
                fontWeight={800}
              >
                Illustrative route · distances not reported
              </text>
            </g>
          )}

          {/* Amenities */}
          {amenities.map((amenity) => {
            const x = amenity.position.x * W;
            const y = amenity.position.y * H;
            const meta = AMENITY_META[amenity.category];
            const isSelected = selected?.id === amenity.id;
            const isGate = amenity.category === "GATE";
            const size = isGate ? 9 : 7;
            return (
              <g
                key={amenity.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectAmenity(amenity);
                }}
                className="cursor-pointer"
              >
                <title>{`${amenity.name}${amenity.gateNumber ? ` · Gate ${amenity.gateNumber}` : ""}`}</title>
                {isSelected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={20}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={1.5}
                    opacity={0.7}
                    className="animate-radar-pulse"
                  />
                )}
                <circle cx={x} cy={y} r={14} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={size}
                  fill={isSelected ? meta.color : `${meta.color}33`}
                  stroke={meta.color}
                  strokeWidth={1.3}
                  filter={isSelected ? "url(#amenity-glow)" : undefined}
                />
                <text
                  x={x}
                  y={y + 2.2}
                  textAnchor="middle"
                  fill={isSelected ? "var(--bg)" : meta.color}
                  fontSize={isGate ? 6.5 : 5}
                  fontWeight={800}
                >
                  {isGate ? amenity.gateNumber ?? "G" : meta.short}
                </text>
                {isGate && (
                  <text
                    x={x}
                    y={y + 17}
                    textAnchor="middle"
                    fill="var(--muted)"
                    fontSize={5.7}
                    fontWeight={700}
                  >
                    {amenity.gateNumber}
                  </text>
                )}
              </g>
            );
          })}

          {/* Selected callout */}
          {selected && (
            <g pointerEvents="none">
              <line
                x1={selected.position.x * W}
                y1={selected.position.y * H - 12}
                x2={selected.position.x * W}
                y2={selected.position.y * H - 52}
                stroke={AMENITY_META[selected.category].color}
                strokeWidth={0.8}
              />
              <rect
                x={selected.position.x * W - 80}
                y={selected.position.y * H - 76}
                width={160}
                height={27}
                rx={5}
                fill="rgba(9,9,11,0.94)"
                stroke={AMENITY_META[selected.category].color}
                strokeOpacity={0.6}
                strokeWidth={0.8}
              />
              <text
                x={selected.position.x * W}
                y={selected.position.y * H - 65}
                textAnchor="middle"
                fill="var(--text)"
                fontSize={7}
                fontWeight={700}
              >
                {selected.name.length > 30
                  ? `${selected.name.slice(0, 29)}…`
                  : selected.name}
              </text>
              <text
                x={selected.position.x * W}
                y={selected.position.y * H - 55}
                textAnchor="middle"
                fill={AMENITY_META[selected.category].color}
                fontSize={6}
                fontWeight={700}
              >
                {selected.category} · {selected.terminal} · Level {selected.level}
              </text>
            </g>
          )}
        </g>
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-line/70 bg-surface/85 px-2 py-1 backdrop-blur">
        <Route className="size-3 text-accent" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-ink">
          Level {floor.level} · {floor.levelName}
        </span>
      </div>

      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          onClick={() => setZoom((value) => Math.min(2.8, value + 0.25))}
          className="flex size-7 items-center justify-center rounded-md border border-line/70 bg-surface/90 text-muted backdrop-blur transition-colors hover:text-accent"
          aria-label="Zoom in"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
          className="flex size-7 items-center justify-center rounded-md border border-line/70 bg-surface/90 text-muted backdrop-blur transition-colors hover:text-accent"
          aria-label="Zoom out"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="flex size-7 items-center justify-center rounded-md border border-line/70 bg-surface/90 text-muted backdrop-blur transition-colors hover:text-accent"
          aria-label="Reset map view"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-line/70 bg-surface/85 px-2 py-1 text-[8px] font-semibold text-subtle backdrop-blur">
        {layout.airportCode} {layout.terminalId} · {amenities.length} amenities ·{" "}
        {zoom.toFixed(1)}×
      </div>
    </div>
  );
}

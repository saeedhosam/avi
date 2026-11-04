"use client";

import { useMemo, useRef, useState } from "react";
import {
  Fullscreen,
  Minimize2,
  LocateFixed,
  Radar as RadarIcon,
  CloudLightning,
} from "lucide-react";
import type { Flight } from "@/lib/types";
import { STATUS_META, cn } from "@/lib/utils";

export function RadarMap({
  flight,
  className,
  isExpanded = false,
  onToggleExpand,
  hideControls = false,
}: {
  flight: Flight;
  className?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  hideControls?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [weather, setWeather] = useState(true);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  );

  const progress =
    flight.status === "LANDED"
      ? 1
      : flight.status === "SCHEDULED" || flight.status === "CANCELLED"
        ? 0.05
        : Math.min(0.98, Math.max(0.05, flight.telemetry.progressPercent));

  const geometry = useMemo(() => {
    const startX = 150;
    const startY = 360;
    const endX = 650;
    const endY = 180;
    const controlX = 400;
    const controlY = 150;
    const t = progress;
    const planeX =
      (1 - t) ** 2 * startX + 2 * (1 - t) * t * controlX + t ** 2 * endX;
    const planeY =
      (1 - t) ** 2 * startY + 2 * (1 - t) * t * controlY + t ** 2 * endY;
    const partialControlX = startX + (controlX - startX) * t;
    const partialControlY = startY + (controlY - startY) * t;
    return { startX, startY, endX, endY, controlX, controlY, planeX, planeY, partialControlX, partialControlY, t };
  }, [progress]);

  const headingAngle =
    Math.atan2(geometry.planeY - geometry.partialControlY, geometry.planeX - geometry.partialControlX) *
      (180 / Math.PI) -
    90;

  const statusMeta = STATUS_META[flight.status];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-surface",
        className,
      )}
    >
      <svg
        viewBox="0 0 800 520"
        className="h-full w-full touch-none"
        preserveAspectRatio="xMidYMid slice"
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) =>
            Math.max(1, Math.min(3, value + (event.deltaY > 0 ? -0.15 : 0.15))),
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
          const scale = 800 / (event.currentTarget.clientWidth || 1);
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
          <radialGradient id="radar-bg" cx="50%" cy="45%" r="80%">
            <stop offset="0%" stopColor="#10263D" />
            <stop offset="65%" stopColor="#0A1727" />
            <stop offset="100%" stopColor="#060D16" />
          </radialGradient>
          <linearGradient id="radar-sweep-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.22" />
          </linearGradient>
          <radialGradient id="radar-halo">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="storm-cell">
            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.42" />
            <stop offset="55%" stopColor="#F59E0B" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rain-cell">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </radialGradient>
          <filter id="radar-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="800" height="520" fill="url(#radar-bg)" />

        <g
          transform={`translate(${pan.x} ${pan.y}) translate(400 260) scale(${zoom}) translate(-400 -260)`}
        >
          {/* Grid */}
          <g opacity={0.5}>
            {Array.from({ length: 17 }, (_, index) => (
              <line
                key={`v-${index}`}
                x1={index * 50}
                y1={0}
                x2={index * 50}
                y2={520}
                stroke="#00E5FF"
                strokeOpacity={0.055}
                strokeWidth={0.6}
              />
            ))}
            {Array.from({ length: 12 }, (_, index) => (
              <line
                key={`h-${index}`}
                x1={0}
                y1={index * 50}
                x2={800}
                y2={index * 50}
                stroke="#00E5FF"
                strokeOpacity={0.055}
                strokeWidth={0.6}
              />
            ))}
          </g>

          {/* Range rings */}
          {[1, 2, 3, 4].map((ring) => (
            <circle
              key={ring}
              cx={400}
              cy={260}
              r={ring * 62}
              fill="none"
              stroke="#00E5FF"
              strokeOpacity={0.11}
              strokeWidth={0.8}
              strokeDasharray="8 8"
            />
          ))}
          <line x1={70} y1={260} x2={730} y2={260} stroke="#00E5FF" strokeOpacity={0.09} />
          <line x1={400} y1={20} x2={400} y2={500} stroke="#00E5FF" strokeOpacity={0.09} />

          {/* Rotating sweep */}
          <g
            className="animate-radar-sweep"
            style={{ transformOrigin: "400px 260px" }}
          >
            <path
              d="M400,260 L400,50 A210,210 0 0,1 548,112 Z"
              fill="url(#radar-sweep-grad)"
              opacity={0.75}
            />
            <line
              x1={400}
              y1={260}
              x2={400}
              y2={50}
              stroke="#00E5FF"
              strokeOpacity={0.35}
              strokeWidth={1.2}
            />
          </g>

          {/* Weather cells */}
          {weather && (
            <g>
              <circle cx={520} cy={160} r={95} fill="url(#storm-cell)" />
              <circle cx={250} cy={350} r={70} fill="url(#rain-cell)" />
              <circle cx={590} cy={350} r={55} fill="url(#rain-cell)" />
              <ellipse
                cx={520}
                cy={160}
                rx={48}
                ry={22}
                fill="none"
                stroke="#EF4444"
                strokeOpacity={0.18}
                strokeDasharray="4 5"
              />
            </g>
          )}

          {/* Flight path */}
          <path
            d={`M${geometry.startX},${geometry.startY} Q${geometry.controlX},${geometry.controlY} ${geometry.endX},${geometry.endY}`}
            fill="none"
            stroke="#64748B"
            strokeOpacity={0.5}
            strokeWidth={2}
            strokeDasharray="12 10"
          />
          <path
            d={`M${geometry.startX},${geometry.startY} Q${geometry.partialControlX},${geometry.partialControlY} ${geometry.planeX},${geometry.planeY}`}
            fill="none"
            stroke="#00E5FF"
            strokeOpacity={0.4}
            strokeWidth={7}
            strokeLinecap="round"
            filter="url(#radar-glow)"
          />
          <path
            d={`M${geometry.startX},${geometry.startY} Q${geometry.partialControlX},${geometry.partialControlY} ${geometry.planeX},${geometry.planeY}`}
            fill="none"
            stroke="#00E5FF"
            strokeWidth={2.4}
            strokeLinecap="round"
          />

          {/* Waypoints */}
          {[0.25, 0.45, 0.7, 0.85].map((t) => {
            const x =
              (1 - t) ** 2 * geometry.startX +
              2 * (1 - t) * t * geometry.controlX +
              t ** 2 * geometry.endX;
            const y =
              (1 - t) ** 2 * geometry.startY +
              2 * (1 - t) * t * geometry.controlY +
              t ** 2 * geometry.endY;
            return (
              <rect
                key={t}
                x={x - 3.5}
                y={y - 3.5}
                width={7}
                height={7}
                transform={`rotate(45 ${x} ${y})`}
                fill="none"
                stroke="#94A3B8"
                strokeWidth={1}
              />
            );
          })}

          {/* Origin / destination */}
          <g>
            <circle cx={geometry.startX} cy={geometry.startY} r={8} fill="#00E5FF" opacity={0.2} />
            <circle cx={geometry.startX} cy={geometry.startY} r={5} fill="#00E5FF" stroke="#0C1929" strokeWidth={2} />
            <text
              x={geometry.startX - 2}
              y={geometry.startY + 22}
              textAnchor="middle"
              fill="#F8FAFC"
              fontSize={11}
              fontWeight={800}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {flight.origin.code}
            </text>
            <text
              x={geometry.startX}
              y={geometry.startY + 34}
              textAnchor="middle"
              fill="#64748B"
              fontSize={8}
            >
              {flight.origin.city}
            </text>
          </g>
          <g>
            <circle cx={geometry.endX} cy={geometry.endY} r={8} fill="#10B981" opacity={0.2} />
            <circle cx={geometry.endX} cy={geometry.endY} r={5} fill="#10B981" stroke="#0C1929" strokeWidth={2} />
            <text
              x={geometry.endX}
              y={geometry.endY + 22}
              textAnchor="middle"
              fill="#F8FAFC"
              fontSize={11}
              fontWeight={800}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {flight.destination.code}
            </text>
            <text
              x={geometry.endX}
              y={geometry.endY + 34}
              textAnchor="middle"
              fill="#64748B"
              fontSize={8}
            >
              {flight.destination.city}
            </text>
          </g>

          {/* Aircraft */}
          <g transform={`translate(${geometry.planeX} ${geometry.planeY})`}>
            <circle r={36} fill="url(#radar-halo)" />
            <circle
              r={20}
              fill="none"
              stroke="#00E5FF"
              strokeWidth={1.2}
              opacity={0.7}
              className="animate-radar-pulse"
            />
            <g transform={`rotate(${headingAngle})`}>
              <path
                d="M0,-16 L4,-5 L17,3 L17,7 L5,4.5 L5,12 L9,15 L0,13 L-9,15 L-5,12 L-5,4.5 L-17,7 L-17,3 L-4,-5 Z"
                fill="#00E5FF"
                stroke="#071018"
                strokeWidth={1}
              />
              <circle cy={-4} r={1.8} fill="#FFFFFF" />
            </g>
            <g transform="translate(26 -26)">
              <rect
                x={0}
                y={0}
                width={96}
                height={26}
                rx={6}
                fill="rgba(7,14,23,0.9)"
                stroke="#264366"
                strokeWidth={0.8}
              />
              <text x={6} y={11} fill="#00E5FF" fontSize={7} fontWeight={800}>
                {flight.flightNumber}
              </text>
              <text x={6} y={21} fill="#94A3B8" fontSize={6.5}>
                {flight.telemetry.groundSpeedKnots} kt · {flight.telemetry.altitudeFeet.toLocaleString()} ft
              </text>
            </g>
          </g>
        </g>
      </svg>

      {/* Top overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-line/70 bg-surface/90 px-2.5 py-1.5 backdrop-blur">
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: statusMeta.color }}
          />
          <span className="text-[11px] font-bold text-ink">
            {flight.origin.code} → {flight.destination.code}
          </span>
          <span className="text-subtle">·</span>
          <span className="text-[11px] font-semibold text-accent tabular">
            {Math.round(progress * 100)}%
          </span>
        </div>
        {!hideControls && (
          <div className="pointer-events-auto flex items-center gap-1.5">
            <MapControl
              label="Toggle weather radar"
              active={weather}
              onClick={() => setWeather((value) => !value)}
            >
              <CloudLightning className="size-3.5" />
            </MapControl>
            <MapControl
              label="Center on aircraft"
              onClick={() => {
                setPan({ x: 0, y: 0 });
                setZoom(1);
              }}
            >
              <LocateFixed className="size-3.5" />
            </MapControl>
            {onToggleExpand && (
              <MapControl
                label="Toggle fullscreen map"
                onClick={onToggleExpand}
              >
                {isExpanded ? (
                  <Minimize2 className="size-3.5" />
                ) : (
                  <Fullscreen className="size-3.5" />
                )}
              </MapControl>
            )}
          </div>
        )}
      </div>

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
        <div className="pointer-events-auto rounded-xl border border-line/80 bg-surface/92 px-3 py-2 backdrop-blur">
          <div className="grid grid-cols-4 divide-x divide-line/70">
            <HudItem label="Altitude" value={`${flight.telemetry.altitudeFeet.toLocaleString()} ft`} accent />
            <HudItem label="Speed" value={`${flight.telemetry.groundSpeedKnots} kts`} />
            <HudItem label="Mach" value={`M ${flight.telemetry.mach.toFixed(2)}`} />
            <HudItem
              label="Remaining"
              value={`${flight.telemetry.distanceRemainingNm} nm`}
              sub={`${flight.telemetry.etaMinutesRemaining}m`}
            />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-3 top-14 flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-subtle">
        <RadarIcon className="size-3 text-accent" /> Tactical radar sweep
      </div>
    </div>
  );
}

function MapControl({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-full border backdrop-blur transition-colors",
        active
          ? "border-accent/60 bg-accent-soft text-accent"
          : "border-line/70 bg-surface/90 text-muted hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}

function HudItem({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="px-2 text-center first:pl-0 last:pr-0">
      <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-subtle">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[11px] font-bold tabular",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[9px] font-semibold text-accent-2">{sub}</p>}
    </div>
  );
}

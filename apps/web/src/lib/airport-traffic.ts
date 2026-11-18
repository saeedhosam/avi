import type { ExpressionSpecification } from "maplibre-gl";
import { PALETTE } from "./palette";

/**
 * Airport connectivity buckets.
 *
 * Counts come from `apps/web/public/airports-routes.csv` (`Active Route
 * Count`), not from live schedules. The ramp runs from deep ocean blue for
 * quiet airports to pale ice blue for the busiest hubs, so density reads at a
 * glance without leaving the dark instrument theme.
 */
export const AIRPORT_TRAFFIC_BUCKETS = [
  {
    id: "MEGA",
    label: "40+",
    range: "40+ active routes",
    color: PALETTE.traffic.MEGA,
  },
  {
    id: "HIGH",
    label: "10–39",
    range: "10–39 active routes",
    color: PALETTE.traffic.HIGH,
  },
  {
    id: "MEDIUM",
    label: "3–9",
    range: "3–9 active routes",
    color: PALETTE.traffic.MEDIUM,
  },
  {
    id: "LOW",
    label: "1–2",
    range: "1–2 active routes",
    color: PALETTE.traffic.LOW,
  },
] as const;

/** MapLibre colour expression driven by a feature's `count` property. */
export const AIRPORT_TRAFFIC_COLOR_EXPRESSION: ExpressionSpecification = [
  "step",
  ["get", "count"],
  PALETTE.subtle,
  1,
  PALETTE.traffic.LOW,
  3,
  PALETTE.traffic.MEDIUM,
  10,
  PALETTE.traffic.HIGH,
  40,
  PALETTE.traffic.MEGA,
];

/**
 * One dot size for every airport; connectivity is conveyed by colour alone.
 * The radius grows gently with zoom so the dots stay comfortable close-up.
 */
export const AIRPORT_TRAFFIC_RADIUS_EXPRESSION: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  2,
  2,
  5,
  5,
  9,
  9,
];

/**
 * Invisible hit target around each dot. MapLibre only allows a zoom
 * expression at the top level of `interpolate`, so the extra 9px is baked
 * into each stop rather than added to the visual radius expression.
 */
export const AIRPORT_HITBOX_RADIUS_EXPRESSION: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  2,
  11,
  5,
  14,
  9,
  18,
];

/** Solid traffic colour for an airport's active route count. */
export function airportTrafficColor(count: number): string {
  if (count >= 40) return PALETTE.traffic.MEGA;
  if (count >= 10) return PALETTE.traffic.HIGH;
  if (count >= 3) return PALETTE.traffic.MEDIUM;
  if (count >= 1) return PALETTE.traffic.LOW;
  return PALETTE.subtle;
}

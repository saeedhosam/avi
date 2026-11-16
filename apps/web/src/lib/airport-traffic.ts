import type { ExpressionSpecification } from "maplibre-gl";
import { PALETTE } from "./palette";

/**
 * Approximate airport connectivity buckets.
 *
 * Counts come from the bundled OpenFlights-derived reference catalog
 * (`destCount`), not from live schedules. The ramp runs from deep ocean blue
 * for quiet airports to pale ice blue for the busiest hubs, so density reads
 * at a glance without leaving the dark instrument theme.
 */
export const AIRPORT_TRAFFIC_BUCKETS = [
  {
    id: "MEGA",
    label: "40+",
    range: "40+ non-stop routes",
    color: PALETTE.traffic.MEGA,
  },
  {
    id: "HIGH",
    label: "10–39",
    range: "10–39 non-stop routes",
    color: PALETTE.traffic.HIGH,
  },
  {
    id: "MEDIUM",
    label: "3–9",
    range: "3–9 non-stop routes",
    color: PALETTE.traffic.MEDIUM,
  },
  {
    id: "LOW",
    label: "1–2",
    range: "1–2 non-stop routes",
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
  2, 2,
  5, 5,
  9, 9,
];

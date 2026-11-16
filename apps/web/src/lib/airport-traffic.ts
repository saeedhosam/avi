import type { ExpressionSpecification } from "maplibre-gl";
import { PALETTE } from "./palette";

/**
 * Approximate airport connectivity buckets.
 *
 * Counts come from the bundled OpenFlights-derived reference catalog
 * (`destCount`), not from live schedules. The colours reuse the existing
 * cockpit haul palette so the map stays within the established theme.
 */
export const AIRPORT_TRAFFIC_BUCKETS = [
  {
    id: "MEGA",
    label: "40+",
    range: "40+ non-stop routes",
    color: PALETTE.haul.LONG_HAUL,
  },
  {
    id: "HIGH",
    label: "10–39",
    range: "10–39 non-stop routes",
    color: PALETTE.haul.MEDIUM_HAUL,
  },
  {
    id: "MEDIUM",
    label: "3–9",
    range: "3–9 non-stop routes",
    color: PALETTE.haul.SHORT_HAUL,
  },
  {
    id: "LOW",
    label: "1–2",
    range: "1–2 non-stop routes",
    color: PALETTE.haul.ALL,
  },
  {
    id: "NONE",
    label: "0",
    range: "No reported routes",
    color: PALETTE.subtle,
  },
] as const;

/** MapLibre colour expression driven by a feature's `count` property. */
export const AIRPORT_TRAFFIC_COLOR_EXPRESSION: ExpressionSpecification = [
  "step",
  ["get", "count"],
  PALETTE.subtle,
  1,
  PALETTE.haul.ALL,
  3,
  PALETTE.haul.SHORT_HAUL,
  10,
  PALETTE.haul.MEDIUM_HAUL,
  40,
  PALETTE.haul.LONG_HAUL,
];

/** Slightly larger dots for busier airports. */
export const AIRPORT_TRAFFIC_RADIUS_EXPRESSION: ExpressionSpecification = [
  "step",
  ["get", "count"],
  1.9,
  3,
  2.3,
  10,
  2.7,
  40,
  3.2,
  120,
  3.9,
];

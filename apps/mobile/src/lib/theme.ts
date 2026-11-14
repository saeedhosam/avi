export const COLORS = {
  cockpit: "#050b14",
  surface: "#0b1424",
  surface2: "#101d30",
  line: "#1e3a4c",
  radar: "#22d3ee",
  radarDim: "#0e7490",
  blue: "#60a5fa",
  amber: "#fbbf24",
  green: "#34d399",
  red: "#f87171",
  text: "#e2e8f0",
  muted: "#94a3b8",
  white: "#f8fafc",
} as const;

export const HAUL_COLORS = {
  SHORT_HAUL: "#34d399",
  MEDIUM_HAUL: "#fbbf24",
  LONG_HAUL: "#f472b6",
  ALL: COLORS.radar,
} as const;

export const COLORS = {
  cockpit: "#070B11",
  surface: "#0B141D",
  surface2: "#101D28",
  surface3: "#162734",
  line: "#1D2E3C",
  lineStrong: "#2B4557",
  radar: "#35D3E6",
  radarDim: "#1C7B86",
  blue: "#5BA7D9",
  amber: "#E0A24C",
  green: "#35C48F",
  red: "#E26F6F",
  text: "#E9EFF5",
  muted: "#9AACBA",
  subtle: "#7E909D",
  white: "#F2F6FA",
  /** Warm surface for attention cards; pair with `amber` borders. */
  amberSurface: "#12100A",
  /** Slightly lifted surface for the live in-flight HUD. */
  radarSurface: "#0A1720",
} as const;

/** Mirrors `apps/web/src/lib/palette.ts` so both clients encode haul the same way. */
export const HAUL_COLORS = {
  SHORT_HAUL: "#35C48F",
  MEDIUM_HAUL: "#5BA7D9",
  LONG_HAUL: "#E0A24C",
  ALL: "#9AACBA",
} as const;

/** Shared layout rhythm so every screen breathes the same way. */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

/** Minimum accessible touch target. */
export const TOUCH = 48;

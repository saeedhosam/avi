/**
 * Runtime cockpit palette.
 *
 * Tailwind classes and CSS variables in `app/globals.css` remain the source of
 * truth for DOM styling. These literal values exist only for APIs that cannot
 * resolve CSS variables: MapLibre paint properties, SVG canvas metadata, and
 * inline status metadata. Keep them in sync with the CSS token block.
 */
export const PALETTE = {
  background: "#070B11",
  surface: "#0B141D",
  surface2: "#101D28",
  surface3: "#162734",
  surface4: "#1D3342",
  border: "#1D2E3C",
  borderStrong: "#2B4557",
  text: "#E9EFF5",
  muted: "#9AACBA",
  subtle: "#7E909D",
  accent: "#35D3E6",
  accentMuted: "#5BA7D9",
  status: {
    SCHEDULED: { color: "#93A6B4", soft: "rgba(147,166,180,0.12)" },
    BOARDING: { color: "#5BA7D9", soft: "rgba(91,167,217,0.13)" },
    DEPARTED: { color: "#35D3E6", soft: "rgba(53,211,230,0.11)" },
    DELAYED: { color: "#E0A24C", soft: "rgba(224,162,76,0.12)" },
    LANDED: { color: "#35C48F", soft: "rgba(53,196,143,0.12)" },
    CANCELLED: { color: "#E26F6F", soft: "rgba(226,111,111,0.12)" },
  },
  haul: {
    ALL: "#9AACBA",
    SHORT_HAUL: "#35C48F",
    MEDIUM_HAUL: "#5BA7D9",
    LONG_HAUL: "#E0A24C",
  },
  alerts: {
    GATE_CHANGE: "#35D3E6",
    TERMINAL_CHANGE: "#A78BFA",
    DELAY: "#E0A24C",
    BOARDING: "#5BA7D9",
    CANCELLATION: "#E26F6F",
    BAGGAGE: "#35C48F",
  },
  dataSource: {
    LIVE_AERODATABOX: "#35C48F",
    CONFIGURED_IDLE: "#5BA7D9",
    OFFLINE_CACHE: "#35D3E6",
    QUOTA_FALLBACK: "#E0A24C",
    NOT_CONFIGURED: "#E26F6F",
  },
  weather: {
    UNKNOWN: "#9AACBA",
    VFR: "#35C48F",
    MVFR: "#E0A24C",
    IFR: "#E26F6F",
  },
  amenities: {
    ALL: "#35D3E6",
    GATE: "#35D3E6",
    LOUNGE: "#E0A24C",
    SECURITY: "#E26F6F",
    DINING: "#E08A4C",
    SHOPPING: "#A78BFA",
    RESTROOM: "#5BA7D9",
    TRANSIT: "#35C48F",
  },
  map: {
    ocean: "#07111A",
    land: "#0B1824",
    border: "#1B3040",
    routeRemaining: "#C9687E",
    routeTraveled: "#3F8FD2",
    highlight: "#E9EFF5",
  },
} as const;

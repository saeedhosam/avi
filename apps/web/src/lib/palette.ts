/**
 * Runtime cockpit palette.
 *
 * Tailwind classes and CSS variables in `app/globals.css` remain the source of
 * truth for DOM styling. These literal values exist only for APIs that cannot
 * resolve CSS variables: MapLibre paint properties, SVG canvas metadata, and
 * inline status metadata. Keep them in sync with the CSS token block.
 */
export const PALETTE = {
  background: "#070E17",
  surface: "#0C1929",
  surface2: "#13233A",
  surface3: "#1C314E",
  surface4: "#24405F",
  border: "#264366",
  borderStrong: "#315A85",
  text: "#F8FAFC",
  muted: "#94A3B8",
  subtle: "#64748B",
  accent: "#00E5FF",
  accentMuted: "#38BDF8",
  status: {
    SCHEDULED: { color: "#94A3B8", soft: "rgba(148,163,184,0.14)" },
    BOARDING: { color: "#38BDF8", soft: "rgba(56,189,248,0.14)" },
    DEPARTED: { color: "#00E5FF", soft: "rgba(0,229,255,0.13)" },
    DELAYED: { color: "#F59E0B", soft: "rgba(245,158,11,0.14)" },
    LANDED: { color: "#10B981", soft: "rgba(16,185,129,0.14)" },
    CANCELLED: { color: "#EF4444", soft: "rgba(239,68,68,0.14)" },
  },
  haul: {
    ALL: "#94A3B8",
    SHORT_HAUL: "#10B981",
    MEDIUM_HAUL: "#38BDF8",
    LONG_HAUL: "#F59E0B",
  },
  alerts: {
    GATE_CHANGE: "#00E5FF",
    TERMINAL_CHANGE: "#A78BFA",
    DELAY: "#F59E0B",
    BOARDING: "#38BDF8",
    CANCELLATION: "#EF4444",
    BAGGAGE: "#10B981",
  },
  dataSource: {
    LIVE_AERODATABOX: "#10B981",
    CONFIGURED_IDLE: "#38BDF8",
    OFFLINE_CACHE: "#00E5FF",
    QUOTA_FALLBACK: "#F59E0B",
    NOT_CONFIGURED: "#EF4444",
  },
  weather: {
    UNKNOWN: "#94A3B8",
    VFR: "#10B981",
    MVFR: "#F59E0B",
    IFR: "#EF4444",
  },
  amenities: {
    ALL: "#00E5FF",
    GATE: "#00E5FF",
    LOUNGE: "#FFB300",
    SECURITY: "#FF5252",
    DINING: "#FF7043",
    SHOPPING: "#AB47BC",
    RESTROOM: "#42A5F5",
    TRANSIT: "#26A69A",
  },
  map: {
    ocean: "#07131F",
    land: "#0B1A2A",
    border: "#1E3A55",
    routeRemaining: "#D94A6A",
    routeTraveled: "#0077FF",
    highlight: "#FFFFFF",
  },
} as const;

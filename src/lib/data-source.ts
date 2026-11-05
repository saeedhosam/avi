export type DataSourceMode =
  | "LIVE_AERODATABOX"
  | "OFFLINE_CACHE"
  | "QUOTA_FALLBACK"
  | "NOT_CONFIGURED";

export const DATA_SOURCE_META = {
  LIVE_AERODATABOX: {
    badge: "LIVE AERODATABOX + METEO",
    summary: "Live flights, FIDS & weather",
    title: "Live AeroDataBox & Open-Meteo connected",
    subtitle:
      "Streaming real-time global flights, airport FIDS boards, hourly delay changes, and destination weather. Cached results remain available offline.",
    color: "#10B981",
  },
  OFFLINE_CACHE: {
    badge: "OFFLINE · CACHED LIVE DATA",
    summary: "Serving cached live results",
    title: "Offline mode",
    subtitle:
      "Live API calls are paused. Previously fetched flights, routes, weather, alerts, and watchlists are served from the local cache.",
    color: "#00E5FF",
  },
  QUOTA_FALLBACK: {
    badge: "RATE LIMIT · CACHED LIVE DATA",
    summary: "AeroDataBox quota reached",
    title: "AeroDataBox rate limit reached (HTTP 429)",
    subtitle:
      "New flight lookups are paused until the RapidAPI quota resets. Cached live results and Open-Meteo weather remain available.",
    color: "#F59E0B",
  },
  NOT_CONFIGURED: {
    badge: "AERODATABOX NOT CONFIGURED",
    summary: "Add your RapidAPI key",
    title: "Live flight data is not configured",
    subtitle:
      "Add AERODATABOX_API_KEY and AERODATABOX_API_HOST to .env and restart the server to enable live flight search, airport boards, and route data.",
    color: "#EF4444",
  },
} as const;

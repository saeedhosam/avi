export type DataSourceMode =
  | "LIVE_AERODATABOX"
  | "OFFLINE_ROOM_CACHE"
  | "QUOTA_FALLBACK"
  | "DEMO_CACHE_NO_KEY";

export const DATA_SOURCE_META = {
  LIVE_AERODATABOX: {
    badge: "LIVE AERODATABOX + METEO",
    summary: "Live Flights, FIDS & Weather",
    title: "Live AeroDataBox & Open-Meteo Connected",
    subtitle:
      "Streaming real-time global flights, airport FIDS boards, delay indexes, and live destination weather.",
    color: "#10B981",
  },
  OFFLINE_ROOM_CACHE: {
    badge: "OFFLINE · LOCAL CACHE",
    summary: "Offline cache active",
    title: "Offline Mode (Local Browser Cache)",
    subtitle:
      "Network disconnected or airplane mode active. Serving cached flights, watchlists, and arrival weather from local storage.",
    color: "#00E5FF",
  },
  QUOTA_FALLBACK: {
    badge: "RATE LIMIT · CACHE ACTIVE",
    summary: "Local cache + live weather",
    title: "AeroDataBox Quota Reached (HTTP 429)",
    subtitle:
      "Serving cached flights from local storage + live Open-Meteo destination weather until RapidAPI quota resets.",
    color: "#F59E0B",
  },
  DEMO_CACHE_NO_KEY: {
    badge: "LOCAL CACHE + LIVE WEATHER",
    summary: "Cached flights + live weather",
    title: "Local Cache + Live Open-Meteo Weather",
    subtitle:
      "Add AERODATABOX_API_KEY to the server environment to enable live RapidAPI flight and FIDS queries.",
    color: "#F59E0B",
  },
} as const;

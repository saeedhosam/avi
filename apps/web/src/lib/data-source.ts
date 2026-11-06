export type DataSourceMode =
  | "LIVE_AERODATABOX"
  | "OFFLINE_CACHE"
  | "QUOTA_FALLBACK"
  | "NOT_CONFIGURED";

// User-facing copy for the data status chip and panel. Keys mirror the
// internal data pipeline states; wording is traveller-facing and must not
// mention providers, env vars, HTTP codes, or infrastructure names.
export const DATA_SOURCE_META = {
  LIVE_AERODATABOX: {
    badge: "LIVE DATA + WEATHER",
    summary: "Live flights, airport boards & weather",
    title: "Connected to live flight data",
    subtitle:
      "Live flights, airport boards, delay changes, and destination weather update as they happen. Recently viewed flights and boards stay available offline.",
    color: "#10B981",
  },
  OFFLINE_CACHE: {
    badge: "OFFLINE · SAVED DATA",
    summary: "Saved flights and weather from your last sync",
    title: "Offline — showing saved data",
    subtitle:
      "You're offline. Flights you viewed, your watchlist, notes, and recent weather are shown from your last sync.",
    color: "#00E5FF",
  },
  QUOTA_FALLBACK: {
    badge: "UPDATES PAUSED · SAVED DATA",
    summary: "Live updates paused — showing saved data",
    title: "Live updates paused",
    subtitle:
      "The live feed is busy right now, so new flight lookups are paused. Everything you already saved is up to date as of your last sync.",
    color: "#F59E0B",
  },
  NOT_CONFIGURED: {
    badge: "LIVE DATA UNAVAILABLE",
    summary: "Saved flights and weather are still available",
    title: "Live flight data unavailable",
    subtitle:
      "Live flight looks are unavailable right now. Saved flights and weather keep working.",
    color: "#EF4444",
  },
} as const;

export type DataSourceMode =
  | "LIVE_AERODATABOX"
  | "CONFIGURED_IDLE"
  | "OFFLINE_CACHE"
  | "QUOTA_FALLBACK"
  | "NOT_CONFIGURED";

// User-facing copy for the data status chip and panel. Keys mirror the
// internal data pipeline states; wording is traveller-facing and must not
// mention providers, env vars, HTTP codes, or infrastructure names.
export const DATA_SOURCE_META = {
  LIVE_AERODATABOX: {
    badge: "LIVE DATA RECEIVED",
    summary: "A live response was received recently",
    title: "Live flight data received",
    subtitle:
      "The most recent provider response was successful. Each flight and board still carries its own retrieval time.",
    color: "#10B981",
  },
  CONFIGURED_IDLE: {
    badge: "PROVIDER READY",
    summary: "Live data is configured — no recent response yet",
    title: "Live provider configured",
    subtitle:
      "A provider is configured, but this does not prove that a live response has been received. Search or open a flight to fetch data.",
    color: "#38BDF8",
  },
  OFFLINE_CACHE: {
    badge: "OFFLINE · SAVED FLIGHTS",
    summary: "Saved flights from your last sync",
    title: "Offline — showing saved flights",
    subtitle:
      "You're offline. Saved flight records and your watchlist are shown from your last sync. Airport boards, route networks, and weather are not cached.",
    color: "#00E5FF",
  },
  QUOTA_FALLBACK: {
    badge: "LIVE UPDATES PAUSED",
    summary: "Provider quota exhausted — no fresh data",
    title: "Live updates paused",
    subtitle:
      "The provider quota is exhausted, so new flight lookups are paused. Saved flights may be shown, but they are not current.",
    color: "#F59E0B",
  },
  NOT_CONFIGURED: {
    badge: "LIVE DATA UNAVAILABLE",
    summary: "Provider not configured",
    title: "Live flight data unavailable",
    subtitle:
      "Live flight lookups are unavailable right now. Saved flight records remain available; weather and boards are not cached.",
    color: "#EF4444",
  },
} as const;

export const GATEWAY_URL =
  process.env.EXPO_PUBLIC_AEROQUEST_API_URL?.trim().replace(/\/+$/, "") ||
  "https://api.2-31-110-53.sslip.io";

export const WEB_APP_URL =
  process.env.EXPO_PUBLIC_AEROQUEST_WEB_URL?.trim().replace(/\/+$/, "") ||
  "https://avi.codestep.org";

export const HOME_AIRPORTS = [
  { iata: "CAI", city: "Cairo", country: "Egypt" },
  { iata: "DXB", city: "Dubai", country: "UAE" },
  { iata: "LHR", city: "London", country: "UK" },
  { iata: "JFK", city: "New York", country: "USA" },
] as const;

export const GATEWAY_CONFIGURED = GATEWAY_URL.length > 0;

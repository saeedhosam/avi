import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FlightStatus, HaulCategory } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_META: Record<
  FlightStatus,
  { label: string; color: string; soft: string; icon: string }
> = {
  SCHEDULED: {
    label: "Scheduled",
    color: "#94A3B8",
    soft: "rgba(148,163,184,0.14)",
    icon: "clock",
  },
  BOARDING: {
    label: "Boarding",
    color: "#38BDF8",
    soft: "rgba(56,189,248,0.14)",
    icon: "ticket",
  },
  DEPARTED: {
    label: "En Route",
    color: "#00E5FF",
    soft: "rgba(0,229,255,0.13)",
    icon: "plane",
  },
  DELAYED: {
    label: "Delayed",
    color: "#F59E0B",
    soft: "rgba(245,158,11,0.14)",
    icon: "alert",
  },
  LANDED: {
    label: "Landed",
    color: "#10B981",
    soft: "rgba(16,185,129,0.14)",
    icon: "landed",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "#EF4444",
    soft: "rgba(239,68,68,0.14)",
    icon: "x",
  },
};

export const HAUL_META: Record<
  HaulCategory,
  { label: string; range: string; color: string }
> = {
  ALL: { label: "All Ranges", range: "Any distance", color: "#94A3B8" },
  SHORT_HAUL: { label: "Short-Haul", range: "< 1,500 km", color: "#10B981" },
  MEDIUM_HAUL: {
    label: "Medium-Haul",
    range: "1,500 – 4,000 km",
    color: "#38BDF8",
  },
  LONG_HAUL: { label: "Long-Haul", range: "> 4,000 km", color: "#F59E0B" },
};

export const REGION_META: Record<string, { label: string; short: string }> = {
  ALL: { label: "All Regions", short: "All" },
  MENA: { label: "Middle East & N. Africa", short: "MENA" },
  EUROPE: { label: "Europe", short: "Europe" },
  AFRICA: { label: "Sub-Saharan Africa", short: "Africa" },
  ASIA_PACIFIC: { label: "Asia-Pacific", short: "Asia-Pacific" },
  AMERICAS: { label: "Americas", short: "Americas" },
};

export const ALERT_META = {
  GATE_CHANGE: {
    label: "Gate Change",
    color: "#00E5FF",
    icon: "door",
  },
  DELAY: { label: "Delay", color: "#F59E0B", icon: "clock" },
  BOARDING: { label: "Boarding", color: "#38BDF8", icon: "ticket" },
  CANCELLATION: {
    label: "Cancellation",
    color: "#EF4444",
    icon: "x",
  },
  BAGGAGE: { label: "Baggage", color: "#10B981", icon: "luggage" },
} as const;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatDuration(minutes: number) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hrs > 0 ? `${hrs}h ${String(mins).padStart(2, "0")}m` : `${mins}m`;
}

export function classifyHaul(distanceKm: number): HaulCategory {
  if (distanceKm < 1500) return "SHORT_HAUL";
  if (distanceKm <= 4000) return "MEDIUM_HAUL";
  return "LONG_HAUL";
}

export function estimateDurationMinutes(distanceKm: number) {
  const cruise = (distanceKm / 815) * 60;
  return Math.max(45, Math.round(cruise + 32));
}

export function geodesicDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return Math.max(80, Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
}

export function kmToNm(km: number) {
  return Math.max(45, Math.round(km * 0.539957));
}

export function statusLabel(status: FlightStatus, delayMinutes = 0) {
  if (status === "DELAYED" && delayMinutes > 0) return `+${delayMinutes}m Delayed`;
  return STATUS_META[status].label;
}

export function normalizeFlightNumber(value: string) {
  return value.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function timeAgo(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function weatherIcon(condition: string) {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return "storm";
  if (c.includes("snow") || c.includes("freez")) return "snow";
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower"))
    return "rain";
  if (c.includes("fog") || c.includes("mist") || c.includes("haze"))
    return "fog";
  if (c.includes("cloud") || c.includes("overcast")) return "cloud";
  return "sun";
}

export function metersToMiles(meters: number) {
  return meters / 1609.34;
}

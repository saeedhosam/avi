import {
  FLIGHT_STATUS_LABELS,
  GatewayClientError,
  type Flight,
} from "@avi/shared";

export type CockpitTone = "radar" | "amber" | "green" | "red" | "muted";

export function statusTone(
  flight: Pick<Flight, "status" | "statusReported">,
): CockpitTone {
  if (!flight.statusReported) return "muted";
  switch (flight.status) {
    case "CANCELLED":
      return "red";
    case "DELAYED":
      return "amber";
    case "BOARDING":
      return "radar";
    case "DEPARTED":
      return "green";
    case "LANDED":
      return "green";
    default:
      return "muted";
  }
}

export function statusLabel(
  flight: Pick<Flight, "status" | "statusReported">,
): string {
  if (!flight.statusReported) return "Status not reported";
  return FLIGHT_STATUS_LABELS[flight.status];
}

/** Renders HH:mm; provider airport-local strings are shown without timezone conversion. */
export function formatClock(value: string | null | undefined): string {
  if (!value?.trim()) return "Not reported";
  const trimmed = value.trim();
  if (/^[—–-]$/.test(trimmed)) return "Not reported";
  const isoClock = /[T ](\d{2}):(\d{2})/.exec(trimmed);
  if (isoClock?.[1] && isoClock[2]) return `${isoClock[1]}:${isoClock[2]}`;
  const bareClock = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (bareClock?.[1] && bareClock[2]) {
    return `${bareClock[1].padStart(2, "0")}:${bareClock[2]}`;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return trimmed;
  return new Date(parsed).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value?.trim()) return "Not reported";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value.trim();
  return new Date(parsed).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Empty provider strings are "not reported", never displayed as a blank fact. */
export function displayText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && !/^[—–-]$/.test(trimmed) ? trimmed : "Not reported";
}

export function displayBoolean(value: boolean | null | undefined): string {
  if (value == null) return "Not reported";
  return value ? "Available" : "Not available";
}

export function describeGatewayError(
  cause: unknown,
  fallback = "The AeroQuest gateway is temporarily unavailable.",
): string {
  if (cause instanceof GatewayClientError) {
    const retry =
      cause.retryAfterSeconds != null
        ? ` Retry in about ${cause.retryAfterSeconds}s.`
        : "";
    return `${cause.message} (HTTP ${cause.status}, ${cause.code}).${retry}`;
  }
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return fallback;
}

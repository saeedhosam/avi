import type { AlertType, Flight, FlightAlert } from "../models/flight.js";

export interface FlightDiffOptions {
  /**
   * Clock used for the display timestamp. Injected so tests are deterministic.
   * Defaults to the current time.
   */
  now?: Date;
  /** Injectable ID factory; defaults to crypto.randomUUID or a counter. */
  idFactory?: () => string;
  /** Minimum delay *increase* that emits an alert. Kotlin default was 15 min. */
  delayThresholdMinutes?: number;
  /** Emit alerts when the arrival/departure baggage belt is reassigned. */
  includeBaggage?: boolean;
  /** Emit terminal changes as separate alerts. */
  includeTerminal?: boolean;
}

let fallbackCounter = 0;

function defaultId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  fallbackCounter += 1;
  return `alert-${Date.now()}-${fallbackCounter}`;
}

function timeLabel(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/** A value is a real assignment only when non-empty and not a TBD placeholder. */
function assigned(value: string | null | undefined): boolean {
  const text = normalized(value);
  return Boolean(text) && !text.includes("TBD") && text !== "—" && text !== "-";
}

function display(value: string | null | undefined, fallback = "not assigned"): string {
  return assigned(value) ? String(value).trim() : fallback;
}

function alert(
  flight: Flight,
  type: AlertType,
  title: string,
  message: string,
  at: string,
  idFactory: () => string,
): FlightAlert {
  return {
    id: idFactory(),
    flightNumber: flight.flightNumber,
    flightDate: flight.flightDate,
    type,
    title,
    message,
    timestamp: at,
    isRead: false,
  };
}

/**
 * Diffs previous vs. updated flight snapshots and emits alerts only for
 * genuine operational changes.
 *
 * Deliberate non-alerts:
 * - A provider that stops reporting a gate does not mean the gate was removed.
 * - A TBD placeholder is not a gate assignment.
 * - A delay *decrease* is not a disruption; only an increase >= threshold.
 * - A status transition to DEPARTED is not a boarding alert.
 */
export function diffFlights(
  previous: Flight,
  updated: Flight,
  options: FlightDiffOptions = {},
): FlightAlert[] {
  const alerts: FlightAlert[] = [];
  const now = options.now ?? new Date();
  const at = timeLabel(now);
  const idFactory = options.idFactory ?? defaultId;
  const delayThreshold = options.delayThresholdMinutes ?? 15;
  const includeBaggage = options.includeBaggage ?? true;
  const includeTerminal = options.includeTerminal ?? true;

  // 1. Departure gate reassignment.
  if (
    assigned(updated.gateDeparture) &&
    !normalized(previous.gateDeparture).includes("TBD") &&
    normalized(previous.gateDeparture) !== normalized(updated.gateDeparture)
  ) {
    alerts.push(
      alert(
        updated,
        "GATE_CHANGE",
        `Gate Reassigned: ${updated.flightNumber}`,
        `${updated.airline} ${updated.flightNumber} departure gate changed from ${display(previous.gateDeparture)} to ${display(updated.gateDeparture)}${assigned(updated.terminalDeparture) ? ` (Terminal ${updated.terminalDeparture})` : ""}.`,
        at,
        idFactory,
      ),
    );
  }

  // 2. Arrival gate reassignment (drives Tight-Connection Sprint Mode).
  if (
    assigned(updated.gateArrival) &&
    assigned(previous.gateArrival) &&
    normalized(previous.gateArrival) !== normalized(updated.gateArrival)
  ) {
    alerts.push(
      alert(
        updated,
        "GATE_CHANGE",
        `Arrival Gate Changed: ${updated.flightNumber}`,
        `${updated.flightNumber} now arrives at ${display(updated.gateArrival)}${assigned(updated.terminalArrival) ? ` (Terminal ${updated.terminalArrival})` : ""}. Recalculate your connection.`,
        at,
        idFactory,
      ),
    );
  }

  // 3. Terminal reassignment.
  if (includeTerminal) {
    const departureTerminalChanged =
      assigned(updated.terminalDeparture) &&
      assigned(previous.terminalDeparture) &&
      normalized(previous.terminalDeparture) !==
        normalized(updated.terminalDeparture);
    const arrivalTerminalChanged =
      assigned(updated.terminalArrival) &&
      assigned(previous.terminalArrival) &&
      normalized(previous.terminalArrival) !== normalized(updated.terminalArrival);

    if (departureTerminalChanged || arrivalTerminalChanged) {
      const parts: string[] = [];
      if (departureTerminalChanged) {
        parts.push(
          `departure terminal ${previous.terminalDeparture} → ${updated.terminalDeparture}`,
        );
      }
      if (arrivalTerminalChanged) {
        parts.push(
          `arrival terminal ${previous.terminalArrival} → ${updated.terminalArrival}`,
        );
      }
      alerts.push(
        alert(
          updated,
          "TERMINAL_CHANGE",
          `Terminal Changed: ${updated.flightNumber}`,
          `${updated.flightNumber} (${updated.origin.code} → ${updated.destination.code}) ${parts.join("; ")}.`,
          at,
          idFactory,
        ),
      );
    }
  }

  // 4. Delay increase.
  if (
    updated.delayReported &&
    updated.delayMinutes > 0 &&
    (!previous.delayReported ||
      updated.delayMinutes - previous.delayMinutes >= delayThreshold)
  ) {
    alerts.push(
      alert(
        updated,
        "DELAY",
        `Schedule Delay: ${updated.flightNumber} (+${updated.delayMinutes}m)`,
        `Flight ${updated.flightNumber} (${updated.origin.code} → ${updated.destination.code}) is now delayed by ${updated.delayMinutes} minutes. Revised departure: ${updated.departureTimeEstimated}.`,
        at,
        idFactory,
      ),
    );
  }

  // 5. Status transitions.
  if (updated.statusReported && previous.status !== updated.status) {
    if (updated.status === "BOARDING") {
      alerts.push(
        alert(
          updated,
          "BOARDING",
          `Boarding Commenced: ${updated.flightNumber}`,
          `${updated.airline} ${updated.flightNumber} is now boarding${assigned(updated.gateDeparture) ? ` at ${updated.gateDeparture}` : ""}.`,
          at,
          idFactory,
        ),
      );
    } else if (updated.status === "CANCELLED") {
      alerts.push(
        alert(
          updated,
          "CANCELLATION",
          `Flight Cancelled: ${updated.flightNumber}`,
          `${updated.airline} ${updated.flightNumber} (${updated.origin.code} → ${updated.destination.code}) has been cancelled.`,
          at,
          idFactory,
        ),
      );
    } else if (updated.status === "LANDED") {
      alerts.push(
        alert(
          updated,
          "BAGGAGE",
          `Touchdown at ${updated.destination.code}: ${updated.flightNumber}`,
          `${updated.flightNumber} has landed at ${updated.destination.city || updated.destination.code}.${assigned(updated.baggageCarousel) ? ` Baggage claim: ${updated.baggageCarousel}.` : " Baggage belt not reported yet."}`,
          at,
          idFactory,
        ),
      );
    }
  }

  // 6. Baggage belt reassignment (including after landing).
  if (
    includeBaggage &&
    assigned(updated.baggageCarousel) &&
    assigned(previous.baggageCarousel) &&
    normalized(previous.baggageCarousel) !== normalized(updated.baggageCarousel)
  ) {
    alerts.push(
      alert(
        updated,
        "BAGGAGE",
        `Baggage Belt Updated: ${updated.flightNumber}`,
        `Baggage for ${updated.flightNumber} moved from ${previous.baggageCarousel} to ${updated.baggageCarousel} at ${updated.destination.code}.`,
        at,
        idFactory,
      ),
    );
  }

  return alerts;
}

/** True when both snapshots describe the same date-scoped flight identity. */
export function sameFlightIdentity(a: Flight, b: Flight): boolean {
  return a.id === b.id || (a.flightNumber === b.flightNumber && a.flightDate === b.flightDate);
}

export interface TightConnectionInput {
  arrivalTime: string;
  boardingTime: string;
  /** Minimum minutes the traveller needs to deplane and board. */
  minimumBufferMinutes?: number;
}

export interface TightConnectionResult {
  minutesBetween: number;
  isTight: boolean;
  isCritical: boolean;
  label: string;
}

/**
 * Sprint-mode threshold: fewer than 45 minutes between scheduled arrival and
 * boarding. `isCritical` means less than 20 minutes.
 *
 * Times are `HH:mm` and may cross midnight; the later time is assumed to be
 * the next day. ISO timestamps are also accepted and compared directly.
 */
export function evaluateTightConnection(
  input: TightConnectionInput,
): TightConnectionResult {
  const buffer = input.minimumBufferMinutes ?? 45;
  const minutesBetween = minutesBetweenTimes(input.arrivalTime, input.boardingTime);
  return {
    minutesBetween,
    isTight: minutesBetween < buffer,
    isCritical: minutesBetween < 20,
    label:
      minutesBetween < 20
        ? "Critical connection"
        : minutesBetween < buffer
          ? "Tight connection"
          : "Comfortable connection",
  };
}

export function minutesBetweenTimes(from: string, to: string): number {
  const fromIso = Date.parse(from);
  const toIso = Date.parse(to);
  if (Number.isFinite(fromIso) && Number.isFinite(toIso) && from.includes("T")) {
    return Math.round((toIso - fromIso) / 60_000);
  }
  const parse = (value: string) => {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const start = parse(from);
  const end = parse(to);
  if (start == null || end == null) return Number.NaN;
  const diff = end >= start ? end - start : end + 24 * 60 - start;
  return diff;
}

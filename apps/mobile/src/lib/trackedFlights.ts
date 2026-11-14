import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AeroQuestGatewayClient,
  flightSchema,
  watchRowId,
  type Flight,
} from "@avi/shared";
import { GATEWAY_URL } from "./config";
import { getAccessToken, getCurrentUserId, supabase } from "./supabase";

const STORAGE_KEY = "aeroquest.tracked-flights.v1";
const MAX_TRACKED_FLIGHTS = 50;

export interface TrackedFlightEntry {
  /** Date-scoped watchlist identity, shared with Supabase. */
  id: string;
  flight: Flight;
  trackedAt: string;
  updatedAt: string;
}

let mutationChain: Promise<unknown> = Promise.resolve();

/**
 * Serializes local mutations so two rapid track/untrack taps cannot overwrite
 * each other through a read-modify-write race on AsyncStorage.
 */
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationChain.then(operation, operation);
  mutationChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function parseEntry(value: unknown): TrackedFlightEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TrackedFlightEntry>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  const parsedFlight = flightSchema.safeParse(candidate.flight);
  if (!parsedFlight.success) return null;
  const now = new Date().toISOString();
  return {
    id: candidate.id,
    flight: parsedFlight.data,
    trackedAt:
      typeof candidate.trackedAt === "string" ? candidate.trackedAt : now,
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : now,
  };
}

async function readEntries(): Promise<TrackedFlightEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("Tracked-flight cache is not an array; ignoring it.");
      return [];
    }
    return parsed
      .map(parseEntry)
      .filter((entry): entry is TrackedFlightEntry => entry != null);
  } catch (cause) {
    console.warn("Could not read the tracked-flight cache", cause);
    return [];
  }
}

async function writeEntries(entries: TrackedFlightEntry[]): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(entries.slice(0, MAX_TRACKED_FLIGHTS)),
  );
}

/** Stable local + cloud identity for a flight (flight number + operating date). */
export function trackedFlightId(
  flight: Pick<
    Flight,
    "id" | "flightNumber" | "flightDate" | "departureTimeScheduled"
  >,
): string {
  return watchRowId({
    id: flight.id,
    flightNumber: flight.flightNumber,
    flightDate: flight.flightDate ?? operatingDateForFlight(flight),
  });
}

export function operatingDateForFlight(
  flight: Pick<Flight, "id" | "flightDate" | "departureTimeScheduled">,
): string | null {
  if (flight.flightDate && /^\d{4}-\d{2}-\d{2}$/.test(flight.flightDate)) {
    return flight.flightDate;
  }
  const fromId = flight.id.match(/(\d{4}-\d{2}-\d{2})$/);
  if (fromId?.[1]) return fromId[1];
  const fromSchedule = flight.departureTimeScheduled.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(fromSchedule) ? fromSchedule : null;
}

export async function listTrackedFlights(): Promise<TrackedFlightEntry[]> {
  await mutationChain.catch(() => undefined);
  const entries = await readEntries();
  return entries.sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export async function getTrackedFlight(
  id: string,
): Promise<TrackedFlightEntry | null> {
  await mutationChain.catch(() => undefined);
  const normalized = id.trim().toUpperCase();
  const entries = await readEntries();
  return (
    entries.find(
      (entry) =>
        entry.id.toUpperCase() === normalized ||
        entry.flight.id.toUpperCase() === normalized,
    ) ?? null
  );
}

/**
 * Writes the snapshot locally first, then attempts a best-effort Supabase row
 * sync. A network/session failure never rolls back or blocks the offline cache.
 */
export async function addTrackedFlight(
  flight: Flight,
): Promise<TrackedFlightEntry> {
  const entry = await serialize(async () => {
    const now = new Date().toISOString();
    const id = trackedFlightId(flight);
    const entries = await readEntries();
    const existing = entries.find((candidate) => candidate.id === id);
    const next: TrackedFlightEntry = {
      id,
      flight,
      trackedAt: existing?.trackedAt ?? now,
      updatedAt: now,
    };
    await writeEntries([next, ...entries.filter((candidate) => candidate.id !== id)]);
    return next;
  });

  void syncWatchlistItem(entry);
  return entry;
}

export async function removeTrackedFlight(id: string): Promise<boolean> {
  const normalized = id.trim().toUpperCase();
  const removed = await serialize(async () => {
    const entries = await readEntries();
    const next = entries.filter(
      (entry) => entry.id.toUpperCase() !== normalized,
    );
    if (next.length === entries.length) return false;
    await writeEntries(next);
    return true;
  });
  if (removed) void deleteWatchlistItem(normalized);
  return removed;
}

/**
 * Refreshes one cached flight through the gateway, replacing the local snapshot
 * only after a valid response arrives. Gateway failures leave the snapshot
 * untouched and are returned to the caller.
 */
export async function refreshTrackedFlight(
  id: string,
  options: { client?: AeroQuestGatewayClient } = {},
): Promise<TrackedFlightEntry | null> {
  const existing = await getTrackedFlight(id);
  if (!existing) return null;
  const date = operatingDateForFlight(existing.flight);
  if (!date) {
    throw new Error(
      "This cached flight has no operating date, so it cannot be refreshed.",
    );
  }
  const client =
    options.client ??
    new AeroQuestGatewayClient({
      baseUrl: GATEWAY_URL,
      accessToken: await getAccessToken(),
    });
  const response = await client.getFlight(
    existing.flight.flightNumber,
    date,
  );
  const fresh =
    response.flights.find(
      (candidate) =>
        candidate.flightNumber.replace(/\s+/g, "").toUpperCase() ===
        existing.flight.flightNumber.replace(/\s+/g, "").toUpperCase(),
    ) ?? response.flights[0];
  if (!fresh) {
    throw new Error(
      `The gateway returned no flight for ${existing.flight.flightNumber} on ${date}.`,
    );
  }
  const refreshed = await addTrackedFlight(fresh);
  if (refreshed.id !== existing.id) {
    await removeTrackedFlight(existing.id);
  }
  return refreshed;
}

async function syncWatchlistItem(entry: TrackedFlightEntry): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) return;
    const { error } = await supabase.from("watchlist_items").upsert(
      {
        user_id: userId,
        flight_id: entry.id,
        flight_number: entry.flight.flightNumber,
        flight_date:
          entry.flight.flightDate ?? operatingDateForFlight(entry.flight),
        airline: entry.flight.airline.slice(0, 100),
        origin_code: entry.flight.origin.code,
        dest_code: entry.flight.destination.code,
        status: entry.flight.status,
        notes: (entry.flight.customNotes ?? "").slice(0, 500),
        snapshot: entry.flight as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,flight_id" },
    );
    if (error) {
      console.warn("Best-effort watchlist sync failed", error.message);
    }
  } catch (cause) {
    console.warn("Best-effort watchlist sync failed", cause);
  }
}

/**
 * Mirrors the local cache after sign-in. Failures stay local; this never
 * blocks the auth flow or deletes a snapshot.
 */
export async function syncTrackedFlights(): Promise<void> {
  const entries = await listTrackedFlights();
  if (!entries.length) return;
  await Promise.allSettled(entries.map((entry) => syncWatchlistItem(entry)));
}

async function deleteWatchlistItem(id: string): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    if (!userId || !supabase) return;
    const { error } = await supabase
      .from("watchlist_items")
      .delete()
      .eq("user_id", userId)
      .eq("flight_id", id);
    if (error) {
      console.warn("Best-effort watchlist delete failed", error.message);
    }
  } catch (cause) {
    console.warn("Best-effort watchlist delete failed", cause);
  }
}

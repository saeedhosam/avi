# Remaining Work — Data Integrity Overhaul

Last updated: 2026-11-11  
Branch: `main`  
Status: Phase 1 (web/API + partial Android) committed; Phase 2 not started.

This file is the handoff note for the next engineer/agent. Read it before changing
flight, route, schedule, weather, terminal, or aircraft data.

---

## 1. Mission

Avi is a flight-data application. The product rule is:

> **If a value cannot be traced to a legitimate provider response, it must not be
> shown as fact. Show `unavailable`, `not reported`, or an explicit error instead.**

This applies to flight status, delays, gates, terminals, baggage, aircraft,
telemetry, schedules, routes, airports, weather, and seat availability.

The previous implementation fabricated or inferred many of these values. The last
overhaul removed the worst offenders from the production web/API path and made the
Android client stop treating reference data as live. The remaining work is to
finish that process and add a real forward schedule source.

---

## 2. Non-negotiable invariants

Do not reintroduce any of these:

- Hash-generated operating days (`deriveOperatingDays`).
- “Weekly frequency” split equally across operators.
- `dailyFlights ?? 1` or `destCount ?? 40`.
- Static route/airline datasets used as a fallback.
- `isLiveVerified: true` without a verified source.
- `delayReason: "ATC Flow"` or “Operational / Air Traffic Control revision.”
- Airline codes derived from a flight number.
- Unknown status mapped to `SCHEDULED` and shown as fact.
- Synthetic METAR strings.
- Crosswind/RVR values from airport code heuristics.
- Random seat availability (`Math.random()`).
- Unrelated flights shown as “departures at this gate.”
- Unknown airport silently replaced by another airport.
- Telemetry or weather values retained after the provider stops reporting them,
  without a stale/unavailable marker.
- 400/404/204 provider responses presented as verified empty results.

Every response should carry, where applicable:

- `source`
- `fetchedAt`
- `attribution`
- `statusReported`
- `delayReported`
- `weather.reported` / `weatherReported`
- `operatingDays` only when a schedule source actually supplied it

The web contract types live in:

- `packages/contracts/src/types.ts`
- `packages/contracts/src/mapping.ts`

The gateway schemas live in:

- `services/api/src/domain/console-schema.ts`
- `services/api/src/domain/schemas.ts`

---

## 3. Current route/schedule behavior (important)

`apps/web/src/app/routes/page.tsx` no longer shows a weekly calendar.

What it shows:

1. **AeroDataBox route statistics** — destinations, operator names, and a
   trailing **7-day average** daily departure count.
2. **AeroDataBox current airport board** — departures for the selected
   origin/destination in the provider's `-2h / +12h` window.
3. Explicit source, retrieval time, and a note that the 7-day stats are not a
   forward schedule.

What it intentionally does **not** show:

- Operating weekdays.
- Per-airline frequencies.
- Route duration.
- A future calendar.

Do not “fill in” those gaps. A real forward schedule needs a schedule provider
(FlightAware AeroAPI or OAG/Cirium). See Phase 2 below.

Relevant files:

- `apps/web/src/app/routes/page.tsx`
- `apps/web/src/components/route-timetable.tsx`
- `apps/web/src/app/api/airports/[code]/routes/route.ts`
- `apps/web/src/app/api/airports/[code]/flights/route.ts`
- `services/api/src/providers/console-flights.ts`
- `services/api/src/routes/console-airports.ts`

Removed files (do not restore without provenance/licence review):

- `apps/web/src/data/global-routes.json`
- `apps/web/src/data/airline-names.json`
- `apps/web/src/data/airports.json`

---

## 4. What was completed

### Web / API / contracts

- Route static fallback removed.
- Route hash schedule, fake carriers, fake weekly frequencies, fake durations,
  and `isLiveVerified` removed.
- AeroDataBox gateway-first flow with explicit 400/404/429/502/503 responses.
- If the gateway is configured but unreachable, the web returns an error instead
  of silently bypassing the gateway or using static data.
- Direct AeroDataBox is used only when the gateway is not configured.
- Provider `400` → invalid request, `404` → not found, `204` → no-data error.
- Route stats preserve `dailyFlights: null` when the provider omits it.
- Route stats include `source`, `fetchedAt`, `attribution`,
  `statisticsWindowDays: 7`, `note`, and `omittedRoutes`.
- Current board includes source/retrieval time/window.
- `Flight` has `statusReported`, `statusRaw`, `delayReported`, `delaySource`,
  optional `source`/`fetchedAt`.
- Cross-leg delay bug fixed (departure and arrival delays are computed
  independently).
- No invented delay reason.
- Flight ID is date-scoped: `AA100-2026-11-08`.
- No invented airline code from flight number.
- Gate/baggage timeline events no longer invented.
- Engine preserves verified status/delay when the provider omits them.
- Engine refuses cross-date merges.
- Engine clears stale telemetry and does not stamp mapping time as observation
  time.
- FIDS board only marks jobs covered when a matching flight was actually found.
- Settled rows (`next_poll_at IS NULL`, `poll_priority = 3`) are no longer
  re-adopted on every tick.
- Weather fallback removed from the web; incomplete Open-Meteo data results in
  an explicit unavailable state.
- No synthetic METAR; Open-Meteo is labeled as a model.
- Crosswind/RVR/arrival notices removed unless actually provided.
- Arrival forecast matches date + hour; wrong-day substitution refused.
- Seat availability is never generated; seats are `UNKNOWN`.
- Seatmap page is illustrative; no fallback to another airline’s aircraft.
- Airport gate departures are strictly filtered by origin + exact gate.
- Unknown airport shows “Airport not found,” not another airport.
- `destCount` is labeled catalog reference; no `40` fallback.
- Terminal walk distances/times are no longer presented as measurements.
- Web cache purges timestamped flights older than 7 days and shows retrieval
  age/source.
- Refresh reports actual refreshed/failed counts.
- Flight detail refresh refreshes the current flight directly.
- Watchlist/search merges are date-scoped; no number-only fallback.
- Source banner distinguishes live response, provider-ready/no-data, quota
  paused, and offline saved flights.
- Share text no longer invents “ATC Flow” or zero ETA.

### Android (partial, but significant)

- Watchlist row ID no longer double-appends the operating date.
- Synthetic “connect to 12 hubs” route generation removed.
- `RealtimeAirportRepository` no longer appends static airports to live results.
- Reference airports are marked `statusReported = false` and
  `weather.reported = false`.
- Fixed fake weather/METAR in `RealtimeAirportRepository`, `OpenMeteoService`,
  and `DestinationWeatherService`.
- Synthetic destination weather fallback removed; unavailable forecast returned.
- `Flight`/`Airport`/`AircraftInfo`/telemetry have provenance and nullable
  unknown fields.
- Android `StatusBadge` renders “Status not reported.”
- Android share/alert logic respects reported status/delay.
- Room stores `flightDate`; database version 7 with `MIGRATION_6_7`.
- Cached flight reconstruction no longer uses fake weather or fake current
  position.
- Live routes no longer get invented flight numbers, aircraft types, or default
  carriers.
- Route UI says “frequency not reported” instead of `0x daily`.
- `./gradlew :app:compileDebugKotlin` and `:app:testDebugUnitTest` pass.

### iOS

- `RoutesScreen` and `TerminalsScreen` now display “sample / illustrative”
  banners.

---

## 5. Remaining work — prioritized

### P0 — Durable server-side cache

Current provider caches are in-process `TtlCache` inside:

- `services/api/src/lib/cache.ts`
- `services/api/src/providers/console-flights.ts`
- `services/api/src/providers/aerodatabox.ts`

Multiple gateway instances do not share cache state, so they can duplicate
provider spend and show different freshness.

Needed:

- A Postgres-backed cache table (for example `provider_cache`) keyed by provider,
  endpoint, normalized query, and a payload hash.
- Store `fetched_at`, `expires_at`, `source`, `attribution`, and the response
  payload.
- Read-through in `ConsoleFlightProvider` / `AeroDataBoxProvider`.
- A documented TTL policy per endpoint:
  - flight status: very short (30–60 s; provider rules)
  - airport board: 60 s or provider-permitted
  - route stats: 6–24 h
  - airport search: 10 min
- Stale-while-revalidate where safe, but never present stale data without an
  age marker.
- Do not cache `NOT_FOUND`, `INVALID_REQUEST`, `ERROR`, `QUOTA_FALLBACK`, or
  malformed payloads as valid empty data.

Acceptance criteria:

- Two API replicas hit the provider only once for a fresh cached query.
- `/v1/status` or response metadata exposes cache age/source.
- Tests cover hit/miss/expiry and malformed payloads.

### P0 — Real forward schedule source

The route page cannot show operating weekdays because AeroDataBox daily route
stats do not contain them. The temporary behavior is explicit:

- trailing 7-day route stats
- current board departures
- no calendar

To restore a truthful weekly timetable, integrate one of:

1. **FlightAware AeroAPI schedules** — OAG-sourced, up to 3 weeks per request,
   ~1 year future. Cost is per result set; check the current plan and commercial
   terms.
2. **OAG Schedules API** — authoritative effective dates and
   `legDaysOfOperation`, but enterprise pricing/contract.
3. **AeroDataBox flight-number date endpoints** — possible fallback for specific
   flight numbers, but 12-hour FIDS window and coverage limits make it a poor
   primary schedule source.

Recommended design:

- New gateway endpoint, e.g. `GET /v1/routes/:origin/:destination/schedule`.
- Provider adapter interface so AeroDataBox/FlightAware/OAG can be swapped.
- Normalized table:
  `route_scheduled_flights(origin, destination, carrier, flight_number,
  service_date, dep_local, arr_local, aircraft, source, fetched_at,
  valid_from, valid_to)`.
- Return `status: verified | partial | unavailable`, `source`, `fetchedAt`,
  `validFrom`, `validTo`, and exact dates/flights.
- UI renders a calendar only inside `validFrom..validTo`.
- If unavailable, show frequency-only or no timetable; never synthesize days.
- Coverage check before claiming a route does not operate.

Do not add a schedule UI until the source is live and tested.

### P1 — Finish Android cleanup

Still to address:

- `apps/android/app/src/main/java/com/example/data/MockFlightData.kt`
  - Contains demo flights, airports, weather, alerts, and fixed METAR-like data.
  - Airport reference names/coordinates are used by pickers; fake weather/status
    must not reach production UI.
  - Move test/demo fixtures to `src/test` or a clearly reference-only catalog.
- `apps/android/app/src/main/java/com/example/data/remote/ApiConfig.kt`
  - Defaults to `https://api.codestep.org/` when `AVI_API_BASE_URL` is unset.
  - This makes development builds silently query production. Decide whether to
    require an explicit build config or fail closed.
- `apps/android/app/src/main/java/com/example/data/AirportConnectionsRepository.kt`
  - The static `GlobalRouteCatalog` remains as reference data.
  - It is marked `isLiveVerified = false`, but the UI should continue to label it
    as reference and never as live.
- `apps/android/app/src/main/java/com/example/data/FlightRepository.kt`
  - Cached-flight reconstruction still uses `MockFlightData.getAirport()` for
    country/timezone/coordinates. Weather is now explicitly unreported, but
    metadata should eventually live in Room or a shared catalog.
- Android `Flight` UI still has some unconditional “LIVE”/status copy. Audit
  `FlightCard`, `FlightMapScreen`, `FlightDetailScreen`.
- Android Room has `flightDate` now; verify real-device migration and old cached
  rows.

### P1 — Engine / database integrity

- Add field-level provenance to `WatchSnapshot`: `statusUpdatedAt`,
  `delayUpdatedAt`, `telemetryObservedAt`, `fetchedAt`, `cached`.
- Do not let a provider omission overwrite a previously verified value.
- Decide whether clients may write engine-owned columns
  (`next_poll_at`, `poll_priority`, `flight_date`, `flight_id`). Current grants
  allow authenticated table-wide writes. Add a trigger/column grants or RLS
  restriction.
- Add a readiness endpoint that checks provider configuration, Supabase, Redis,
  and cache reachability. `/healthz` is liveness only.
- Consider an explicit `UNKNOWN` status in the shared contract instead of the
  `statusReported` flag. If added, update web, Android, iOS, and gateway schemas
  together.

### P2 — Tests

- Browser/E2E tests for:
  - route page with no schedule data
  - provider 400/404/204/429/502/503
  - unreported status/delay
  - stale/expired cache
  - weather unavailable
  - unknown airport
  - gate with no departures
- API tests for:
  - cache hit/miss/expiry
  - malformed gateway payloads
  - FIDS empty board not covering jobs
  - `next_poll_at IS NULL` settled-row exclusion (partially covered)
  - schedule adapter (once added)
- Android instrumentation/UI tests for:
  - Room v6 → v7 migration
  - reference airports never shown as delayed/live
  - weather unavailable card
  - seat/aircraft unknown states
- iOS tests currently assert sample data; keep them clearly sample-only.

### P2 — Contract / data hygiene

- Regenerate `packages/contracts/openapi.json` and add a CI diff check.
  Current spec is missing `/v1/me` and billing routes.
- Reference data:
  - `apps/web/src/data/global-airports.json` has `UTC` for most airports and
    historical `destCount`. Use IANA timezones or omit timezone/DST claims.
  - It includes closed airports (e.g. TXL/SXF). Mark historical or remove.
  - `packages/catalog/airports.json` and terminal layouts lack source/as-of
    metadata.
  - Terminal layouts contain illustrative gate/wait-time data; keep labeled.
- Weather:
  - Open-Meteo is a model, not METAR. Do not call it METAR anywhere.
  - If real METAR is required, integrate a METAR/TAF provider with attribution.
- Legal/privacy:
  - Web now purges timestamped cached flights after 7 days, but untimestamped
    legacy rows remain. Either purge them or update the policy wording.
  - Disclose reference/illustrative datasets (airport catalog, terminal layouts,
    seatmaps) in Terms/Privacy.

### P3 — iOS live integration

`apps/ios` is still a placeholder client with sample routes/terminals. It does
not consume the gateway. Add:

- gateway client + Supabase auth token
- console flight/airport/route models with provenance fields
- explicit unavailable/stale states
- remove sample data from production paths once live screens exist

---

## 6. File map

### Web

- `apps/web/src/app/routes/page.tsx` — route network + current board
- `apps/web/src/components/route-timetable.tsx` — no weekly calendar
- `apps/web/src/app/flight/[id]/page.tsx` — flight detail, freshness, refresh
- `apps/web/src/app/map/[id]/page.tsx` — live position gating
- `apps/web/src/app/search/page.tsx` — exact date matching, result states
- `apps/web/src/app/airports/page.tsx` — strict gate filtering, reference labels
- `apps/web/src/app/airplanes/page.tsx` — illustrative seatmap
- `apps/web/src/lib/weather.ts` — strict Open-Meteo mapping, no fallback
- `apps/web/src/lib/store.tsx` — cache purge, refresh results, date keys
- `apps/web/src/lib/data-source.ts` — honest source states

### API

- `services/api/src/providers/console-flights.ts` — AeroDataBox console provider
- `services/api/src/providers/aerodatabox.ts` — flight/engine provider
- `services/api/src/routes/console-airports.ts` — routes/boards/search endpoints
- `services/api/src/engine/snapshot.ts` — merge/provenance/alerts
- `services/api/src/engine/watch-engine.ts` — FIDS/per-flight refresh
- `services/api/src/lib/supabase-server.ts` — watchlist cache/adoption

### Contracts

- `packages/contracts/src/types.ts` — shared Flight/Airport/route types
- `packages/contracts/src/mapping.ts` — AeroDataBox → console mapping

### Android

- `apps/android/app/src/main/java/com/example/data/RealtimeAirportRepository.kt`
- `apps/android/app/src/main/java/com/example/data/AirportConnectionsRepository.kt`
- `apps/android/app/src/main/java/com/example/data/FlightRepository.kt`
- `apps/android/app/src/main/java/com/example/data/weather/DestinationWeatherService.kt`
- `apps/android/app/src/main/java/com/example/data/local/SkyTrackDatabase.kt`
- `apps/android/app/src/main/java/com/example/model/FlightModels.kt`

---

## 7. Verification commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Android:

```bash
cd apps/android
./gradlew :app:compileDebugKotlin
./gradlew :app:testDebugUnitTest
```

Current expected results:

- Web: 25 tests
- API: 95 tests
- Android: 20 unit tests
- Web/API production builds pass

If a change makes any of these fail, fix the test or the code before merging.

---

## 8. Known gotchas

- **`Flight.id` is date-scoped** (`AA100-2026-11-08`). Watchlist row IDs must be
  derived from `flightNumber` plus `flightDate`, not from `id` plus date.
- **AeroDataBox board window is `-2h / +12h`.** It is not “today” and not a
  weekly schedule. UI copy must say “current board window.”
- **AeroDataBox route stats are trailing 7 days.** They are not forward-looking.
- **Gateway configured but unreachable** must return an error. Do not bypass it
  with a direct provider call in production; that bypasses quota/cache/accounting.
- **No schedule provider is configured.** Do not add a weekly calendar until one
  is.
- **Open-Meteo is a model.** It is not METAR and does not provide crosswind/RVR.
- **`statusReported`/`delayReported` are required for a reason.** Do not render
  a default status/delay when they are false.
- **Android Room is at version 7.** Add a migration for any new column; do not
  rely on destructive migration.
- **Reference data is still reference data.** Airport catalogs, terminal
  layouts, and seatmaps are not live and must remain labeled as such.
- **Debug-only simulation** in Android (`simulateRealtimeEvent`) must never be
  enabled in release.

---

## 9. Definition of done for the next phase

1. A durable cache prevents duplicate provider spend across gateway instances.
2. A forward schedule source returns exact operating dates with a validity
   window, or the UI explicitly says it is unavailable.
3. No production UI path can display an invented status, delay, gate, weather
   value, route day, frequency, duration, or seat availability.
4. Every displayed provider value has source + retrieval time.
5. Android no longer uses demo fixtures for production airport/weather metadata.
6. Room migration and Android UI states are verified on a device/emulator.
7. Browser E2E tests cover unavailable/stale/partial states.
8. OpenAPI is regenerated and checked in CI.
9. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` and Android
   compile/tests pass.

# Remaining Work — Avi Monorepo

Last updated: 2026-11-14
Branch: `main`

This is the handoff note for the next engineer/agent. Read it before changing
flight, route, schedule, weather, terminal, cabin, or entitlement data.

---

## 1. Current state

The repository is now a pnpm + Turborepo TypeScript monorepo:

| Workspace | Status |
| --- | --- |
| `apps/web` | Next.js App Router; route explorer globe, 3D cabin page, terminal maps, gateway proxy, SEO metadata/sitemap, contextual monetisation cards |
| `packages/shared` | Strict models + Zod schemas, flight differ, weather client, terminal graph, cabin layouts, BCBP parser, in-flight HUD math, entitlements, gateway SDK |
| `packages/ui` | React Three Fiber cabin viewer + shared 3D scene |
| `services/api` | Fastify provider gateway; `/api/gateway/*` with dynamic TTL and request coalescing |
| `supabase` | Existing schema plus Avi migration for terminal alerts, cabin layouts, gateway cache, trip pass, and passport visits |

The Android, iOS, and Expo mobile clients and their CI workflows are deleted.
Avi is a web-only product; do not restore native projects unless the product
direction changes.

---

## 2. Non-negotiable invariants

Do not reintroduce:

- Hash-generated operating days (`deriveOperatingDays`).
- “Weekly frequency” split equally across operators.
- `dailyFlights ?? 1` or `destCount ?? 40`.
- Static route/airline datasets used as a provider fallback.
- `isLiveVerified: true` without a verified source.
- Delay reasons such as `"ATC Flow"` or “Operational / Air Traffic Control revision.”
- Airline codes derived from a flight number.
- Unknown status mapped to `SCHEDULED` and shown as fact.
- Synthetic METAR strings, crosswind components, RVR, or runway notices.
- Random seat availability.
- Unrelated flights shown as “departures at this gate.”
- Unknown airports silently replaced by another airport.
- Telemetry or weather retained after the provider stops reporting it without a
  stale/unavailable marker.
- 400/404/204 provider responses presented as verified empty results.
- Provider calls from web clients. Always use the Hetzner gateway.

Every provider-backed response should carry, where applicable:

- `source`
- `fetchedAt`
- `attribution`
- `cached` / `stale` / `cacheAgeSeconds` / `ttlSeconds`
- `statusReported`
- `delayReported`
- `weather.reported` / `weatherReported`
- `operatingDays` only when a schedule source actually supplied them

Shared contracts live in `packages/shared/src/models`. The legacy console
flight contract remains in `packages/contracts` and is still used by the gateway
mapping. Migrating the remaining consumers to `@avi/shared` is a follow-up (see
§5).

---

## 3. Gateway behaviour

Implemented in `services/api/src/gateway/gateway-service.ts` and exposed from
`services/api/src/routes/gateway.ts`:

| Endpoint | TTL |
| --- | --- |
| `GET /api/gateway/flights/:flightNumber/:date` | >24 h → 6 h; <6 h / en route → 5 min; landed → 7 days; 6–24 h → 30 min |
| `GET /api/gateway/airports/:iata/routes` | 7 days |
| `GET /api/gateway/airports/:iata/board` | 10 minutes |
| `GET /api/gateway/aircraft/:regOrIcao` | 30 days |

- Provider requests use `ProviderCache.getOrLoad` (L1 map + Redis, Redis locks,
  in-flight promise sharing).
- Fresh flight responses are diffed with `packages/shared/src/services/flightStateDiffer.ts`.
- Diffs are coalesced under `gateway-diff:<flightKey>:<fetchedAt>` so concurrent
  refreshes cannot duplicate pushes.
- Web Push fan-out uses the VAPID loop. Gateway-detected changes are inserted as
  alert rows and delivered to browser subscriptions.
- Landed flight snapshots are served from Supabase `flight_snapshots` for 7 days.
- Cabin layouts are cached in `cabin_layouts`; the parametric layout is the
  fallback and always marked `isExact: false`.

### Follow-ups

1. **Aircraft lookup by ICAO type is not supported by AeroDataBox's
   registration endpoint.** The route currently accepts a registration. If the
   product needs type-only lookup, add a catalog table; do not fabricate a
   registration.
2. **Dynamic TTL after a landed fetch.** The provider cache stores the first TTL
   (5 min for same-day). The Supabase settled-snapshot path covers the required
   7-day retention, but a `ProviderCache.extendTtl()` could simplify it later.
3. **Postgres `gateway_cache` is now wired for routes/aircraft**; keep it in
   sync if the gateway response shapes change.

---

## 4. Feature status and gaps

### Direct Route Explorer
- Web: `/explore/[iata]` with MapLibre globe projection, haul colours, airline
  filters, destination weather, JSON-LD, metadata, sitemap/robots.
- `/explore` adds the world airport connectivity map.
- Gap: route duration is a distance estimate and is labelled as such. A real
  forward schedule still needs FlightAware/OAG and must not be inferred.
- Gap: airline filter counts use reported operators, not per-carrier frequency.

### 3D Cabin & Seat Twin
- Shared parametric presets: A320, B789, B77W, A388; generic narrowbody fallback.
- Web page `/cabin/[type]/[seat]` with the shared R3F canvas.
- Supabase `cabin_layouts` cache is wired through `/api/gateway/aircraft/:reg`.
- Gap: layouts are not airline-specific. Do not present `isExact: false` plans as
  certified. Add curated airline configs only with a provenance source.
- Gap: the web page shows window/exit/lavatory proximity from the parametric
  grid, not a certified cabin plan.

### Terminal Radar + Sprint Mode
- Shared graph builder converts normalized terminal plans to a weighted
  multi-level graph. Dijkstra supports accessibility filtering, moving walkways,
  trains, elevators, and stairs.
- The web terminal map exposes the graph, quick filters, route polyline, sprint
  HUD, and session fog-of-war.
- The Overpass ingestion script writes `terminal_graphs`
  (`pnpm --filter @avi/api ingest:indoor -- CAI --terminal=T3`), `buildOsmIndoorGraph`
  creates real way-sequence corridors, and the gateway exposes the graph at
  `/api/gateway/airports/:iata/terminal-graph`.
- The ingested OSM graph is a fallback when no curated layout exists and a
  terminal id is supplied; curated layouts remain the deterministic default.
- Auth and passport persistence are implemented. Unsynced visits remain
  local-to-session when signed out or offline.
- Gap: sprint mode still needs to be opened from a real connection alert with
  gates and times. The home link intentionally does not fabricate a connection.

### Boarding Pass Parser
- BCBP parser is pure and tested; the web can read PDF417/Aztec/QR payloads.
- Multi-leg BCBP parsing is implemented.
- Gap: bag measurement is not shipped on web; never claim airline approval.

### Offline In-Flight HUD
- Barometer tracker, great-circle interpolation, cabin timeline, and landmark
  callouts remain in `packages/shared/src/services/inflight.ts` for future web
  use.
- Gap: cabin altitude is an estimate from pressure, not aircraft altitude. Keep
  that distinction in every UI string.

### Monetisation
- Shared entitlement resolver supports FREE / PLUS / PRO / $4.99 trip pass.
- `/v1/me` returns product, trip-pass state, and feature flags.
- Web flight detail shows a lounge affiliate card at 2h+ delay and an eSIM card
  after an international landing; terminal page shows the lounge hook.
- Trip-pass checkout and verified Lemon Squeezy/Polar webhook grants are
  implemented; clients cannot grant the pass.
- Gap: RevenueCat/Stripe receipt adapters are not wired. `planFromProductId` is
  the seam; the server must verify receipts/webhooks before granting.

---

## 5. Migration clean-up

- `packages/contracts` now re-exports the shared `Flight` domain types; it still
  owns the console route/schedule request shapes used by the gateway mapping.
- `apps/web/src/lib/types.ts` still carries web-only route/terminal/weather
  types. Move the route/terminal/weather portions to `@avi/shared` and delete the
  duplicates.
- `/routes` now links prominently to the shared explorer while retaining the
  airport-board/timetable planner. A full pivot can follow once the remaining
  web-only filters are ported.
- Design tokens no longer emit Kotlin/Swift files. Remove any stale generated
  native token files from local worktrees.

---

## 6. Verification

Run from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
node packages/catalog/scripts/validate.mjs
```

Expected current results:

- `@avi/shared`: 49 unit tests
- `@avi/api`: 162 tests across 17 files
- `@avi/web`: 38 tests; Next.js production build succeeds with partial prerender
- `@avi/ui`: `tsc --noEmit` succeeds

Migrations have been applied to the linked `avi` project, including the legacy
`20261114000300_expo_push_receipts.sql`, and verified `upToDate: true`. For a
fresh environment:

```bash
npx supabase@3.1.0 db push --remote --yes
```

Migration: `supabase/migrations/20261114000100_aeroquest_gateway.sql`
(terminal alert type, `trip_pass_expires_at`, `cabin_layouts`, `gateway_cache`,
`passport_visits`, `passport_aircraft_visits`) and
`supabase/migrations/20261114000200_terminal_graphs.sql` (`terminal_graphs`), and
`supabase/migrations/20261114000300_expo_push_receipts.sql`
(`expo_push_receipts`).

OSM indoor ingestion is available as a script:

```bash
pnpm --filter @avi/api ingest:indoor -- CAI --terminal=T3 --radius=2500
```

Environment variables are documented in `.env.example`,
`apps/web/.env.example`, and `services/api/.env.example`.

---

## 7. Suggested next order

1. Add airline-specific curated cabin layouts only with a provenance source;
   B738 parametric coverage and the override seam are already in place.
2. Add RevenueCat/Stripe receipt adapters; Polar/Lemon Squeezy trip-pass grants
   and hosted checkout are already implemented.
3. Port the remaining web-only types to `@avi/shared` and complete the `/routes`
   pivot.
4. Add browser E2E tests and cache/push observability dashboards. Docker smoke
   tests are already in CI.
5. Optionally expose the ingested terminal graph as a switchable layer for
   curated airports (the fallback path already works).

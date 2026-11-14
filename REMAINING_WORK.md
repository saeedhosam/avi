# Remaining Work — AeroQuest Monorepo

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
| `apps/mobile` | Expo Router scaffold with all five AeroQuest core screens (route map, terminal radar, 3D cabin, BCBP scanner, AR bag sizer, offline HUD) |
| `packages/shared` | Strict models + Zod schemas, flight differ, weather client, terminal graph, cabin layouts, BCBP parser, in-flight HUD math, entitlements, gateway SDK |
| `packages/ui` | React Three Fiber cabin viewer + shared 3D scene |
| `services/api` | Fastify provider gateway; `/api/gateway/*` with dynamic TTL and request coalescing |
| `supabase` | Existing schema plus AeroQuest migration for terminal alerts, cabin layouts, gateway cache, trip pass, and passport visits |

The Android and iOS clients and their CI workflows are deleted. Do not restore
native projects unless the product direction changes.

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
- Provider calls from web/mobile clients. Always use the Hetzner gateway.

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
- Native fan-out uses Expo Push; users without a native token keep the alert for
  the existing Web Push loop.
- Landed flight snapshots are served from Supabase `flight_snapshots` for 7 days.
- Cabin layouts are cached in `cabin_layouts`; the parametric layout is the
  fallback and always marked `isExact: false`.

### Follow-ups

1. **Supabase `gateway_cache` is created but not yet read/written.** Redis is the
   hot tier today. Add a Postgres read-through fallback for route/aircraft
   payloads so a Redis flush does not spend provider units.
2. **Aircraft lookup by ICAO type is not supported by AeroDataBox's
   registration endpoint.** The route currently accepts a registration. If the
   product needs type-only lookup, add a catalog table; do not fabricate a
   registration.
3. **Dynamic TTL after a landed fetch.** The provider cache stores the first TTL
   (5 min for same-day). The Supabase settled-snapshot path covers the required
   7-day retention, but a `ProviderCache.extendTtl()` could simplify it later.
4. **Expo push receipts.** The fan-out reads tickets, not the receipt endpoint.
   Add receipt polling to prune `DeviceNotRegistered` tokens that only fail
   asynchronously.

---

## 4. Feature status and gaps

### Direct Route Explorer
- Web: `/explore/[iata]` with MapLibre globe projection, haul colours, airline
  filters, destination weather, JSON-LD, metadata, sitemap/robots.
- Mobile: `DirectRouteExplorerScreen` with a bundled world-country map and
  destination weather.
- Gap: route duration is a distance estimate and is labelled as such. A real
  forward schedule still needs FlightAware/OAG and must not be inferred.
- Gap: airline filter counts use reported operators, not per-carrier frequency.

### 3D Cabin & Seat Twin
- Shared parametric presets: A320, B789, B77W, A388; generic narrowbody fallback.
- Web page `/cabin/[type]/[seat]`; mobile `CabinScreen` with native R3F Canvas.
- Supabase `cabin_layouts` cache is wired through `/api/gateway/aircraft/:reg`.
- Gap: layouts are not airline-specific. Do not present `isExact: false` plans as
  certified. Add curated airline configs only with a provenance source.
- Gap: web and mobile show window/exit/lavatory proximity from the parametric
  grid, not a certified cabin plan.

### Terminal Radar + Sprint Mode
- Shared graph builder converts normalized terminal plans to a weighted
  multi-level graph. Dijkstra supports accessibility filtering, moving walkways,
  trains, elevators, and stairs.
- Mobile screen has level switcher, quick filters, route polyline, sprint HUD,
  and session fog-of-war.
- Gap: the graph is generated from stylized curated POIs; it is not an OSM
  indoor survey. An Overpass ingestion script now writes `terminal_graphs`
  (`pnpm --filter @avi/api ingest:indoor -- CAI --terminal=T3`), but the API/SDK
  and mobile screen still read the curated catalog. Wire the ingested graph in
  and improve its geometry to use OSM way nodes instead of proximity edges.
- Gap: mobile fog-of-war persists through `/v1/me/passport` when a Supabase
  session exists, but the mobile sign-in UI and offline queue are not built yet.
  Unsynced visits remain local to the session.
- Gap: sprint mode needs to be opened from a real connection alert with gates
  and times. The home link intentionally does not fabricate a connection.

### Boarding Pass Scanner + AR Sizer
- BCBP parser is pure and tested; scanner uses expo-camera and accepts PDF417,
  Aztec, and QR.
- Gap: multi-leg passes only parse the first leg. Add per-leg parsing if needed.
- Gap: AR bag measurement currently asks for dimensions after framing. Add card
  calibration + bounding-box capture on-device; never claim airline approval.
- Gap: the bin envelope is parametric per aircraft type, not per airline retrofit.

### Offline In-Flight HUD
- Barometer tracker, great-circle interpolation, cabin timeline, and landmark
  callouts are implemented in `packages/shared/src/services/inflight.ts`.
- Gap: the HUD expects a cached route/time context. Wire it to tracked-flight
  snapshots so it opens from the watchlist without manual parameters.
- Gap: cabin altitude is an estimate from pressure, not aircraft altitude. Keep
  that distinction in every UI string.

### Monetisation
- Shared entitlement resolver supports FREE / PLUS / PRO / $4.99 trip pass.
- `/v1/me` returns product, trip-pass state, and feature flags.
- Web flight detail shows a lounge affiliate card at 2h+ delay and an eSIM card
  after an international landing; terminal page shows the lounge hook.
- Gap: RevenueCat/Stripe purchase verification is not wired. `planFromProductId`
  is the seam; the server must verify receipts/webhooks before granting.
- Gap: mobile paywall UI and purchase flow are not built yet.

---

## 5. Migration clean-up

- `packages/contracts` still owns the console `Flight` shape while
  `packages/shared` owns the AeroQuest `Flight` shape. They are structurally
  compatible, and the gateway validates provider output through the shared Zod
  schema. Consolidate them when the remaining web code stops importing
  `@avi/contracts` directly.
- `apps/web/src/lib/types.ts` still carries web-only route/terminal/weather
  types. Move the route/terminal/weather portions to `@avi/shared` and delete the
  duplicates.
- The web route planner (`/routes`) and the new explorer (`/explore/[iata]`) use
  separate rendering paths. Consider making `/routes` pivot to the explorer once
  the legacy filters are ported.
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

- `@avi/shared`: 38 unit tests
- `@avi/api`: 147 tests across 13 files
- `@avi/web`: Next.js production build succeeds with partial prerender
- `@avi/mobile`: `tsc --noEmit` succeeds
- `@avi/ui`: `tsc --noEmit` succeeds

Migrations have been applied to the linked `avi` project and verified
`upToDate: true`. For a fresh environment:

```bash
npx supabase@3.1.0 db push --remote --yes
```

Migration: `supabase/migrations/20261114000100_aeroquest_gateway.sql`
(terminal alert type, `trip_pass_expires_at`, `cabin_layouts`, `gateway_cache`,
`passport_visits`, `passport_aircraft_visits`) and
`supabase/migrations/20261114000200_terminal_graphs.sql` (`terminal_graphs`).

OSM indoor ingestion is available as a script:

```bash
pnpm --filter @avi/api ingest:indoor -- CAI --terminal=T3 --radius=2500
```

Environment variables are documented in `.env.example`,
`apps/web/.env.example`, `services/api/.env.example`, and
`apps/mobile/.env.example`.

---

## 7. Suggested next order

1. Wire Supabase auth + Expo push registration into `apps/mobile` and add the
   sign-in / token-refresh UI.
2. Add the missing mobile flight search + tracked-flight detail screen and cache
   its snapshot for the HUD and terminal context.
3. Wire `terminal_graphs` into the gateway/SDK/mobile as an optional layer over
   the curated graph; improve Overpass geometry.
4. Add RevenueCat/Stripe receipt verification and a real trip-pass checkout.
5. Add Postgres read-through for `gateway_cache` and Expo receipt polling.
6. Consolidate `@avi/contracts` with `@avi/shared`, port the remaining web types,
   and migrate `/routes` to the explorer model.
7. Add CI coverage for an Expo export and a Docker image smoke test.

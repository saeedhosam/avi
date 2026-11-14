# AeroQuest

AeroQuest is a flight-tracking, route-discovery, terminal-wayfinding, and 3D-cabin
travel companion. The repository is a **pnpm + Turborepo TypeScript monorepo**:
one shared domain layer, one Starter-safe AeroDataBox caching gateway, a Next.js
web app, and an Expo mobile app.

The previous native clients (`apps/android` Kotlin/Compose and `apps/ios` SwiftUI)
have been removed. Their valuable models, diffing logic, weather mapping, and
terminal POI schema were ported to `packages/shared` before deletion.

---

## Workspace layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js 16 App Router web app: public route explorer, flight dossier, terminal maps, 3D cabin, SEO pages, `/api/gateway/*` same-origin proxy |
| `apps/mobile` | Expo / React Native app: route explorer, terminal radar + Sprint Mode, 3D cabin, BCBP scanner, AR bag sizer, offline in-flight HUD |
| `packages/shared` | Canonical TypeScript models, Zod schemas, flight differ, Open-Meteo client, terminal graph, cabin layouts, BCBP parser, in-flight math, entitlements, gateway SDK |
| `packages/ui` | Shared cross-platform UI primitives and the React Three Fiber cabin scene |
| `packages/contracts` | Existing OpenAPI console-flight contract (kept for the gateway/web migration) |
| `packages/catalog` | Bundled airport, terminal-layout, and world-country reference data |
| `packages/design-tokens` | Shared dark-cockpit design tokens (CSS) |
| `packages/map-style` | Positron-derived MapLibre style |
| `services/api` | Fastify gateway + Redis cache + watch engine + Expo/Web Push |
| `supabase` | Postgres schema, RLS, migrations, tests |
| `infra/server` | Hetzner Docker Compose, Caddy, production env templates |

---

## Architecture

```text
Web (Next.js) ─┐
               ├─→ /api/gateway/* (same-origin proxy) ─→ Hetzner Fastify gateway ─→ AeroDataBox
Mobile (Expo) ─┘                                          │
                                                          ├─→ Redis provider cache (single-flight)
                                                          ├─→ Supabase (auth, trips, snapshots,
                                                          │             cabin layouts, alerts)
                                                          └─→ Open-Meteo (free arrival weather)
```

**Clients never call AeroDataBox directly.** The Starter plan is protected by a
shared cache and request coalescing:

- 50 passengers refreshing the same flight produce **one** provider call and one
  fan-out.
- `flightStateDiffer` runs only on a fresh response; gate, terminal, delay,
  status, and baggage changes are written to Supabase and fanned out with Expo
  Push (native) or Web Push.
- The diff itself is coalesced through the same Redis lock, so a burst cannot
  duplicate notifications across replicas.

### Gateway endpoints and TTL policy

| Endpoint | Cache | Notes |
| --- | --- | --- |
| `GET /api/gateway/flights/:flightNumber/:date` | Dynamic: 6 h if >24 h away; 5 min if <6 h or en route; 7 days when landed | Settled flights are served from the Supabase snapshot for 7 days |
| `GET /api/gateway/airports/:iata/routes` | 7 days | Direct-route explorer; statistics are trailing 7-day averages, never a forward schedule |
| `GET /api/gateway/airports/:iata/board` | 10 minutes | FIDS + Open-Meteo current weather merge |
| `GET /api/gateway/aircraft/:regOrIcao` | 30+ days | Aircraft metadata + cached parametric cabin layout |

Every response carries provenance (`source`, `fetchedAt`, `cached`, `stale`,
`cacheAgeSeconds`, `ttlSeconds`). Failure and empty outcomes are never cached or
presented as verified empty data.

The web exposes the same paths through `apps/web/src/app/api/gateway/[...path]`,
so the browser stays same-origin and never receives a provider key.

---

## Features

### 1. Direct Route Explorer Globe
`/explore/[iata]` is public, shareable, and SEO-indexed. It renders a MapLibre
globe with great-circle route arcs colour-coded by haul, airline filters, and
cached destination weather. The same network is available in the mobile app with
a 2D world map and destination weather on tap.

### 2. 3D Cabin & Seat Twin
`packages/ui/src/cabin/CabinViewer3D.tsx` renders a parametric deck for the
aircraft type returned by AeroDataBox (`B77W`, `A320`, `A388`, `B789`, plus a
generic fallback). Selecting a seat highlights it and reports window alignment,
pitch, power/USB, lavatory/exit proximity, and overhead-bin dimensions. Layouts
are cached in the Supabase `cabin_layouts` table.

### 3. Terminal Radar and Sprint Mode
`apps/mobile/src/screens/TerminalMapScreen.tsx` renders an isometric terminal
from the curated indoor POI catalog. Quick-filter pills route to the nearest
restroom, security, immigration, water, power, or lounge. `evaluateSprintMode`
activates below 45 minutes between arrival and boarding, returns the fastest
graph path, and highlights moving walkways or terminal trains. Fog-of-war
passport visits are stored in Supabase (`passport_visits`).

Curated layouts remain the deterministic fallback. To ingest OpenStreetMap
indoor tags into the `terminal_graphs` table:

```bash
pnpm --filter @avi/api ingest:indoor -- CAI --terminal=T3 --radius=2500
```

### 4. Boarding Pass Scanner + AR Carry-On Sizer
BCBP (IATA Resolution 792) data from PDF417/Aztec/QR is parsed **on-device** by
`packages/shared/src/services/boardingPassParser.ts`: PNR, flight, Julian date,
origin/destination, seat, and cabin are extracted with zero API cost. The mobile
scanner then fetches live status from the gateway. The carry-on sizer compares a
measured bag against the aircraft's overhead-bin envelope.

### 5. Offline In-Flight HUD
The mobile HUD reads the phone barometer via `expo-sensors`, estimates cabin
altitude, detects climb/cruise/top-of-descent, interpolates the cached
great-circle route from the actual takeoff time, and shows an estimated cabin
timeline and offline landmark callouts.

### Monetisation
- Free: route explorer, basic flight lookup, 2D terminal map.
- Pro: instant gate/terminal/status alerts, 3D cabin, Sprint Mode, offline HUD,
  fog-of-war passport, AR bag sizer.
- `$4.99 Single-Trip Pass`: trip-scoped access to the Pro travel features.
- Contextual cards only: a 2h+ delay shows a lounge affiliate hook; a landed
  international flight shows an eSIM hook. No banner ads.

---

## Data-integrity rules

If a value cannot be traced to a legitimate provider response, it is shown as
`unavailable`, `not reported`, or an explicit error. Never synthesize:

- operating days, weekly frequency splits, or forward schedules from daily stats;
- airline codes from flight numbers;
- METAR text, crosswind/RVR, or runway operational notices from Open-Meteo;
- gates, baggage belts, or statuses that the provider stopped reporting;
- seat availability or window/power claims outside the disclosed parametric model;
- a static route dataset when the provider fails.

---

## Local development

```bash
corepack enable
pnpm install
pnpm dev
```

- Web: <http://localhost:3000>
- Gateway: <http://localhost:8080>
- OpenAPI: <http://localhost:8080/openapi.json>
- Mobile: `pnpm --filter @avi/mobile start` (Expo Go / dev client)

Copy root `.env.example` values as needed:

```bash
cp apps/web/.env.example apps/web/.env.local
cp services/api/.env.example services/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

`AERODATABOX_API_KEY` is server-only. Production must set `AVI_API_BASE_URL`; the
web then uses the gateway exclusively.

### Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
node packages/catalog/scripts/validate.mjs
```

---

## Deployment

Production runs on the Hetzner server:

- `avi-web` → Next.js standalone container on port 3000
- `avi-api` → Fastify gateway on port 8080
- `avi-engine` → watchlist polling worker
- `avi-redis` → shared provider cache + quotas
- Caddy terminates HTTPS and proxies `app.*` / `api.*`

Build images from the root multi-target Dockerfile:

```bash
docker build --target api -t avi-api .
docker build --target web -t avi-web \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
  --build-arg AVI_API_BASE_URL=... .
```

Both targets use `turbo prune` so the web image does not ship the gateway and
the API image does not ship Next.js. `.github/workflows/deploy.yml` pushes
Supabase migrations, builds both targets, transfers the images, and activates
the release.

### Required environment

Documented in `.env.example`: `AERODATABOX_API_KEY`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`REDIS_URL`, `AVI_API_BASE_URL`, VAPID/Expo push keys, and public web/mobile
origins.

---

## Licensing and data

- Map data © OpenStreetMap contributors (ODbL).
- Vector tiles/style: OpenFreeMap and MapLibre.
- Natural Earth reference data is public domain.
- AeroDataBox and Open-Meteo data are subject to their provider terms.
- Indoor maps and cabin plans are informational, not certified navigation/AMDB
  or airline cabin data.

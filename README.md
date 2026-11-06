# Avi

Avi is a flight-tracking and terminal-wayfinding platform with a shared provider gateway and native clients.

## Applications

| Path | Purpose | Status |
| --- | --- | --- |
| `apps/web` | Next.js 16 web client | Running; Supabase auth/data migration in progress |
| `apps/android` | Kotlin + Compose Android client | MapLibre migration complete; Google Maps removed |
| `apps/ios` | SwiftUI placeholder client | Scaffolded |
| `services/api` | Fastify provider gateway | Running; live flight search + status |
| `supabase` | Postgres schema, RLS, migrations, tests | Applied to the `avi` project |
| `packages/contracts` | OpenAPI contract | Generated from the API |
| `packages/catalog` | Airports, terminal layouts, world reference data | Bundled |
| `packages/map-style` | Positron-derived MapLibre style | Generated |
| `packages/design-tokens` | Shared colour/theme tokens | Generated |
| `infra/server` | Docker Compose, Caddy, server env templates | Deployed on Hetzner |

## Environment

```text
Web:      https://app.2-31-110-53.sslip.io
API:      https://api.2-31-110-53.sslip.io
Supabase: https://uiabvbndrpscsscvwofc.supabase.co
Server:   2.31.110.53 / 2a01:4f8:c015:b0::1
```

The `sslip.io` hostnames are temporary staging names. They will be replaced with the production domain when DNS is connected.

## Local development

```bash
corepack enable
pnpm install
pnpm dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:8080>
- API docs: <http://localhost:8080/openapi.json>

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in public Supabase values plus the server-only AeroDataBox key. Copy `services/api/.env.example` to `services/api/.env` for the API.

## Supabase

```bash
supabase login
supabase link --project-ref uiabvbndrpscsscvwofc
supabase db push
supabase gen types typescript --linked --schema public > apps/web/src/lib/database.types.ts
```

The schema contains:

- `profiles`, `tracked_flights`, `flight_alerts`, `device_tokens`, `push_subscriptions`
- `flight_snapshots`, `provider_cache`, `airport_maps`, `osm_ingest_runs`
- `legacy_imports` for the one-time Firestore migration
- RLS policies and a `claim_legacy_data()` RPC

Do not put the Supabase secret key in any client. The web uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the API uses `SUPABASE_SECRET_KEY` server-side only.

## Server

The Hetzner server is documented in [`docs/server.md`](docs/server.md). The short version:

```bash
ssh deploy@2.31.110.53
cd /opt/avi
docker compose ps
docker compose logs --tail=100
```

Caddy terminates HTTPS and proxies:

- `app.*` → `avi-web:3000`
- `api.*` → `avi-api:8080`

Current implementation status and remaining work: [`docs/status.md`](docs/status.md).

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
node packages/catalog/scripts/validate.mjs
```

## Licensing and data

- Map data © OpenStreetMap contributors (ODbL).
- Vector tiles and Positron-derived style: OpenFreeMap and MapLibre.
- Natural Earth reference data is public domain.
- AeroDataBox and Open-Meteo data are subject to their provider terms.
- Indoor and airfield maps are informational, not certified navigation or AMDB data.

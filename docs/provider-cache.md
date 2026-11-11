# Provider response cache

## Why

AeroDataBox charges units per request. The gateway used to keep provider
responses in per-process `TtlCache` maps, so N replicas each paid for the same
query and could show different freshness. The cache is now a two-tier,
read-through cache shared by every replica.

## Tiers

| Tier | Backend | Scope | Enabled |
| ---- | ------- | ----- | ------- |
| L1 | in-process `Map` | one process | always |
| L2 | Redis (`REDIS_URL`) | all replicas | when `REDIS_URL` is set |

`PROVIDER_CACHE_ENABLED=false` bypasses both tiers (emergency kill switch and
tests). Without Redis the cache stays correct but per-process; `/v1/status`
reports `cache.shared: false`.

## Entry shape

Redis keys are `avi:provider-cache:v1:<provider>:<endpoint>:<normalized query>`
(the AeroDataBox client prefixes its own path). Each value stores:

- `payload` — the raw provider response (mapped per request afterwards)
- `payloadHash` — SHA-256 of the canonicalized payload
- `queryHash` — SHA-256 of the canonicalized query
- `source`, `attribution`
- `fetchedAt`, `freshUntil`, `expiresAt`

A read recomputes both hashes. A malformed body, hash mismatch, wrong query
hash, or expired entry is a miss and the shared key is deleted — corrupted data
is never served as fact.

## TTL policy

Fresh windows follow provider rules; the stale window allows one background
revalidation while callers still get the previous payload, labelled
`stale: true` with `cacheAgeSeconds`.

| Endpoint | Fresh | Stale |
| -------- | ----- | ----- |
| Flight status (`/v1/flights/search`, `/v1/flights/lookup`) | 45 s | 60 s |
| Airport board (`-2h / +12h` FIDS) | 60 s | 120 s |
| Daily route stats | 6 h | 1 h |
| Airport search | 10 min | 10 min |
| Flight operating dates | 6 h | 1 h |
| Flight delay statistics | 30 min | 10 min |
| Aircraft reference | 6 h | 1 h |
| Airport reference info | 24 h | 1 h |
| Airport feed coverage | 10 min | 5 min |
| Forward schedule | 6 h | 1 h |

Constants live in `services/api/src/lib/provider-cache.ts`
(`PROVIDER_TTL_MS`, `PROVIDER_STALE_MS`).

## What is never cached

Only a parsed 2xx payload is stored. These outcomes are always re-fetched and
returned to the client uncached:

- `NOT_CONFIGURED`
- `NOT_FOUND` / `INVALID_REQUEST` (provider 400/404)
- `ERROR` (401/403, 5xx, network, malformed payload)
- `QUOTA_FALLBACK` (429)
- provider `204` (no data is not a verified empty result)
- `unavailable` schedule responses

This is the data-integrity rule: a failure must reach the caller as an explicit
state on every request, never as a cached empty list.

## Stampede protection

- Concurrent loads for one key in a process share one promise.
- Across replicas, a short Redis `SET NX PX` lock makes one replica pay for the
  fetch; the others wait up to 1 s for the shared entry, then proceed if the
  lock holder failed.
- Stale refresh uses a separate lock and never blocks the response.

## Observability

`GET /v1/status` includes:

```json
"cache": {
  "backend": "redis",
  "enabled": true,
  "shared": true,
  "hits": 120,
  "staleHits": 3,
  "misses": 41,
  "sharedHits": 80,
  "stores": 41,
  "errors": 0,
  "entries": 39
}
```

`GET /readyz` pings the cache backend and reports
`checks.cache = { backend, shared, ok }`. It returns `503` when the cache is
unreachable, or in production when the provider key or Supabase configuration
is missing.

## Tests

`services/api/test/provider-cache.test.ts` covers hit/miss/expiry, staleness
and background revalidation, cross-replica sharing, concurrent dedupe,
malformed payloads, hash mismatches, the "never cache failures" predicate, and
the disabled mode. `console-flights.test.ts` and `schedule.test.ts` verify the
provider-level read-through and that unavailable outcomes are re-fetched.

## Forward schedule source

Scheduling lives behind `services/api/src/providers/schedule.ts`:

- `SCHEDULE_PROVIDER=none` (default) → `status: "unavailable"`,
  `reason: "no_schedule_provider_configured"`.
- `SCHEDULE_PROVIDER=flightaware` + `FLIGHTAWARE_API_KEY` → AeroAPI published
  schedules (`GET /schedules/{start}/{end}`, OAG-sourced, Zulu times, up to
  3 weeks per request / 1 year forward).

The endpoint (`GET /v1/routes/:origin/:destination/schedule`) returns
`verified | partial | unavailable`, an explicit validity window, and
`timeBasis: "utc"` when the source is AeroAPI. It never synthesizes operating
days or a weekly frequency. No schedule UI should be enabled until the source
is live and tested with real credentials.

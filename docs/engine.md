# Engine worker (`avi-engine`)

> Split from the gateway in P2 Track B. Ladder lives in Postgres; alerts dedupe
> on a unique index. The gateway is HTTP-only and `/v1/status` proxies to this
> worker for engine stats — so deploy and rollback now apply to both containers.

## Why split

- Restarting the gateway no longer resets poll ladders or re-sends alerts.
- Flaky web requests can't delay provider polling or alerts.
- Watch flights share a stable budget meter (`UsageTracker` now lives in the
  worker process) rather than tracking counters in an HTTP request path.

## Architecture

```text
avi-web (Next.js)
avi-api (HTTP gateway; WATCH_ENGINE_ENABLED=false)
avi-engine (worker; WATCH_ENGINE_ENABLED=true, port 8090)
avi-redis (shared counters + engine stats)
```

- `scheduleNextPoll()` in `services/api/src/engine/snapshot.ts` is the
  restart-safe ladder, written back into
  `watchlist_items.next_poll_at / poll_priority`.
- `listWatchlist(limit)` fetches only rows where `next_poll_at <= now()` or
  null; every row it returns is the ones due.
- `flight_alerts` dedupes on `(user_id, flight_number, alert_type, message)`
  via `Prefer: resolution=ignore-duplicates`; `seenAlerts` in-process set is
  gone.
- Engine stats ride on Redis (`avi:engine:status`, TTL 90 s). `/v1/status`
  on the gateway reads that key — no HTTP proxy between gateway and worker.

## Where to look in code

- `services/api/src/engine/worker.ts` — worker entrypoint.
- `services/api/src/engine/watch-engine.ts` — tick loop.
- `services/api/src/engine/snapshot.ts` — ladder (`scheduleNextPoll`).
- `services/api/src/lib/supabase-server.ts` — `patchPollSchedule`.
- `services/api/src/lib/engine-status.ts` — Redis stats exchange.
- `supabase/migrations/20261107000300_engine_state.sql` — the state change.

## Adding a new poll rule

1. Extend `scheduleNextPoll` (`snapshot.ts`) with the new branch returning
   `{ atMs, priority }`.
2. Add a unit test in `watch-engine.test.ts` (poll ladder suite).
3. No migration changes needed — the ladder is data, not columns.

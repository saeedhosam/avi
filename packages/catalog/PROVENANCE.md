# Catalog provenance

The files in this package are **bundled reference data**, not live provider
responses:

- `airports.json` — airport identity, coordinates, and a reference timezone.
- `terminal-layouts.json` — illustrative terminal geometry, gates, amenities,
  and walking estimates.
- `world_countries.json` — country metadata used for presentation.

## Status

- **Source:** compiled from public airport/terminal reference material. The
  original upstream datasets and their licences were not recorded when the
  files were added, so this repository cannot certify them for redistribution
  or operational use.
- **As of:** unknown. Airport codes, terminals, and gate assignments change;
  entries may be historical (for example closed airports).
- **Not for operational use.** Do not use this data for navigation, wayfinding,
  flight planning, or as evidence that a gate/terminal/route exists.

## Rules for consumers

1. Label these datasets as reference or illustrative in any UI that renders
   them.
2. Never merge them into live provider responses or present them as current.
3. Prefer provider-supplied values (including IANA timezones) whenever
   available.
4. Before redistributing this package or using it commercially, establish the
   upstream source and licence, and record it here with an `as of` date.

## Web airport map

`apps/web/public/airports-routes.csv` is the source of truth for which airports
appear on the web map and for their active route counts. It has no coordinates,
so the web app joins each row to `apps/web/src/data/global-airports.json` by
IATA (preferred) or ICAO. CSV rows with no coordinate match are omitted.

`global-airports.json` is now coordinate/identity reference data only; it is no
longer the map's membership list.

## Timezones

`apps/web/src/data/global-airports.json` intentionally no longer stores
timezone abbreviations such as `CEST (UTC+2)`: they are wrong across DST
boundaries. Provider-reported IANA zones are the only timezone values shown as
fact.

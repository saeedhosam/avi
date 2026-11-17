# Local map assets

- `style.json` — generated from `packages/map-style` (Positron-derived dark
  theme); tiles come from OpenFreeMap / OpenMapTiles / OpenStreetMap.
- `glyphs/` — Noto Sans (Regular, Bold, Italic) PBF subsets fetched from the
  OpenFreeMap glyph server. Noto Sans is licensed under the SIL Open Font
  License.
- `sprite/ofm.*` — the OpenFreeMap `ofm_f384` sprite used by the shared map
  style. Icons retain their OpenMapTiles / OpenStreetMap attribution.
- The first-paint globe uses the bundled country outlines from
  `packages/shared/src/assets/world_countries.json`.

The runtime attribution in `src/lib/maplibre.ts` covers these sources.

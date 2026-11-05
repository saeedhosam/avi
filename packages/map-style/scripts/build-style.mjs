import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = JSON.parse(
  readFileSync(resolve(root, "positron.source.json"), "utf8"),
);

const palette = {
  background: "#F2F3F5",
  water: "#CBE7F9",
  waterway: "#A5D8F3",
  boundary: "#D3D8E0",
  park: "#E8EDF2",
  residential: "#EEF1F4",
  building: "#E8ECF1",
  label: "#334155",
  labelHalo: "#FFFFFF",
};

const overrides = {
  background: { "background-color": palette.background },
  park: { "fill-color": palette.park },
  water: { "fill-color": palette.water },
  waterway: { "line-color": palette.waterway },
  landuse_residential: { "fill-color": palette.residential },
  building: { "fill-color": palette.building, "fill-outline-color": palette.boundary },
  boundary_2: { "line-color": palette.boundary },
  boundary_3: { "line-color": palette.boundary },
  boundary_disputed: { "line-color": palette.boundary },
  airport: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
  label_other: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
  label_village: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
  label_town: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
  label_state: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
  label_city: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
  label_city_capital: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
  label_country_1: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
  label_country_2: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
  label_country_3: { "text-color": palette.label, "text-halo-color": palette.labelHalo },
};

for (const layer of source.layers) {
  const override = overrides[layer.id];
  if (override) {
    layer.paint = { ...(layer.paint ?? {}), ...override };
  }
}

source.name = "Avi Positron";
source.metadata = {
  ...(source.metadata ?? {}),
  "avi:palette": palette,
};

if (source.sources?.openmaptiles) {
  source.sources.openmaptiles.attribution =
    "© OpenMapTiles © OpenStreetMap contributors";
}
if (source.sources?.ne2_shaded) {
  source.sources.ne2_shaded.attribution =
    "Natural Earth © OpenStreetMap contributors";
}

writeFileSync(resolve(root, "style.json"), `${JSON.stringify(source, null, 2)}\n`);
console.log(`map style written: ${source.layers.length} layers`);

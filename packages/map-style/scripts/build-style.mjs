import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = JSON.parse(
  readFileSync(resolve(root, "positron.source.json"), "utf8"),
);

const darkPalette = {
  background: "#0B1A2A",
  water: "#07131F",
  waterway: "#123A55",
  boundary: "#1E3A55",
  park: "#0E2233",
  residential: "#10283B",
  building: "#13283E",
  label: "#8AA0B8",
  labelHalo: "#071018",
  road: "#1B334C",
  roadCasing: "#12283A",
  rail: "#1E3A55",
};

function buildVariant(name, palette, extra = {}) {
  const style = structuredClone(source);
  style.name = name;

  const overrides = {
    background: { "background-color": palette.background },
    park: { "fill-color": palette.park },
    water: { "fill-color": palette.water },
    waterway: { "line-color": palette.waterway },
    landuse_residential: { "fill-color": palette.residential },
    landcover_wood: { "fill-color": palette.park },
    landcover_ice_shelf: { "fill-color": palette.building },
    landcover_glacier: { "fill-color": palette.building },
    building: {
      "fill-color": palette.building,
      "fill-outline-color": palette.boundary,
    },
    boundary_2: { "line-color": palette.boundary },
    boundary_3: { "line-color": palette.boundary },
    boundary_disputed: { "line-color": palette.boundary },
    airport: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    label_other: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    label_village: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    label_town: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    label_state: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    label_city: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    label_city_capital: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    label_country_1: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    label_country_2: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    label_country_3: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    waterway_line_label: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    water_name_point_label: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    water_name_line_label: {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    highway_path: { "line-color": palette.road },
    highway_minor: { "line-color": palette.road },
    highway_major_casing: { "line-color": palette.roadCasing },
    highway_major_inner: { "line-color": palette.road },
    highway_motorway_casing: { "line-color": palette.roadCasing },
    highway_motorway_inner: { "line-color": palette.road },
    highway_motorway_bridge_casing: { "line-color": palette.roadCasing },
    highway_motorway_bridge_inner: { "line-color": palette.road },
    highway_major_subtle: { "line-color": palette.road },
    highway_motorway_subtle: { "line-color": palette.road },
    tunnel_motorway_casing: { "line-color": palette.roadCasing },
    tunnel_motorway_inner: { "line-color": palette.road },
    "aeroway-taxiway": { "line-color": palette.roadCasing },
    "aeroway-runway-casing": { "line-color": palette.boundary },
    "aeroway-runway": { "line-color": palette.road },
    railway: { "line-color": palette.rail },
    railway_service: { "line-color": palette.rail },
    railway_transit: { "line-color": palette.rail },
    railway_dashline: { "line-color": palette.background },
    railway_service_dashline: { "line-color": palette.background },
    railway_transit_dashline: { "line-color": palette.background },
    "highway-name-path": {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
    "highway-name-minor": { "text-color": palette.label },
    "highway-name-major": { "text-color": palette.label },
    road_pier: { "line-color": palette.background },
    road_area_pier: { "fill-color": palette.background },
    ...extra,
  };

  for (const layer of style.layers) {
    const override = overrides[layer.id];
    if (override) {
      layer.paint = { ...(layer.paint ?? {}), ...override };
    }
  }

  style.metadata = {
    ...(style.metadata ?? {}),
    "avi:palette": palette,
  };

  if (style.sources?.openmaptiles) {
    style.sources.openmaptiles.attribution =
      "© OpenMapTiles © OpenStreetMap contributors";
  }
  if (style.sources?.ne2_shaded) {
    style.sources.ne2_shaded.attribution =
      "Natural Earth © OpenStreetMap contributors";
  }

  return style;
}

const dark = buildVariant("Avi Positron Dark", darkPalette, {
  "aeroway-area": { "fill-color": "#1E3A55" },
});

writeFileSync(resolve(root, "style.json"), `${JSON.stringify(dark, null, 2)}\n`);
console.log(`map style written: ${dark.layers.length} layers`);

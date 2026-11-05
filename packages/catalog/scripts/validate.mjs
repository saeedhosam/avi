import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function readJson(name) {
  return JSON.parse(readFileSync(resolve(root, name), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const airports = readJson("airports.json");
assert(Array.isArray(airports), "airports.json must be an array");
assert(airports.length >= 20, "airports.json looks incomplete");

const iataCodes = new Set();
for (const airport of airports) {
  assert(typeof airport.iata === "string", "airport iata is required");
  assert(/^[A-Z]{3}$/.test(airport.iata), `invalid IATA code: ${airport.iata}`);
  assert(!iataCodes.has(airport.iata), `duplicate IATA code: ${airport.iata}`);
  assert(typeof airport.latitude === "number", `${airport.iata} latitude missing`);
  assert(typeof airport.longitude === "number", `${airport.iata} longitude missing`);
  iataCodes.add(airport.iata);
}

const layouts = readJson("terminal-layouts.json");
assert(Array.isArray(layouts), "terminal-layouts.json must be an array");
for (const layout of layouts) {
  assert(typeof layout.airportCode === "string", "terminal layout airportCode is required");
  assert(
    layout.floors && typeof layout.floors === "object" && !Array.isArray(layout.floors),
    `${layout.airportCode} floors object missing`,
  );
  assert(
    Array.isArray(layout.availableLevels),
    `${layout.airportCode} availableLevels missing`,
  );
}

const countries = readJson("world_countries.json");
assert(
  countries && typeof countries === "object",
  "world_countries.json must contain a GeoJSON object",
);

console.log(
  `catalog ok: ${airports.length} airports, ${layouts.length} terminal layouts, world countries present`,
);

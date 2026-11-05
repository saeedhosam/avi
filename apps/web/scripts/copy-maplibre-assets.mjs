import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("maplibre-gl/package.json");
const packageRoot = dirname(packagePath);
const worker = resolve(packageRoot, "dist/maplibre-gl-worker.mjs");
const target = resolve(import.meta.dirname, "../public/maplibre/maplibre-gl-worker.mjs");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(worker, target);
console.log(`MapLibre worker copied to ${target}`);

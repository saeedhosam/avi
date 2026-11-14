import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
mkdirSync(resolve(root, "dist/assets"), { recursive: true });
cpSync(
  resolve(root, "src/assets/world_countries.json"),
  resolve(root, "dist/assets/world_countries.json"),
);
console.log("shared assets copied");

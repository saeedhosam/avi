import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(import.meta.dirname, "../openapi.json");
const spec = JSON.parse(readFileSync(file, "utf8"));
if (!spec.openapi || !spec.paths) {
  throw new Error("openapi.json is missing openapi/paths");
}
console.log(`contracts ok: ${Object.keys(spec.paths).length} paths`);

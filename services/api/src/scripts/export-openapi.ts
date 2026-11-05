import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";

const output = resolve(process.cwd(), "../../packages/contracts/openapi.json");
const app = await buildApp(
  loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    AERODATABOX_API_KEY: "",
  }),
);

await app.ready();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
console.log(`openapi written: ${output}`);

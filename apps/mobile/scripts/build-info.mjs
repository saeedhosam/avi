import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const app = JSON.parse(readFileSync(resolve(root, "app.json"), "utf8"));
const dist = resolve(root, "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(
  resolve(dist, "build-info.json"),
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      expo: pkg.dependencies.expo,
      appName: app.expo?.name ?? "AeroQuest",
      slug: app.expo?.slug ?? "aeroquest",
      note: "Native binaries are produced by EAS Build (see eas.json).",
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);
console.log("mobile build metadata written to dist/build-info.json");

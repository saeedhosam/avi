import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tokens = JSON.parse(readFileSync(resolve(root, "tokens.json"), "utf8"));
const dist = resolve(root, "dist");
mkdirSync(dist, { recursive: true });

const cssLines = [":root {"];
for (const [name, value] of Object.entries(tokens.color)) {
  cssLines.push(`  --avi-${kebab(name)}: ${value};`);
}
for (const [name, value] of Object.entries(tokens.radius)) {
  cssLines.push(`  --avi-radius-${kebab(name)}: ${value}px;`);
}
cssLines.push("}");
writeFileSync(resolve(dist, "tokens.css"), `${cssLines.join("\n")}\n`);

console.log(`design tokens written: ${Object.keys(tokens.color).length} colors`);

function kebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

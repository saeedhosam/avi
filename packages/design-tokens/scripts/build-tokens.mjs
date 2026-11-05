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

const kotlinLines = [
  "package app.avi.design",
  "",
  "import androidx.compose.ui.graphics.Color",
  "",
  "object AviTokens {",
  "    object Colors {",
];
for (const [name, value] of Object.entries(tokens.color)) {
  kotlinLines.push(`        val ${name} = Color(0xFF${value.slice(1).toUpperCase()})`);
}
kotlinLines.push("    }", "}");
writeFileSync(resolve(dist, "AviTokens.kt"), `${kotlinLines.join("\n")}\n`);

const swiftLines = [
  "import SwiftUI",
  "",
  "enum AviTokens {",
  "    enum Colors {",
];
for (const [name, value] of Object.entries(tokens.color)) {
  swiftLines.push(`        static let ${name} = Color(hex: 0x${value.slice(1).toUpperCase()})`);
}
swiftLines.push("    }", "}");
writeFileSync(resolve(dist, "AviTokens.swift"), `${swiftLines.join("\n")}\n`);

console.log(`design tokens written: ${Object.keys(tokens.color).length} colors`);

function kebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

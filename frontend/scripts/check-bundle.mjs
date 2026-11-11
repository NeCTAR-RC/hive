#!/usr/bin/env node
// Guards the first-paint cost of the shipping build. Reads the built
// index.html, takes the entry script and every modulepreload (the JS a
// browser fetches before the first route renders) and fails when:
//
// - a chunk that only lazy pages need (the charts family) is preloaded, or
// - the gzip size of that initial JS exceeds INITIAL_JS_GZIP_BUDGET.
//
// Usage: node scripts/check-bundle.mjs [distDir]   (default: dist)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// The initial JS measured 343 kB gzip after route-level code splitting
// moved the feature pages out of the entry (React Aria 169, React 68, app
// code 49: shell, login, home and the shared helpers; router 26, design
// system 20, query 10; kB of 1000 bytes, this script's own gzip). Before
// the split it was 489 kB, 195 of them app code. The budget leaves about
// 5% headroom, so a new vendor family or an eager import of a feature
// page fails the build instead of slipping through.
const INITIAL_JS_GZIP_BUDGET = 360_000;

// Chunk name prefixes that must never load on first paint.
const LAZY_ONLY = ["vendor-charts"];

const distDir = process.argv[2] ?? "dist";
const html = readFileSync(join(distDir, "index.html"), "utf8");

const initial = [
  ...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g),
  ...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g),
].map((match) => match[1]);

const problems = [];
const sizes = initial.map((href) => {
  const file = href.replace(/^\//, "");
  const name = file.split("/").pop() ?? file;
  if (LAZY_ONLY.some((prefix) => name.startsWith(prefix))) {
    problems.push(
      `${name} is loaded on first paint but only lazy pages need it`,
    );
  }
  return { name, gzip: gzipSync(readFileSync(join(distDir, file))).length };
});

const total = sizes.reduce((sum, { gzip }) => sum + gzip, 0);
if (total > INITIAL_JS_GZIP_BUDGET) {
  problems.push(
    `initial JS is ${kb(total)} gzip, over the ${kb(INITIAL_JS_GZIP_BUDGET)} budget`,
  );
}

for (const { name, gzip } of sizes.toSorted((a, b) => b.gzip - a.gzip)) {
  console.log(`  ${kb(gzip).padStart(9)}  ${name}`);
}
console.log(`  ${kb(total).padStart(9)}  initial JS (gzip)`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`Bundle check: ${problem}`);
  process.exit(1);
}
console.log("Bundle check passed.");

function kb(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

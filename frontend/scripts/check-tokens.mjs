#!/usr/bin/env node
// Hive styles consume design tokens through the --hive-* custom properties
// emitted by src/styles/tokens.scss. Raw colours or pixel sizes in a CSS
// module mean a value bypassed the design system, so the build fails.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
// tokens.scss is the bridge itself; global.scss and the mixins hold the
// breakpoint scale, which is layout grammar rather than a design token.
const EXEMPT = new Set([
  "styles/tokens.scss",
  "styles/global.scss",
  "styles/_mixins.scss",
]);
// Zero, hairlines, accent rules and the pill radius are not tokens either.
const ALLOWED_PX = new Set(["0px", "1px", "2px", "3px", "4px", "100px"]);

const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (entry.endsWith(".scss")) {
      check(full);
    }
  }
}

function check(file) {
  const rel = relative(ROOT, file);
  if (EXEMPT.has(rel)) return;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/#[0-9a-fA-F]{3,8}\b/.test(code) && !/url\(/.test(code)) {
      problems.push(`${rel}:${index + 1}: raw colour: ${line.trim()}`);
    }
    for (const match of code.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?px)\b/g)) {
      if (
        !ALLOWED_PX.has(match[1]) &&
        !/@media|@container|min-width|max-width|width >=|width <|@include (up|down)/.test(
          code,
        )
      ) {
        problems.push(`${rel}:${index + 1}: raw px size: ${line.trim()}`);
      }
    }
  });
}

walk(ROOT);
if (problems.length) {
  console.error("Design token check failed:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("Design token check passed.");

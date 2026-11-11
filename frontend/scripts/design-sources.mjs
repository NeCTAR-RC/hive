#!/usr/bin/env node
// The "Sources by selector" appendix of DESIGN-NOTES.md: one row per rule
// block in the CSS modules and global.scss that names its own design source
// in a `///` docblock, with the docblock's first sentence. A rule without a
// docblock of its own inherits its parent's and has no row, unless the
// parent is an at-rule (a breakpoint, a reduced-motion block): then the row
// carries the at-rule's docblock.
//
//   node scripts/design-sources.mjs           print the table
//   node scripts/design-sources.mjs --write   replace the appendix
//   node scripts/design-sources.mjs --check   fail when the appendix is stale
//
// `pnpm lint` runs `--check`, so the appendix cannot drift from the code.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import {
  documentedStyleFiles,
  firstSentence,
  resolvedSelector,
  scssBlocks,
} from "./scss-blocks.mjs";

const ROOT = new URL("../src", import.meta.url).pathname;
const NOTES = new URL("../DESIGN-NOTES.md", import.meta.url).pathname;
const START = "<!-- design-sources:start -->";
const END = "<!-- design-sources:end -->";
// Prettier would pad every cell to its column's widest, tripling the
// table's size; the generator owns its layout instead.
const IGNORE_START = "<!-- prettier-ignore-start -->";
const IGNORE_END = "<!-- prettier-ignore-end -->";

/**
 * The block whose docblock a rule's row shows: its own, else the nearest
 * enclosing at-rule's when no rule between them carries one. Null when the
 * rule inherits from a parent rule, which has a row of its own.
 */
function sourceBlock(rule) {
  if (rule.docblock) return rule;
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.kind === "rule") return null;
    if (parent.docblock) return parent;
  }
  return null;
}

/** The at-rules a rule sits in, outermost first (`@include up($bp-md)`). */
function atRuleContext(rule) {
  const context = [];
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.kind === "at") context.unshift(parent.prelude);
  }
  return context;
}

/** A table cell: pipes escaped, so a selector cannot split the row. */
function cell(text) {
  return text.replaceAll("|", "\\|");
}

/** The appendix table, between prettier's range-ignore markers. */
function table() {
  const rows = [];
  for (const file of documentedStyleFiles(ROOT)) {
    const rel = relative(ROOT, file);
    for (const block of scssBlocks(readFileSync(file, "utf8"))) {
      if (block.kind !== "rule") continue;
      const source = sourceBlock(block);
      if (!source) continue;
      const context = atRuleContext(block);
      const selector =
        `\`${resolvedSelector(block)}\`` +
        (context.length
          ? ` in ${context.map((at) => `\`${at}\``).join(", ")}`
          : "");
      rows.push(
        `| \`${rel}\` | ${cell(selector)} | ${cell(firstSentence(source.docblock))} |`,
      );
    }
  }
  return [
    IGNORE_START,
    "| File | Selector | Source |",
    "| --- | --- | --- |",
    ...rows,
    IGNORE_END,
  ].join("\n");
}

/** DESIGN-NOTES.md split around the appendix markers. */
function splitNotes(notes) {
  const start = notes.indexOf(START);
  const end = notes.indexOf(END);
  if (start === -1 || end < start) {
    throw new Error(
      `DESIGN-NOTES.md needs the markers ${START} and ${END} around the appendix.`,
    );
  }
  return {
    before: notes.slice(0, start + START.length),
    current: notes.slice(start + START.length, end).trim(),
    after: notes.slice(end),
  };
}

const mode = process.argv[2];
const generated = table();
if (mode === "--check" || mode === "--write") {
  const notes = readFileSync(NOTES, "utf8");
  const { before, current, after } = splitNotes(notes);
  if (mode === "--write") {
    writeFileSync(NOTES, `${before}\n\n${generated}\n\n${after}`);
    const rows = generated.split("\n").length - 4;
    console.log(`Sources by selector: ${rows} rows written.`);
  } else if (current !== generated) {
    console.error(
      'DESIGN-NOTES.md: the appendix "Sources by selector" is stale. ' +
        "Run `pnpm design:sources --write` and commit the result.",
    );
    process.exit(1);
  } else {
    console.log("Sources by selector: up to date.");
  }
} else if (mode === undefined) {
  console.log(generated);
} else {
  console.error(`Unknown option ${mode}; use --check or --write.`);
  process.exit(2);
}

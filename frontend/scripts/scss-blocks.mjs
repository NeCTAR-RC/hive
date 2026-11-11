// Reads the block structure of a Sass file and the `///` docblock in front
// of each block. Shared by check-tokens.mjs (every rule block names its
// design source) and design-sources.mjs (the "Sources by selector" table in
// DESIGN-NOTES.md), so the check and the table read the files the same way.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {object} Block
 * @property {"rule" | "at" | "keyframe"} kind  A selector rule, an at-rule
 *   (`@media`, `@include ... { }`, `@mixin`), or a step inside `@keyframes`.
 * @property {string} prelude  The text before `{`, comments removed and
 *   whitespace collapsed.
 * @property {number} line  1-based line of the prelude's first character.
 * @property {string[] | null} docblock  The `///` lines directly above the
 *   prelude, without their slashes, or null when there are none.
 * @property {Block | null} parent  The enclosing block.
 */

/**
 * Every block in `source`, in document order. Strings, comments and `#{}`
 * interpolations are skipped, so braces inside them open nothing.
 *
 * @param {string} source
 * @returns {Block[]}
 */
export function scssBlocks(source) {
  const lines = source.split("\n");
  const blocks = [];
  const stack = [];
  let prelude = "";
  let preludeStart = -1;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (char === "{") {
      const parent = stack.at(-1) ?? null;
      const text = prelude
        .replace(/\s+/g, " ")
        .replace(/\( /g, "(")
        .replace(/ \)/g, ")")
        .trim();
      const line = lineAt(source, preludeStart === -1 ? i : preludeStart);
      const block = {
        kind: blockKind(text, parent),
        prelude: text,
        line,
        docblock: docblockAbove(lines, line),
        parent,
      };
      blocks.push(block);
      stack.push(block);
      prelude = "";
      preludeStart = -1;
      continue;
    }
    if (char === "}" || char === ";") {
      if (char === "}") stack.pop();
      prelude = "";
      preludeStart = -1;
      continue;
    }
    let end = i;
    if (char === '"' || char === "'") {
      end = closingQuote(source, i);
    } else if (char === "#" && next === "{") {
      end = closingInterpolation(source, i + 1);
    }
    if (preludeStart === -1 && !/\s/.test(char)) preludeStart = i;
    prelude += source.slice(i, end + 1);
    i = end;
  }
  return blocks;
}

/**
 * The selector a nested rule resolves to, as Sass resolves it: `&` takes
 * the parent selector, and a child without `&` is a descendant. Selector
 * lists multiply out. At-rules in between are transparent.
 *
 * @param {Block} block  A block of kind "rule".
 * @returns {string}
 */
export function resolvedSelector(block) {
  let selectors = splitList(block.prelude);
  for (let parent = block.parent; parent; parent = parent.parent) {
    if (parent.kind !== "rule") continue;
    const outer = splitList(parent.prelude);
    selectors = outer.flatMap((out) =>
      selectors.map((inner) =>
        inner.includes("&") ? inner.replaceAll("&", out) : `${out} ${inner}`,
      ),
    );
  }
  return selectors.join(", ");
}

/**
 * The first sentence of a docblock: its lines joined, up to the first full
 * stop, question or exclamation mark followed by a space or the end.
 *
 * @param {string[]} docblock
 * @returns {string}
 */
export function firstSentence(docblock) {
  const text = docblock.join(" ").replace(/\s+/g, " ").trim();
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : text;
}

/**
 * True when the block, or a block enclosing it, carries a docblock: a nested
 * rule inherits the source its parent names.
 *
 * @param {Block} block
 * @returns {boolean}
 */
export function isDocumented(block) {
  for (
    let /** @type {Block | null} */ current = block;
    current;
    current = current.parent
  ) {
    if (current.docblock) return true;
  }
  return false;
}

/**
 * The style files whose rule blocks must name their source: every CSS
 * module under `root`, and the global stylesheet. Sorted, so reports and
 * the generated table are stable.
 *
 * @param {string} root  The `src` directory.
 * @returns {string[]} Absolute paths.
 */
export function documentedStyleFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".module.scss")) files.push(full);
    }
  };
  walk(root);
  files.push(join(root, "styles/global.scss"));
  return files.sort();
}

function blockKind(prelude, parent) {
  if (parent && /^@(-\w+-)?keyframes\b/.test(parent.prelude)) {
    return "keyframe";
  }
  return prelude.startsWith("@") ? "at" : "rule";
}

/** The `///` lines directly above `line` (1-based), or null. */
function docblockAbove(lines, line) {
  const doc = [];
  for (let index = line - 2; index >= 0; index--) {
    const text = lines[index].trim();
    if (!text.startsWith("///")) break;
    doc.unshift(text.replace(/^\/\/\/ ?/, ""));
  }
  return doc.length ? doc : null;
}

/** Top-level comma-separated parts of a selector list. */
function splitList(selector) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of selector) {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function closingQuote(source, start) {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === quote) return i;
  }
  return source.length - 1;
}

function closingInterpolation(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return i;
  }
  return source.length - 1;
}

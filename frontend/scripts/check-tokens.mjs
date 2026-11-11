#!/usr/bin/env node
// Hive styles consume design tokens through the --hive-* custom properties
// emitted by src/styles/tokens.scss, and use @ardc-ui/react components as
// shipped. This check fails the build when a value or an override bypasses
// the design system; DESIGN-NOTES.md ("Guard rails") explains each rule and
// how to add a bridge token when a value is genuinely new.
//
// In .scss modules: raw colours (hex, colour functions such as rgb() and
// oklch(), and named colours in colour properties), px sizes outside the
// allowed set, rem/em literals, letter-spacing, font-size, font-weight and
// line-height literals, text-transform: uppercase, and [class*= selectors.
// In .tsx files: inline styles holding a literal size or colour (a named
// one included), and a className passed to a component imported from
// @ardc-ui/react (its icons excepted).
//
// Three rules hold the design-source record (Hakkim, 2026-10-14):
// - tokens.scss: a custom property holds no raw px, rem or em literal; a
//   size is a library token, `ardc-fn.pxToRem(N)` with a comment naming
//   where N comes from, a grid span, or a calc() of those.
// - Anywhere in src: the retired names --hive-font-mono and
//   --hive-rule-accent (the design system has no code face and no accent
//   rule).
// - CSS modules and global.scss: every rule block carries a `///` docblock
//   naming its source, directly or through an enclosing block.
//
// `--self-test` runs those three, and the colour rule, against fixtures
// only; a normal run does the same first, so a broken check cannot pass the
// tree silently.
import { deepStrictEqual } from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  documentedStyleFiles,
  isDocumented,
  scssBlocks,
} from "./scss-blocks.mjs";

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
// Breakpoints and container queries may name a width directly.
const LAYOUT_CONTEXT =
  /@media|@container|min-width|max-width|width >=|width <|@include (up|down)/;
const CSS_WIDE_KEYWORDS = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);
// Typography properties whose value must come from a token.
const TYPE_PROPERTIES =
  /\b(letter-spacing|font-size|font-weight|line-height)\s*:\s*([^;{}]+)/;
// React style keys that are lengths: a bare number there is a px literal.
const LENGTH_KEYS =
  /\b(width|height|minWidth|maxWidth|minHeight|maxHeight|top|right|bottom|left|inset|margin\w*|padding\w*|gap|rowGap|columnGap|fontSize|lineHeight|letterSpacing|borderRadius|borderWidth|flexBasis)\s*:\s*-?(\d*\.?\d+)\b/g;
// The library's icons are plain SVG elements (SVGProps plus a size); a
// className there positions or turns the glyph, which is the consumer's
// job, so they are exempt from the className rule. Read from the installed
// package so the list follows the library.
const LIBRARY_ICONS = new Set(
  [
    ...readFileSync(
      new URL(
        "../node_modules/@ardc-ui/react/dist/index.d.ts",
        import.meta.url,
      ),
      "utf8",
    ).matchAll(/export \{ (\w+) \} from '\.\/components\/icons\//g),
  ].map(([, name]) => name),
);
// A hex colour or a colour function, the modern ones included.
const RAW_COLOUR =
  /#[0-9a-fA-F]{3,8}\b|(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;
// CSS named colours (CSS Color 4), without the keywords that are not a
// colour choice (transparent, currentColor and the CSS-wide keywords).
const NAMED_COLOURS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black " +
    "blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse " +
    "chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
    "darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta " +
    "darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
    "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite " +
    "forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green " +
    "greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender " +
    "lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink " +
    "lightsalmon lightseagreen lightskyblue lightslategray lightslategrey " +
    "lightsteelblue lightyellow lime limegreen linen magenta maroon " +
    "mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred " +
    "midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive " +
    "olivedrab orange orangered orchid palegoldenrod palegreen " +
    "paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown " +
    "salmon sandybrown seagreen seashell sienna silver skyblue slateblue " +
    "slategray slategrey snow springgreen steelblue tan teal thistle tomato " +
    "turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);
// Only properties that take a colour are read for named colours, so a grid
// area or an animation called `navy` is not a finding.
const COLOUR_PROPERTY =
  /^\s*(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|accent-color|caret-color|text-decoration(-color)?|column-rule(-color)?)\s*:(.*)$/;
const RAW_LENGTH = /(?<![\w.$-])(\d*\.?\d+)(px|r?em)\b/g;
// Bridge tokens retired with the design-source sweep: the design system has
// no code face and no accent rule.
const RETIRED_NAMES = /--hive-(font-mono|rule-accent)(?![\w-])/g;
const BRIDGE = "styles/tokens.scss";

const problems = [];

function report(rel, line, rule, text) {
  problems.push(`${rel}:${line}: ${rule}: ${text.trim()}`);
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    const rel = relative(ROOT, full);
    const source = readFileSync(full, "utf8");
    collect(rel, retiredNames(source));
    if (rel === BRIDGE) collect(rel, bridgeLiterals(source));
    if (entry.endsWith(".scss")) {
      checkScss(full);
    } else if (entry.endsWith(".tsx")) {
      checkTsx(full);
    }
  }
}

/** Reports the findings a pure check returned for one file. */
function collect(rel, findings) {
  for (const { line, rule, text } of findings) report(rel, line, rule, text);
}

/**
 * Custom properties in the token bridge whose value holds a raw px, rem or
 * em literal outside a `#{}` interpolation. Interpolated library tokens and
 * `ardc-fn.pxToRem(N)` calls, var() references, calc() of those and
 * unitless numbers pass.
 */
function bridgeLiterals(source) {
  const findings = [];
  // Comments go, their newlines stay, so offsets keep their line numbers.
  const code = source.replace(/\/\/.*$/gm, "");
  for (const match of code.matchAll(/^\s*(--[^:\s]+)\s*:([^;]*);/gm)) {
    let value = match[2];
    while (/#\{[^{}]*\}/.test(value)) {
      value = value.replace(/#\{[^{}]*\}/g, "");
    }
    const literal = [...value.matchAll(RAW_LENGTH)].some(
      ([, number]) => Number(number) !== 0,
    );
    if (literal) {
      const line = lineAt(code, match.index + match[0].indexOf(match[1]));
      findings.push({
        line,
        rule: "raw length in a bridge token",
        text: source.split("\n")[line - 1],
      });
    }
  }
  return findings;
}

/** Every use of a retired bridge token name. */
function retiredNames(source) {
  return [...source.matchAll(RETIRED_NAMES)].map((match) => {
    const line = lineAt(source, match.index);
    return {
      line,
      rule: `retired token ${match[0]}`,
      text: source.split("\n")[line - 1],
    };
  });
}

/**
 * Rule blocks with no `///` docblock naming their design source, on the
 * block itself or on a block enclosing it.
 */
function undocumentedRules(source) {
  return scssBlocks(source)
    .filter((block) => block.kind === "rule" && !isDocumented(block))
    .map((block) => ({
      line: block.line,
      rule: "rule block without a /// docblock naming its source",
      text: block.prelude,
    }));
}

/**
 * True when a declaration value carries no literal of its own: only var()
 * references, a Sass variable, or a CSS-wide keyword such as inherit.
 */
function isTokenValue(value) {
  let rest = value.replace(/!important/, "").trim();
  // Strip var() calls, innermost first, so fallbacks nest correctly.
  while (/var\([^()]*\)/.test(rest)) {
    rest = rest.replace(/var\([^()]*\)/g, "");
  }
  rest = rest.trim();
  return rest === "" || CSS_WIDE_KEYWORDS.has(rest) || /^\$[\w-]+$/.test(rest);
}

/** The first CSS named colour among the words of a value, or null. */
function namedColourIn(value) {
  for (const word of value.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (NAMED_COLOURS.has(word)) return word;
  }
  return null;
}

/**
 * The raw colour on one line of SCSS (comments removed), as the rule it
 * breaks, or null: a hex or colour function anywhere outside url(), or a
 * named colour in the value of a property that takes a colour. Tokens,
 * Sass variables and interpolations are not read for names.
 */
function scssColour(code) {
  if (RAW_COLOUR.test(code) && !/url\(/.test(code)) return "raw colour";
  const declaration = COLOUR_PROPERTY.exec(code);
  if (!declaration || code.includes("{")) return null;
  const value = (declaration.at(-1) ?? "")
    .replace(/var\([^)]*\)/g, "")
    .replace(/#\{[^}]*\}/g, "")
    .replace(/[\w-]*\$[\w-]+/g, "");
  const named = namedColourIn(value);
  return named ? `named colour "${named}"` : null;
}

function checkScss(file) {
  const rel = relative(ROOT, file);
  if (EXEMPT.has(rel)) return;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const at = index + 1;
    const code = line.replace(/\/\/.*$/, "");
    const colour = scssColour(code);
    if (colour) report(rel, at, colour, line);
    const layout = LAYOUT_CONTEXT.test(code);
    for (const [, number, unit] of code.matchAll(RAW_LENGTH)) {
      if (unit === "px") {
        if (!ALLOWED_PX.has(`${number}px`) && !layout) {
          report(rel, at, "raw px size", line);
        }
      } else if (Number(number) !== 0 && !layout) {
        report(rel, at, `raw ${unit} size`, line);
      }
    }
    const typography = code.match(TYPE_PROPERTIES);
    if (typography && !isTokenValue(typography[2])) {
      report(rel, at, `${typography[1]} literal`, line);
    }
    if (/text-transform\s*:\s*uppercase/.test(code)) {
      report(rel, at, "uppercase text", line);
    }
    if (/\[class\*=/.test(code)) {
      report(rel, at, "[class*= selector", line);
    }
  });
}

/** 1-based line number of a character offset. */
function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

/**
 * Offset just past the bracket that closes the one at `start`, skipping
 * string and template literals. Returns -1 when unbalanced.
 */
function closingBrace(source, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Offset of a `className=` attribute on the JSX opening tag starting at
 * `start` (the `<`), or -1. Attribute expressions are skipped whole, so a
 * className on nested JSX inside a prop does not count.
 */
function classNameOffset(source, start) {
  let quote = null;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "{") {
      const end = closingBrace(source, i);
      if (end === -1) return -1;
      i = end - 1;
    } else if (char === ">") {
      return -1;
    } else if (
      /\s/.test(source[i - 1]) &&
      /^className\s*=/.test(source.slice(i, i + 20))
    ) {
      return i;
    }
  }
  return -1;
}

/** Local names bound by value imports from @ardc-ui/react. */
function libraryImports(source) {
  const names = [];
  const imports = source.matchAll(
    /import\s+(?!type\b)\{([^}]*)\}\s*from\s*["']@ardc-ui\/react["']/g,
  );
  for (const [, specifiers] of imports) {
    for (const raw of specifiers.split(",")) {
      const specifier = raw.trim();
      if (!specifier || specifier.startsWith("type ")) continue;
      const parts = specifier.split(/\s+as\s+/);
      names.push(parts[parts.length - 1].trim());
    }
  }
  return names;
}

function checkTsx(file) {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(/style=\{\{/g)) {
    const open = match.index + "style={".length;
    const end = closingBrace(source, open);
    const body = source.slice(open, end === -1 ? undefined : end);
    const literals = [...body.matchAll(/(["'`])(?:\\.|(?!\1).)*\1/g)];
    const literal = literals.find(
      ([text]) =>
        RAW_COLOUR.test(text) ||
        NAMED_COLOURS.has(text.slice(1, -1).trim().toLowerCase()) ||
        [...text.matchAll(RAW_LENGTH)].some(
          ([, number]) => Number(number) !== 0,
        ),
    );
    const length = [...body.matchAll(LENGTH_KEYS)].find(
      ([, , number]) => Number(number) !== 0,
    );
    if (literal || length) {
      const offset = open + ((literal ?? length)?.index ?? 0);
      report(
        rel,
        lineAt(source, offset),
        "inline style literal",
        source.split("\n")[lineAt(source, offset) - 1],
      );
    }
  }

  for (const name of libraryImports(source)) {
    if (LIBRARY_ICONS.has(name)) continue;
    const tags = source.matchAll(new RegExp(`<${name}(?=[\\s/>])`, "g"));
    for (const tag of tags) {
      const offset = classNameOffset(source, tag.index);
      if (offset !== -1) {
        const at = lineAt(source, offset);
        report(
          rel,
          at,
          `className on library ${name}`,
          source.split("\n")[at - 1],
        );
      }
    }
  }
}

/**
 * The three design-source checks against fixtures: each fixture lists the
 * lines that must be reported, and no others. Throws on a mismatch.
 */
function selfTest() {
  const lines = (findings) => findings.map((finding) => finding.line);

  const bridge = [
    ":root {",
    "  --a: 4px;",
    "  --b: #{ardc-fn.pxToRem(4)};",
    "  --c: calc(2 * var(--x));",
    "  --d: 50;",
    "  --e: calc(#{ardc.$spacing-2} + 1rem);",
    "  // --f: 3px; a comment",
    "  --g: var(--x, 0.5px);",
    "  --h: #{ardc.$a} solid",
    "    #{ardc.$b};",
    "  --i: 0px;",
    "  --j-#{$name}: #{list.nth($style, 1)} / #{$x};",
    "  --k: 1.5em;",
    "}",
  ].join("\n");
  deepStrictEqual(lines(bridgeLiterals(bridge)), [2, 6, 8, 13]);

  const names = [
    ".a { font-family: var(--hive-font-mono); }",
    ".b { border-width: var(--hive-rule-accent-wide); }",
    "// --hive-rule-accent is gone",
    "const style = { width: 'var(--hive-font-monospace)' };",
  ].join("\n");
  deepStrictEqual(lines(retiredNames(names)), [1, 3]);

  const docblocks = [
    "/// Documented, and so are its nested rules.",
    ".a {",
    "  .nested { color: red; }",
    "",
    '  &[data-hovered] { content: "{"; }',
    "}",
    "",
    ".b { margin: 0; }",
    "",
    "/// A documented at-rule covers the rules inside it.",
    "@include up($bp-md) {",
    "  .c { margin: 0; }",
    "}",
    "",
    "@media (width >= 1px) {",
    "  .d { margin: 0; }",
    "}",
    "",
    "@keyframes spin {",
    "  from { rotate: 0deg; }",
    "  to { rotate: 360deg; }",
    "}",
    "",
    "/// A selector list over",
    "/// several lines.",
    ".e,",
    ".f-#{$n} { margin: 0; }",
    "",
    "// A plain comment is not a docblock.",
    ".g { margin: 0; }",
    "",
    "/// A blank line breaks the link.",
    "",
    ".h { margin: 0; }",
  ].join("\n");
  deepStrictEqual(lines(undocumentedRules(docblocks)), [8, 16, 30, 34]);

  const colours = [
    "  color: #fff;",
    "  background: rgb(0 0 0 / 50%);",
    "  border-color: oklch(70% 0.1 200);",
    "  color: navy;",
    "  outline: 2px solid Red;",
    "  grid-area: navy;",
    "  animation: red 1s;",
    "  color: var(--hive-color-white);",
    "  background: ardc.$white;",
    "  border: 1px solid #{$white};",
    "  background: url(#fff) no-repeat;",
    "  fill: currentColor;",
    "  color: transparent;",
    "  @include label(x);",
  ];
  deepStrictEqual(
    colours.flatMap((code, index) => (scssColour(code) ? [index + 1] : [])),
    [1, 2, 3, 4, 5],
  );
}

try {
  selfTest();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Design token check self-test failed:\n" + message);
  process.exit(1);
}
if (process.argv.includes("--self-test")) {
  console.log("Design token check self-test passed.");
  process.exit(0);
}

walk(ROOT);
for (const file of documentedStyleFiles(ROOT)) {
  collect(relative(ROOT, file), undocumentedRules(readFileSync(file, "utf8")));
}
if (problems.length) {
  console.error("Design token check failed:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("Design token check passed.");

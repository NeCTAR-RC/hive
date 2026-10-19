#!/usr/bin/env node
// Hive styles consume design tokens through the --hive-* custom properties
// emitted by src/styles/tokens.scss. A raw colour or pixel size in a CSS
// module, or a colour or size literal in an inline `style={{...}}`, means a
// value bypassed the design system, so the check fails. `rem`/`em` lengths
// are counted and reported (layout widths are legitimately rem today) but do
// not fail.
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

// CSS named colours (CSS Color 4), excluding the keywords that are not a
// colour choice: transparent, currentColor, inherit and friends.
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
// Only properties that take a colour are checked for named colours, so a
// grid area or animation called `navy` is not a false positive.
const COLOUR_PROPERTY =
  /^\s*(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|accent-color|caret-color|text-decoration(-color)?|column-rule(-color)?)\s*:(.*)$/;
const COLOUR_FUNCTION = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const REM = /(?<![\w.-])\d*\.?\d+r?em\b/g;

const problems = [];
const remCounts = new Map();

function walk(dir, visit) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, visit);
    } else {
      visit(full, entry);
    }
  }
}

function namedColourIn(value) {
  for (const word of value.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (NAMED_COLOURS.has(word)) return word;
  }
  return null;
}

function checkScss(file) {
  const rel = relative(ROOT, file);
  if (EXEMPT.has(rel)) return;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const where = `${rel}:${index + 1}`;
    const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    if (HEX.test(code) && !/url\(/.test(code)) {
      problems.push(`${where}: raw colour: ${line.trim()}`);
    }
    if (COLOUR_FUNCTION.test(code)) {
      problems.push(`${where}: raw colour function: ${line.trim()}`);
    }
    const declaration = COLOUR_PROPERTY.exec(code);
    if (declaration && !code.includes("{")) {
      const value = (declaration.at(-1) ?? "").replace(/var\([^)]*\)/g, "");
      const named = namedColourIn(value);
      if (named) {
        problems.push(`${where}: named colour "${named}": ${line.trim()}`);
      }
    }
    for (const match of code.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?px)\b/g)) {
      if (
        !ALLOWED_PX.has(match[1]) &&
        !/@media|@container|min-width|max-width|width >=|width <|@include (up|down)/.test(
          code,
        )
      ) {
        problems.push(`${where}: raw px size: ${line.trim()}`);
      }
    }
    const rems = code.match(REM);
    if (rems) remCounts.set(rel, (remCounts.get(rel) ?? 0) + rems.length);
  });
}

// `style={{ ... }}` blocks in TSX, which may span lines; nested braces in
// template literals are rare enough that a balanced scan is sufficient.
function inlineStyles(source) {
  const blocks = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf("style={{", from);
    if (start === -1) return blocks;
    let depth = 0;
    let end = start + "style=".length;
    for (; end < source.length; end += 1) {
      if (source[end] === "{") depth += 1;
      if (source[end] === "}") depth -= 1;
      if (depth === 0) break;
    }
    blocks.push({ start, text: source.slice(start, end + 1) });
    from = end + 1;
  }
}

function checkTsx(file) {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, "utf8");
  for (const { start, text } of inlineStyles(source)) {
    const line = source.slice(0, start).split("\n").length;
    const where = `${rel}:${line}`;
    const strings = text.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? [];
    for (const literal of strings) {
      const value = literal.slice(1, -1).replace(/var\([^)]*\)/g, "");
      if (HEX.test(value) || COLOUR_FUNCTION.test(value)) {
        problems.push(`${where}: colour literal in inline style: ${literal}`);
      } else if (/(?<![\w.$-])\d+(\.\d+)?(px|r?em)\b/.test(value)) {
        problems.push(`${where}: size literal in inline style: ${literal}`);
      } else if (/^[a-z]+$/i.test(value) && NAMED_COLOURS.has(value)) {
        problems.push(`${where}: named colour in inline style: ${literal}`);
      }
    }
    // React reads a bare number on a length property as pixels.
    for (const match of text.matchAll(
      /\b(width|height|min[A-Z]\w*|max[A-Z]\w*|margin\w*|padding\w*|top|left|right|bottom|gap|fontSize|lineHeight|borderRadius)\s*:\s*(\d+(\.\d+)?)\b/g,
    )) {
      if (match[2] !== "0") {
        problems.push(`${where}: pixel number in inline style: ${match[0]}`);
      }
    }
  }
}

walk(ROOT, (full, entry) => {
  if (entry.endsWith(".scss")) checkScss(full);
  else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
    checkTsx(full);
  }
});

const remTotal = [...remCounts.values()].reduce((sum, n) => sum + n, 0);
if (remTotal) {
  console.log(
    `rem/em lengths (reported, not failed): ${remTotal} in ${remCounts.size} files`,
  );
}
if (problems.length) {
  console.error("Design token check failed:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("Design token check passed.");

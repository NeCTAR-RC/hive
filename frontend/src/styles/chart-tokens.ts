/**
 * Design tokens for Recharts, which takes text sizes as numbers of pixels
 * rather than CSS. The values are read from the token bridge's custom
 * properties (tokens.scss) at first use, so the charts follow the library
 * type scale without a literal of their own.
 */
export interface ChartTokens {
  /**
   * Axis, legend and guide label size in pixels: the library's 12px body
   * text. Undefined where the stylesheet is not loaded (unit tests), in which
   * case the labels inherit the page's text size.
   */
  fontSize: number | undefined;
}

let cached: ChartTokens | null = null;

/**
 * Reads a length custom property from the root element as pixels. The
 * bridge emits lengths in rem (the library's `pxToRem`) or px; anything
 * else, or a missing property, reads as undefined.
 */
function readPx(name: string): number | undefined {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const raw = style.getPropertyValue(name).trim();
  const amount = Number.parseFloat(raw);
  if (!Number.isFinite(amount)) return undefined;
  if (raw.endsWith("rem")) {
    return amount * Number.parseFloat(style.fontSize);
  }
  if (raw.endsWith("px")) return amount;
  return undefined;
}

/**
 * The chart tokens, read once the stylesheet has supplied them and cached
 * from then on.
 */
export function chartTokens(): ChartTokens {
  if (cached) return cached;
  const tokens: ChartTokens = { fontSize: readPx("--hive-font-size-xs") };
  if (tokens.fontSize !== undefined) cached = tokens;
  return tokens;
}

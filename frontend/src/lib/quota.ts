/**
 * A "used of limit" figure, as the quota meters show it. `max` is null when
 * the quota is unlimited: upstream services send a negative limit for that,
 * or leave it out.
 */
export interface QuotaPair {
  used: number;
  max: number | null;
}

/** An upstream limits record, such as Nova's or Cinder's absolute limits. */
export type Limits = Readonly<Record<string, number | null | undefined>>;

/**
 * The figures stored under two keys of a limits record (`maxTotalCores`
 * and `totalCoresUsed`, say). A missing used figure counts as none, and a
 * missing, null or negative limit as unlimited.
 */
export function quotaPair(
  limits: Limits | null | undefined,
  maxKey: string,
  usedKey: string,
): QuotaPair {
  const max = limits?.[maxKey];
  return {
    used: limits?.[usedKey] ?? 0,
    max: max === null || max === undefined || max < 0 ? null : max,
  };
}

/** Whether the quota has room for one more. */
export function hasRoom({ used, max }: QuotaPair): boolean {
  return max === null || used < max;
}

/** What the quota has left (never below none), or null when unlimited. */
export function quotaLeft({ used, max }: QuotaPair): number | null {
  return max === null ? null : Math.max(0, max - used);
}

// The associate floating IP dialog's one choice, written as "fip:<id>" for a
// free floating IP or "pool:<id>" for a pool to allocate a new one from: the
// choice made for the user, and the request a choice becomes.

/**
 * The choice preselected once the lists load: the first free floating IP,
 * else the sole pool, else nothing.
 */
export function preselectedFipChoice(
  free: { id: string }[],
  pools: { id: string }[],
): string {
  return free[0]
    ? `fip:${free[0].id}`
    : pools.length === 1
      ? `pool:${pools[0]?.id}`
      : "";
}

/** The association a choice asks for: a floating IP, or a pool. */
export function fipChoiceTarget(
  choice: string,
): { floatingIpId: string } | { poolId: string } {
  const [kind, id] = choice.split(":", 2);
  return kind === "fip" ? { floatingIpId: id ?? "" } : { poolId: id ?? "" };
}

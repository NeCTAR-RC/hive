// How the pool page writes its health monitor's values.
import type { HealthMonitor } from "../../../lib/api/types/loadbalancers";

/**
 * The retries before marking a member up and down, as "3 / 2"; empty when
 * either count is missing, so `KeyValueList` shows its dash.
 */
export function monitorRetries(
  monitor: Pick<HealthMonitor, "max_retries" | "max_retries_down">,
): string {
  const { max_retries: up, max_retries_down: down } = monitor;
  if (up === null || down === null) return "";
  return `${up} / ${down}`;
}

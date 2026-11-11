// The notice that follows the backend's chain of queued changes on a load
// balancer (a create, or a replaced member list): its progress, or the step
// where it stopped.
import { Alert } from "@ardc-ui/react";
import type { LoadBalancerTree } from "../../../lib/api/types/loadbalancers";
import { chainStepLabel } from "../status";

/**
 * Says which step the chain is on while it runs, or where it stopped and
 * what to redo by hand; nothing once it has finished.
 */
export function ChainNotice({ chain }: { chain: LoadBalancerTree["chain"] }) {
  if (!chain) return null;
  const remaining = chain.steps.length - chain.done.length;
  if (chain.error) {
    // The backend names the step that failed ("pool", "member"), when known.
    const where = chain.failed_step
      ? ` while ${chainStepLabel(chain.failed_step)}`
      : "";
    return (
      <Alert tone="danger" role="status">
        The queued changes to the load balancer stopped{where} after{" "}
        {chain.done.length} of {chain.steps.length} steps: {chain.error}. Add or
        remove the missing listener, pool, members or monitor by hand.
      </Alert>
    );
  }
  if (remaining > 0) {
    return (
      <Alert tone="info" role="status">
        The load balancer is {chainStepLabel(chain.steps[chain.done.length])} (
        {chain.done.length} of {chain.steps.length} steps done). This page
        updates on its own.
      </Alert>
    );
  }
  return null;
}

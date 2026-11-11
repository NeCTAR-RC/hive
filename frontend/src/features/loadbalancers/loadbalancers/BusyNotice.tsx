// The notice on a load balancer's pages while Octavia applies a change.
import { Alert } from "@ardc-ui/react";
import type { LoadBalancer } from "../../../lib/api/types/loadbalancers";
import { isPending, pendingPhrase } from "../status";

/**
 * Says why adding a listener, pool or member waits: Octavia refuses every
 * change while the load balancer is PENDING_*. Nothing once it is settled,
 * or while the create chain's own notice already says what is happening.
 */
export function BusyNotice({
  lb,
  chainRunning,
}: {
  lb: Pick<LoadBalancer, "provisioning_status">;
  chainRunning: boolean;
}) {
  if (chainRunning || !isPending(lb.provisioning_status)) return null;
  return (
    <Alert tone="info" role="status">
      The load balancer is {pendingPhrase(lb.provisioning_status)}. Listeners,
      pools and members can be added once it is active; this page updates on its
      own.
    </Alert>
  );
}

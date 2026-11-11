// Every load balancer action behind one hook, for the list and the detail
// page: `run(action, lbs)` opens the form dialog an action needs, or runs
// it on the batch after one confirmation. The hook returns the dialogs to
// render and the props for the table that lists the load balancers.
import { useState, type ReactNode } from "react";
import { DELETE, type Verb } from "../../../components/BulkAction/messages";
import {
  useBulkAction,
  type BulkTableProps,
} from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { LoadBalancer } from "../../../lib/api/types/loadbalancers";
import {
  deleteLoadBalancer,
  disassociateLbFloatingIp,
  loadBalancerWriteKeys,
} from "../api";
import { AssociateFipDialog } from "./dialogs/AssociateFipDialog";
import { EditLoadBalancerDialog } from "./dialogs/EditLoadBalancerDialog";
import {
  availableLoadBalancerActions,
  type LoadBalancerActionId,
} from "../status";

/** The actions that open a form dialog for one load balancer. */
type DialogActionId = "edit" | "associate-fip";

/** The actions that run on a batch after a confirmation. */
type BatchActionId = Exclude<LoadBalancerActionId, DialogActionId>;

type Dialog = { kind: DialogActionId; lb: LoadBalancer } | null;

const DISASSOCIATE: Verb = {
  label: "Disassociate",
  done: "Disassociated the floating IP of",
  failed: "disassociate the floating IP of",
};

/** Whether the load balancer's menu allows `id` now. */
const allowed = (id: LoadBalancerActionId) => (lb: LoadBalancer) =>
  allows(availableLoadBalancerActions(lb), id);

const getId = (lb: LoadBalancer) => lb.id;
const getName = (lb: LoadBalancer) => lb.name || lb.id;

function isDialogAction(id: LoadBalancerActionId): id is DialogActionId {
  return id === "edit" || id === "associate-fip";
}

/**
 * The load balancer actions. `onDeleted` runs after a delete in which at
 * least one load balancer went: the detail page passes it to leave for
 * the list.
 */
export function useLoadBalancerActions(onDeleted?: () => void): {
  run: (action: LoadBalancerActionId, lbs: LoadBalancer[]) => void;
  dialogs: ReactNode;
  tableProps: BulkTableProps;
} {
  const [dialog, setDialog] = useState<Dialog>(null);
  const bulk = useBulkAction<LoadBalancer, BatchActionId>({
    noun: { one: "load balancer", many: "load balancers" },
    name: getName,
    getId,
    invalidates: loadBalancerWriteKeys,
    actions: {
      "disassociate-fip": {
        verb: DISASSOCIATE,
        request: (lb) => disassociateLbFloatingIp(lb.id),
        title: (lbs) => {
          const [only] = lbs;
          return lbs.length === 1 && only
            ? `Disassociate ${only.floating_ip?.address ?? "the floating IP"}?`
            : `Disassociate the floating IPs of ${lbs.length} load balancers?`;
        },
        body: (
          <p>
            The address stays allocated to the project but no longer reaches the
            load balancer.
          </p>
        ),
        eligible: allowed("disassociate-fip"),
        skippedWhy: "they have no floating IP",
      },
      delete: {
        verb: DELETE,
        request: (lb) => deleteLoadBalancer(lb.id),
        body: (
          <p>
            Its listeners, pools, members, health monitors and policies are
            deleted with it. This cannot be undone.
          </p>
        ),
        eligible: allowed("delete"),
        skippedWhy:
          "only load balancers that are active or in error can be deleted",
        onSucceeded: onDeleted,
      },
    },
  });

  const run = (action: LoadBalancerActionId, lbs: LoadBalancer[]) => {
    const [first] = lbs;
    if (!first) return;
    if (isDialogAction(action)) setDialog({ kind: action, lb: first });
    else bulk.run(action, lbs);
  };

  const close = () => setDialog(null);
  let formDialog: ReactNode = null;
  if (dialog?.kind === "edit") {
    formDialog = <EditLoadBalancerDialog lb={dialog.lb} onClose={close} />;
  } else if (dialog?.kind === "associate-fip") {
    formDialog = <AssociateFipDialog lb={dialog.lb} onClose={close} />;
  }

  return {
    run,
    dialogs: (
      <>
        {formDialog}
        {bulk.dialog}
      </>
    ),
    tableProps: bulk.tableProps,
  };
}

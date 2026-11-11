// Every router action behind one hook: `run(action, routers)` deletes or
// clears the gateway of the batch after asking, or opens the form dialog
// the action needs. The hook returns the dialogs to render and the props
// for the table that lists the routers.
import { useState, type ReactNode } from "react";
import { DELETE, type Verb } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { Router } from "../../../lib/api/types/network";
import { clearGateway, deleteRouter, routerWriteKeys } from "../api";
import { availableRouterActions, type RouterActionId } from "../status";
import { EditRouterDialog } from "./dialogs/EditRouterDialog";
import { SetGatewayDialog } from "./dialogs/SetGatewayDialog";

/** Worded so the toast reads "Cleared the gateway of router web." */
const CLEAR_GATEWAY: Verb = {
  label: "Clear gateway",
  done: "Cleared the gateway of",
  failed: "clear the gateway of",
};

/** The actions that open a form for one router. */
type DialogActionId = Exclude<RouterActionId, "delete" | "clear-gateway">;

/**
 * Every router action. `onDeleted` runs after a delete that removed at
 * least one router (a detail page leaves for the list).
 */
export function useRouterActions(onDeleted?: () => void) {
  const [dialog, setDialog] = useState<{
    kind: DialogActionId;
    router: Router;
  } | null>(null);
  const bulk = useBulkAction<Router, "delete" | "clear-gateway">({
    noun: { one: "router", many: "routers" },
    name: (router) => router.name,
    getId: (router) => router.id,
    invalidates: routerWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (router) => deleteRouter(router.id),
        body: (
          <p>
            The router's interfaces are detached first. Subnets behind it lose
            their route to the outside and any floating IPs on them stop
            working.
          </p>
        ),
        onSucceeded: () => onDeleted?.(),
      },
      "clear-gateway": {
        verb: CLEAR_GATEWAY,
        request: (router) => clearGateway(router.id),
        eligible: (router) =>
          allows(availableRouterActions(router), "clear-gateway"),
        skippedWhy: "they have no gateway",
        title: (routers) =>
          routers.length === 1
            ? `Clear the gateway of ${routers[0]?.name}?`
            : `Clear the gateway of ${routers.length} routers?`,
        body: (
          <p>
            You can set a gateway again later, but the router's external address
            may change. A gateway still used by floating IPs cannot be cleared.
          </p>
        ),
      },
    },
  });

  const run = (action: RouterActionId, routers: Router[]) => {
    const [first] = routers;
    if (action === "delete" || action === "clear-gateway") {
      bulk.run(action, routers);
    } else if (first) {
      setDialog({ kind: action, router: first });
    }
  };

  const close = () => setDialog(null);
  let formDialog: ReactNode = null;
  if (dialog?.kind === "edit") {
    formDialog = <EditRouterDialog router={dialog.router} onClose={close} />;
  } else if (dialog?.kind === "set-gateway") {
    formDialog = <SetGatewayDialog router={dialog.router} onClose={close} />;
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

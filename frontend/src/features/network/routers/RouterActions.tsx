// Router row actions behind one hook, as useVolumeActions.
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import type { Router } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useClearGateway, useDeleteRouters } from "../api";
import type { RouterActionId } from "../status";
import { EditRouterDialog, SetGatewayDialog } from "./RouterDialogs";

type Dialog =
  | { kind: "delete"; routers: Router[] }
  | { kind: "clear-gateway" | "edit" | "set-gateway"; router: Router }
  | null;

export function useRouterActions(
  projectId: string,
  onDeleted?: () => void,
): {
  run: (router: Router, action: RouterActionId) => void;
  runDelete: (routers: Router[]) => void;
  dialogs: ReactNode;
} {
  const remove = useDeleteRouters(projectId);
  const clearGateway = useClearGateway(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const run = (router: Router, action: RouterActionId) => {
    if (action === "delete") setDialog({ kind: "delete", routers: [router] });
    else setDialog({ kind: action, router });
  };

  let dialogs: ReactNode = null;
  if (dialog?.kind === "delete") {
    const { routers } = dialog;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={
          routers.length === 1
            ? `Delete router ${routers[0]?.name}?`
            : `Delete ${routers.length} routers?`
        }
        confirmLabel="Delete"
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(
            routers.map((r) => r.id),
            {
              onSuccess: () => {
                notify.success(
                  routers.length === 1
                    ? `Deleted router ${routers[0]?.name}.`
                    : `Deleted ${routers.length} routers.`,
                );
                close();
                onDeleted?.();
              },
            },
          )
        }
      >
        <p>
          The router's interfaces are detached first. Subnets behind it lose
          their route to the outside and any floating IPs on them stop working.
        </p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "clear-gateway") {
    const { router } = dialog;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={`Clear the gateway of ${router.name}?`}
        confirmLabel="Clear gateway"
        tone="danger"
        isPending={clearGateway.isPending}
        error={clearGateway.error}
        onConfirm={() =>
          clearGateway.mutate(router.id, {
            onSuccess: () => {
              notify.success(`Cleared the gateway of router ${router.name}.`);
              close();
            },
          })
        }
      >
        <p>
          You can set a gateway again later, but the router's external address
          may change. A gateway still used by floating IPs cannot be cleared.
        </p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "edit") {
    dialogs = (
      <EditRouterDialog
        projectId={projectId}
        router={dialog.router}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "set-gateway") {
    dialogs = (
      <SetGatewayDialog
        projectId={projectId}
        router={dialog.router}
        onClose={close}
      />
    );
  }

  return {
    run,
    runDelete: (routers) => setDialog({ kind: "delete", routers }),
    dialogs,
  };
}

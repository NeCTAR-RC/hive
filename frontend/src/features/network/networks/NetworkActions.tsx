// Network, subnet and port row actions behind one hook each, as
// useVolumeActions: `run(item, action)` opens the dialog or confirmation,
// and the hook returns the dialogs to render.
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import type { Network, Port, SubnetDetail } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useDeleteNetworks, useDeletePorts, useDeleteSubnets } from "../api";
import type { NetworkActionId, PortActionId, SubnetActionId } from "../status";
import { EditNetworkDialog, PortDialog, SubnetDialog } from "./NetworkDialogs";

type NetworkDialog =
  | { kind: "delete"; networks: Network[] }
  | { kind: "edit" | "create-subnet"; network: Network }
  | null;

export function useNetworkActions(
  projectId: string,
  onDeleted?: () => void,
): {
  run: (network: Network, action: NetworkActionId) => void;
  runDelete: (networks: Network[]) => void;
  dialogs: ReactNode;
} {
  const remove = useDeleteNetworks(projectId);
  const [dialog, setDialog] = useState<NetworkDialog>(null);
  const close = () => setDialog(null);

  const run = (network: Network, action: NetworkActionId) => {
    if (action === "delete") setDialog({ kind: "delete", networks: [network] });
    else setDialog({ kind: action, network });
  };

  let dialogs: ReactNode = null;
  if (dialog?.kind === "delete") {
    const { networks } = dialog;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={
          networks.length === 1
            ? `Delete network ${networks[0]?.name}?`
            : `Delete ${networks.length} networks?`
        }
        confirmLabel="Delete"
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(
            networks.map((n) => n.id),
            {
              onSuccess: () => {
                notify.success(
                  networks.length === 1
                    ? `Deleted network ${networks[0]?.name}.`
                    : `Deleted ${networks.length} networks.`,
                );
                close();
                onDeleted?.();
              },
            },
          )
        }
      >
        <p>
          The{" "}
          {networks.length === 1
            ? "network and its subnets are"
            : "networks and their subnets are"}{" "}
          removed. A network still holding ports (an instance interface or a
          router interface) cannot be deleted.
        </p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "edit") {
    dialogs = (
      <EditNetworkDialog
        projectId={projectId}
        network={dialog.network}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "create-subnet") {
    dialogs = (
      <SubnetDialog
        projectId={projectId}
        network={dialog.network}
        onClose={close}
      />
    );
  }

  return {
    run,
    runDelete: (networks) => setDialog({ kind: "delete", networks }),
    dialogs,
  };
}

type SubnetDialogState =
  | { kind: "delete"; subnets: SubnetDetail[] }
  | { kind: "edit"; subnet: SubnetDetail }
  | null;

export function useSubnetActions(
  projectId: string,
  network: Pick<Network, "id" | "name"> | undefined,
  onDeleted?: () => void,
): {
  run: (subnet: SubnetDetail, action: SubnetActionId) => void;
  runDelete: (subnets: SubnetDetail[]) => void;
  dialogs: ReactNode;
} {
  const remove = useDeleteSubnets(projectId);
  const [dialog, setDialog] = useState<SubnetDialogState>(null);
  const close = () => setDialog(null);

  let dialogs: ReactNode = null;
  if (dialog?.kind === "delete") {
    const { subnets } = dialog;
    const label = (s: SubnetDetail) => s.name || s.cidr || s.id;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={
          subnets.length === 1
            ? `Delete subnet ${label(subnets[0]!)}?`
            : `Delete ${subnets.length} subnets?`
        }
        confirmLabel="Delete"
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(
            subnets.map((s) => s.id),
            {
              onSuccess: () => {
                notify.success(
                  subnets.length === 1
                    ? `Deleted subnet ${label(subnets[0]!)}.`
                    : `Deleted ${subnets.length} subnets.`,
                );
                close();
                onDeleted?.();
              },
            },
          )
        }
      >
        <p>
          A subnet with addresses still allocated to ports cannot be deleted.
        </p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "edit" && network) {
    dialogs = (
      <SubnetDialog
        projectId={projectId}
        network={network}
        subnet={dialog.subnet}
        onClose={close}
      />
    );
  }

  return {
    run: (subnet, action) =>
      setDialog(
        action === "delete"
          ? { kind: "delete", subnets: [subnet] }
          : { kind: "edit", subnet },
      ),
    runDelete: (subnets) => setDialog({ kind: "delete", subnets }),
    dialogs,
  };
}

type PortDialogState =
  { kind: "delete"; ports: Port[] } | { kind: "edit"; port: Port } | null;

export function usePortActions(
  projectId: string,
  network: Pick<Network, "id" | "name" | "subnets"> | undefined,
  onDeleted?: () => void,
): {
  run: (port: Port, action: PortActionId) => void;
  runDelete: (ports: Port[]) => void;
  dialogs: ReactNode;
} {
  const remove = useDeletePorts(projectId);
  const [dialog, setDialog] = useState<PortDialogState>(null);
  const close = () => setDialog(null);

  let dialogs: ReactNode = null;
  if (dialog?.kind === "delete") {
    const { ports } = dialog;
    const label = (p: Port) => p.name || p.id;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={
          ports.length === 1
            ? `Delete port ${label(ports[0]!)}?`
            : `Delete ${ports.length} ports?`
        }
        confirmLabel="Delete"
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(
            ports.map((p) => p.id),
            {
              onSuccess: () => {
                notify.success(
                  ports.length === 1
                    ? `Deleted port ${label(ports[0]!)}.`
                    : `Deleted ${ports.length} ports.`,
                );
                close();
                onDeleted?.();
              },
            },
          )
        }
      >
        <p>Any floating IP on the port is disassociated.</p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "edit" && network) {
    dialogs = (
      <PortDialog
        projectId={projectId}
        network={network}
        port={dialog.port}
        onClose={close}
      />
    );
  }

  return {
    run: (port, action) =>
      setDialog(
        action === "delete"
          ? { kind: "delete", ports: [port] }
          : { kind: "edit", port },
      ),
    runDelete: (ports) => setDialog({ kind: "delete", ports }),
    dialogs,
  };
}

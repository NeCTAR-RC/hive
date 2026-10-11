// Floating IP row actions behind one hook, as useVolumeActions.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import type { FloatingIp } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useDisassociateFloatingIp, useReleaseFloatingIps } from "../api";
import type { FloatingIpActionId } from "../status";
import { AssociateFloatingIpDialog } from "./FloatingIpDialogs";

type Dialog =
  | { kind: "release"; fips: FloatingIp[] }
  | { kind: "disassociate" | "associate"; fip: FloatingIp }
  | null;

export function useFloatingIpActions(projectId: string): {
  run: (fip: FloatingIp, action: FloatingIpActionId) => void;
  runRelease: (fips: FloatingIp[]) => void;
  dialogs: ReactNode;
} {
  const navigate = useNavigate();
  const release = useReleaseFloatingIps(projectId);
  const disassociate = useDisassociateFloatingIp(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const run = (fip: FloatingIp, action: FloatingIpActionId) => {
    switch (action) {
      case "port-forwardings":
        void navigate({
          to: "/network/port-forwardings",
          search: { floating_ip: fip.id },
        });
        return;
      case "release":
        setDialog({ kind: "release", fips: [fip] });
        return;
      default:
        setDialog({ kind: action, fip });
    }
  };

  let dialogs: ReactNode = null;
  if (dialog?.kind === "release") {
    const { fips } = dialog;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={
          fips.length === 1
            ? `Release floating IP ${fips[0]?.floating_ip_address}?`
            : `Release ${fips.length} floating IPs?`
        }
        confirmLabel="Release"
        tone="danger"
        isPending={release.isPending}
        error={release.error}
        onConfirm={() =>
          release.mutate(
            fips.map((f) => f.id),
            {
              onSuccess: () => {
                notify.success(
                  fips.length === 1
                    ? `Released floating IP ${fips[0]?.floating_ip_address}.`
                    : `Released ${fips.length} floating IPs.`,
                );
                close();
              },
            },
          )
        }
      >
        <p>
          Once a floating IP is released there is no guarantee the same address
          can be allocated again.
        </p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "disassociate") {
    const { fip } = dialog;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={`Disassociate ${fip.floating_ip_address}?`}
        confirmLabel="Disassociate"
        tone="danger"
        isPending={disassociate.isPending}
        error={disassociate.error}
        onConfirm={() =>
          disassociate.mutate(fip.id, {
            onSuccess: () => {
              notify.success(
                `Disassociated floating IP ${fip.floating_ip_address}.`,
              );
              close();
            },
          })
        }
      >
        <p>
          The address stays allocated to the project
          {fip.instance_name
            ? ` but no longer reaches ${fip.instance_name}`
            : ""}
          .
        </p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "associate") {
    dialogs = (
      <AssociateFloatingIpDialog
        projectId={projectId}
        floatingIp={dialog.fip}
        onClose={close}
      />
    );
  }

  return {
    run,
    runRelease: (fips) => setDialog({ kind: "release", fips }),
    dialogs,
  };
}

// Trunk row actions behind one hook, as useVolumeActions.
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import type { Trunk } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useDeleteTrunks } from "../api";
import type { TrunkActionId } from "../status";
import { EditTrunkDialog } from "./TrunkDialogs";

type Dialog =
  { kind: "delete"; trunks: Trunk[] } | { kind: "edit"; trunk: Trunk } | null;

export function useTrunkActions(
  projectId: string,
  onDeleted?: () => void,
): {
  run: (trunk: Trunk, action: TrunkActionId) => void;
  runDelete: (trunks: Trunk[]) => void;
  dialogs: ReactNode;
} {
  const remove = useDeleteTrunks(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const label = (t: Trunk) => t.name || t.id;

  let dialogs: ReactNode = null;
  if (dialog?.kind === "delete") {
    const { trunks } = dialog;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={
          trunks.length === 1
            ? `Delete trunk ${label(trunks[0]!)}?`
            : `Delete ${trunks.length} trunks?`
        }
        confirmLabel="Delete"
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(
            trunks.map((t) => t.id),
            {
              onSuccess: () => {
                notify.success(
                  trunks.length === 1
                    ? `Deleted trunk ${label(trunks[0]!)}.`
                    : `Deleted ${trunks.length} trunks.`,
                );
                close();
                onDeleted?.();
              },
            },
          )
        }
      >
        <p>The parent and subports stay; only the trunk between them goes.</p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "edit") {
    dialogs = (
      <EditTrunkDialog
        projectId={projectId}
        trunk={dialog.trunk}
        onClose={close}
      />
    );
  }

  return {
    run: (trunk, action) =>
      setDialog(
        action === "delete"
          ? { kind: "delete", trunks: [trunk] }
          : { kind: "edit", trunk },
      ),
    runDelete: (trunks) => setDialog({ kind: "delete", trunks }),
    dialogs,
  };
}

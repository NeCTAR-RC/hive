// Every instance action behind one hook: `run(instances, action)` either
// fires the action, opens a confirmation, or opens the dialog that collects
// what the action needs. The hook returns the dialogs to render.
import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import { apiFetch } from "../../../lib/api/client";
import type { Instance } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useBatchInstanceAction, useDeleteInstances } from "../api";
import { AssociateFloatingIpDialog } from "../../network/floatingips/FloatingIpDialogs";
import {
  AttachInterfaceDialog,
  DetachInterfaceDialog,
  DisassociateFloatingIpDialog,
  EditDialog,
  MetadataDialog,
  RebuildDialog,
  ResizeDialog,
  SecurityGroupsDialog,
  SnapshotDialog,
} from "./InstanceDialogs";
import type { InstanceActionId } from "./status";
import styles from "./InstanceActions.module.scss";

type Dialog =
  | {
      kind: "confirm";
      action: InstanceActionId;
      instances: Instance[];
      skipped: Instance[];
    }
  | { kind: "edit"; instance: Instance }
  | { kind: "resize"; instance: Instance }
  | { kind: "rebuild"; instance: Instance }
  | { kind: "snapshot"; instance: Instance }
  | { kind: "metadata"; instance: Instance }
  | { kind: "security-groups"; instance: Instance }
  | { kind: "attach-interface"; instance: Instance }
  | { kind: "detach-interface"; instance: Instance }
  | { kind: "associate-fip"; instance: Instance }
  | { kind: "disassociate-fip"; instance: Instance }
  | null;

/** Actions that need a yes before they run. */
const CONFIRMED = new Set<InstanceActionId>([
  "delete",
  "stop",
  "soft-reboot",
  "hard-reboot",
  "pause",
  "suspend",
  "shelve",
  "rescue",
  "unrescue",
  "confirm-resize",
  "revert-resize",
]);

/** The backend action name and body for a menu action. */
function actionRequest(action: InstanceActionId): {
  name: string;
  body?: Record<string, unknown>;
} {
  switch (action) {
    case "soft-reboot":
      return { name: "reboot", body: { type: "SOFT" } };
    case "hard-reboot":
      return { name: "reboot", body: { type: "HARD" } };
    default:
      return { name: action };
  }
}

const VERBS: Record<string, { title: string; done: string }> = {
  delete: { title: "Delete", done: "deleted" },
  stop: { title: "Shut off", done: "shutting off" },
  "soft-reboot": { title: "Soft reboot", done: "rebooting" },
  "hard-reboot": { title: "Hard reboot", done: "rebooting" },
  pause: { title: "Pause", done: "pausing" },
  suspend: { title: "Suspend", done: "suspending" },
  shelve: { title: "Shelve", done: "shelving" },
  rescue: { title: "Rescue", done: "entering rescue mode" },
  unrescue: { title: "Unrescue", done: "leaving rescue mode" },
  "confirm-resize": { title: "Confirm resize of", done: "resize confirmed" },
  "revert-resize": { title: "Revert resize of", done: "resize reverted" },
  start: { title: "Start", done: "starting" },
  unpause: { title: "Resume", done: "resuming" },
  resume: { title: "Resume", done: "resuming" },
  unshelve: { title: "Unshelve", done: "unshelving" },
  lock: { title: "Lock", done: "locked" },
  unlock: { title: "Unlock", done: "unlocked" },
};

function describe(instances: Instance[]): string {
  if (instances.length === 1) return instances[0]!.name;
  return `${instances.length} instances`;
}

/** "Skipped a, b: Start does not apply to them in their current state." */
function skippedNote(skipped: Instance[], title: string): string {
  const names = skipped.map((i) => i.name || i.id).join(", ");
  return `Skipped ${names}: ${title} does not apply to ${
    skipped.length === 1 ? "it" : "them"
  } in the current state.`;
}

export function useInstanceActions(projectId: string) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const action = useBatchInstanceAction(projectId);
  const remove = useDeleteInstances(projectId);
  const openConsole = useMutation({
    mutationFn: (instanceId: string) =>
      apiFetch<{ url: string | null; type: string | null }>(
        `/api/compute/instances/${instanceId}/console`,
        { method: "POST", json: { type: "novnc" } },
      ),
  });

  const fire = async (instances: Instance[], id: InstanceActionId) => {
    const verb = VERBS[id] ?? { title: id, done: "done" };
    if (id === "delete") {
      try {
        await remove.mutateAsync(instances.map((i) => i.id));
        notify.success(`${describe(instances)} ${verb.done}.`);
      } catch (error) {
        notify.danger(
          `Could not delete ${describe(instances)}: ${(error as Error).message}`,
        );
      }
      return;
    }
    const { name, body } = actionRequest(id);
    const results = await action.mutateAsync({
      instanceIds: instances.map((i) => i.id),
      action: name,
      body: body ?? {},
    });
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length === 0) {
      notify.success(`${describe(instances)} ${verb.done}.`);
    } else {
      const reason = (failed[0] as PromiseRejectedResult).reason as Error;
      notify.danger(
        `${verb.title} failed for ${failed.length} of ${instances.length}: ${reason.message}`,
      );
    }
  };

  /**
   * Run an action. `skipped` names selected rows the caller left out because
   * the action does not apply to them (see batchTargets); they are reported
   * so a batch never silently does less than the selection suggests.
   */
  const run = (
    instances: Instance[],
    id: InstanceActionId,
    skipped: Instance[] = [],
  ) => {
    const title = (VERBS[id] ?? { title: id }).title;
    if (instances.length === 0) {
      if (skipped.length > 0) notify.warning(skippedNote(skipped, title));
      return;
    }
    const first = instances[0]!;
    switch (id) {
      case "console":
        openConsole.mutate(first.id, {
          onSuccess: (data) => {
            if (data.url) {
              window.open(data.url, "_blank", "noopener");
            } else {
              notify.warning("The console is not available for this instance.");
            }
          },
          onError: (error) =>
            notify.danger(`Could not open the console: ${error.message}`),
        });
        return;
      case "log":
        void navigate({
          to: "/compute/instances/$instanceId",
          params: { instanceId: first.id },
          search: { tab: "log" },
        });
        return;
      case "edit":
      case "resize":
      case "rebuild":
      case "snapshot":
      case "metadata":
      case "security-groups":
      case "attach-interface":
      case "detach-interface":
      case "associate-fip":
      case "disassociate-fip":
        setDialog({ kind: id, instance: first });
        return;
      default:
        if (CONFIRMED.has(id)) {
          setDialog({ kind: "confirm", action: id, instances, skipped });
        } else {
          if (skipped.length > 0) notify.warning(skippedNote(skipped, title));
          void fire(instances, id);
        }
    }
  };

  const close = () => setDialog(null);

  let dialogs: ReactNode = null;
  if (dialog?.kind === "confirm") {
    const verb = VERBS[dialog.action] ?? { title: dialog.action, done: "" };
    const isDelete = dialog.action === "delete";
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={`${verb.title} ${describe(dialog.instances)}?`}
        confirmLabel={verb.title}
        tone={isDelete ? "danger" : "primary"}
        isPending={action.isPending || remove.isPending}
        onConfirm={() => {
          void fire(dialog.instances, dialog.action).then(close);
        }}
      >
        {isDelete && (
          <p>
            Deleting an instance destroys it and everything on its ephemeral
            disks. This cannot be undone.
          </p>
        )}
        {dialog.instances.length > 1 && (
          <ul className={styles.names}>
            {dialog.instances.map((instance) => (
              <li key={instance.id}>{instance.name}</li>
            ))}
          </ul>
        )}
        {dialog.skipped.length > 0 && (
          <p>{skippedNote(dialog.skipped, verb.title)}</p>
        )}
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "edit") {
    dialogs = (
      <EditDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "resize") {
    dialogs = (
      <ResizeDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "rebuild") {
    dialogs = (
      <RebuildDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "snapshot") {
    dialogs = (
      <SnapshotDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "metadata") {
    dialogs = (
      <MetadataDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "security-groups") {
    dialogs = (
      <SecurityGroupsDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "attach-interface") {
    dialogs = (
      <AttachInterfaceDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "detach-interface") {
    dialogs = (
      <DetachInterfaceDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "associate-fip") {
    dialogs = (
      <AssociateFloatingIpDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "disassociate-fip") {
    dialogs = (
      <DisassociateFloatingIpDialog
        projectId={projectId}
        instance={dialog.instance}
        onClose={close}
      />
    );
  }

  return { run, dialogs };
}

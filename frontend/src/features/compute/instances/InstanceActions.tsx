// Every instance action behind one hook: `run(action, instances)` either
// runs the action on the batch, asks first, or opens the dialog that
// collects what the action needs. The hook returns the dialogs to render.
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { DELETE, type Verb } from "../../../components/BulkAction/messages";
import {
  useBulkAction,
  type BulkActionSpec,
} from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import { apiFetch } from "../../../lib/api/client";
import type { Instance, RemoteConsole } from "../../../lib/api/types/compute";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { notify } from "../../../lib/notify";
import {
  deleteInstance,
  instanceWriteKeys,
  requestInstanceAction,
} from "../api";
import { floatingIpTargetsQuery } from "../../network/api";
import { AssociateFloatingIpDialog } from "../../network/floatingips/dialogs/AssociateFloatingIpDialog";
import {
  actionRequest,
  type BatchActionId,
  type DialogActionId,
} from "./actionRequest";
import { AttachInterfaceDialog } from "./dialogs/AttachInterfaceDialog";
import { AttachVolumeDialog } from "./dialogs/AttachVolumeDialog";
import { DetachInterfaceDialog } from "./dialogs/DetachInterfaceDialog";
import { DetachVolumeDialog } from "./dialogs/DetachVolumeDialog";
import { DisassociateFloatingIpDialog } from "./dialogs/DisassociateFloatingIpDialog";
import { EditDialog } from "./dialogs/EditDialog";
import { MetadataDialog } from "./dialogs/MetadataDialog";
import { RebuildDialog } from "./dialogs/RebuildDialog";
import { RescueDialog } from "./dialogs/RescueDialog";
import { ResizeDialog } from "./dialogs/ResizeDialog";
import { SecurityGroupsDialog } from "./dialogs/SecurityGroupsDialog";
import { SnapshotDialog } from "./dialogs/SnapshotDialog";
import {
  availableActions,
  type InstanceActionContext,
  type InstanceActionId,
} from "./status";
import styles from "./InstanceActions.module.scss";

type Dialog = { kind: DialogActionId; instance: Instance } | null;

/** How a batch action is worded, and whether it asks first. */
interface BatchWording {
  verb: Verb;
  /** Runs at once, as Horizon's start, resume, unshelve and lock do. */
  immediate?: boolean;
  /** What the action does to the instance, in the confirmation. */
  effect?: string;
}

const WORDING: Record<BatchActionId, BatchWording> = {
  delete: { verb: DELETE },
  stop: {
    verb: { label: "Shut off", done: "Shutting off", failed: "shut off" },
  },
  "soft-reboot": {
    verb: { label: "Soft reboot", done: "Rebooting", failed: "reboot" },
  },
  "hard-reboot": {
    verb: { label: "Hard reboot", done: "Rebooting", failed: "reboot" },
    effect:
      "A hard reboot cuts the power and starts the instance again. Anything not yet written to disk is lost; try a soft reboot first.",
  },
  pause: { verb: { label: "Pause", done: "Pausing", failed: "pause" } },
  suspend: {
    verb: { label: "Suspend", done: "Suspending", failed: "suspend" },
  },
  shelve: {
    verb: { label: "Shelve", done: "Shelving", failed: "shelve" },
    effect:
      "Shelving shuts the instance down and frees its host, keeping its disk. It stops using service units until you unshelve it.",
  },
  unrescue: {
    verb: { label: "Unrescue", done: "Unrescuing", failed: "unrescue" },
  },
  "confirm-resize": {
    verb: {
      label: "Confirm resize of",
      done: "Confirmed the resize of",
      failed: "confirm the resize of",
    },
  },
  "revert-resize": {
    verb: {
      label: "Revert resize of",
      done: "Reverting the resize of",
      failed: "revert the resize of",
    },
  },
  start: {
    verb: { label: "Start", done: "Starting", failed: "start" },
    immediate: true,
  },
  unpause: {
    verb: { label: "Unpause", done: "Unpausing", failed: "unpause" },
    immediate: true,
  },
  resume: {
    verb: { label: "Resume", done: "Resuming", failed: "resume" },
    immediate: true,
  },
  unshelve: {
    verb: { label: "Unshelve", done: "Unshelving", failed: "unshelve" },
    immediate: true,
  },
  lock: {
    verb: { label: "Lock", done: "Locked", failed: "lock" },
    immediate: true,
  },
  unlock: {
    verb: { label: "Unlock", done: "Unlocked", failed: "unlock" },
    immediate: true,
  },
};

/** "web-1" or "3 instances", as the confirmation's title names them. */
function describe(instances: Instance[]): string {
  const [only] = instances;
  if (instances.length === 1 && only) return only.name;
  return `${instances.length} instances`;
}

/** The batch spec of one action: its request, wording and eligibility. */
function batchSpec(id: BatchActionId): BulkActionSpec<Instance> {
  const { verb, immediate, effect } = WORDING[id];
  const isDelete = id === "delete";
  return {
    verb,
    tone: isDelete ? "danger" : "primary",
    immediate,
    title: (instances) => `${verb.label} ${describe(instances)}?`,
    body: (instances) => (
      <>
        {isDelete && (
          <p>
            Deleting an instance destroys it and everything on its ephemeral
            disks. This cannot be undone.
          </p>
        )}
        {effect && <p>{effect}</p>}
        {instances.length > 1 && (
          <ul className={styles.names}>
            {instances.map((instance) => (
              <li key={instance.id}>{instance.name}</li>
            ))}
          </ul>
        )}
      </>
    ),
    eligible: (instance) => allows(availableActions(instance), id),
    request:
      id === "delete"
        ? (instance) => deleteInstance(instance.id)
        : (instance) => requestInstanceAction(actionRequest(id, instance.id)),
  };
}

const BATCH_SPECS = Object.fromEntries(
  (Object.keys(WORDING) as BatchActionId[]).map((id) => [id, batchSpec(id)]),
) as Record<BatchActionId, BulkActionSpec<Instance>>;

const DIALOG_ACTIONS = new Set<InstanceActionId>([
  "edit",
  "resize",
  "rebuild",
  "snapshot",
  "metadata",
  "security-groups",
  "attach-interface",
  "detach-interface",
  "associate-fip",
  "disassociate-fip",
  "attach-volume",
  "detach-volume",
  "rescue",
]);

function isDialogAction(id: InstanceActionId): id is DialogActionId {
  return DIALOG_ACTIONS.has(id);
}

const getId = (instance: Instance) => instance.id;
const getName = (instance: Instance) => instance.name;

/**
 * The instance actions for a list or a detail page: `offers(instance)` is
 * the instance's menu, with the project's floating IP targets loaded for
 * the rules that read them; `run(action, instances)` opens the console,
 * the log tab or the action's dialog, or runs a batch action through
 * `useBulkAction`; `dialogs` renders whichever is open, and `tableProps`
 * go on the table the batch runs from.
 */
export function useInstanceActions() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const targets = useQuery(floatingIpTargetsQuery(projectId));
  const context = useMemo<InstanceActionContext>(() => {
    if (!targets.data) return {};
    const ids = targets.data.items.flatMap((t) =>
      t.instance_id ? [t.instance_id] : [],
    );
    return { floatingTargets: new Set(ids) };
  }, [targets.data]);
  const offers = useCallback(
    (instance: Instance) => availableActions(instance, context),
    [context],
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const bulk = useBulkAction<Instance, BatchActionId>({
    noun: { one: "instance", many: "instances" },
    name: getName,
    getId,
    invalidates: instanceWriteKeys,
    actions: BATCH_SPECS,
  });
  const openConsole = useMutation({
    mutationFn: (instanceId: string) =>
      apiFetch<RemoteConsole>(`/api/compute/instances/${instanceId}/console`, {
        method: "POST",
        json: { type: "novnc" },
      }),
  });

  /**
   * Opens the console in a new tab. The tab opens in the press itself,
   * while the browser still counts the user's gesture (pop-up blockers
   * refuse a window opened after the request returns), and is pointed at
   * the console once its URL arrives.
   */
  const showConsole = (instance: Instance) => {
    const tab = window.open("", "_blank");
    if (!tab) {
      notify.warning(
        "Your browser blocked the console window. Allow pop-ups for this site and try again.",
      );
      return;
    }
    // The console page gets no handle back to Hive.
    tab.opener = null;
    openConsole.mutate(instance.id, {
      onSuccess: (data) => {
        if (data.url) {
          tab.location.href = data.url;
        } else {
          tab.close();
          notify.warning("The console is not available for this instance.");
        }
      },
      onError: (error) => {
        tab.close();
        notify.danger(`Could not open the console: ${error.message}`);
      },
    });
  };

  const run = (action: InstanceActionId, instances: Instance[]) => {
    const [first] = instances;
    if (!first) return;
    if (action === "console") {
      showConsole(first);
    } else if (action === "log") {
      void navigate({
        to: "/compute/instances/$instanceId",
        params: { instanceId: first.id },
        search: { tab: "log" },
      });
    } else if (isDialogAction(action)) {
      setDialog({ kind: action, instance: first });
    } else {
      bulk.run(action, instances);
    }
  };

  const close = () => setDialog(null);

  let formDialog: ReactNode = null;
  if (dialog?.kind === "edit") {
    formDialog = <EditDialog instance={dialog.instance} onClose={close} />;
  } else if (dialog?.kind === "resize") {
    formDialog = <ResizeDialog instance={dialog.instance} onClose={close} />;
  } else if (dialog?.kind === "rebuild") {
    formDialog = <RebuildDialog instance={dialog.instance} onClose={close} />;
  } else if (dialog?.kind === "snapshot") {
    formDialog = <SnapshotDialog instance={dialog.instance} onClose={close} />;
  } else if (dialog?.kind === "metadata") {
    formDialog = <MetadataDialog instance={dialog.instance} onClose={close} />;
  } else if (dialog?.kind === "security-groups") {
    formDialog = (
      <SecurityGroupsDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "attach-interface") {
    formDialog = (
      <AttachInterfaceDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "detach-interface") {
    formDialog = (
      <DetachInterfaceDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "associate-fip") {
    formDialog = (
      <AssociateFloatingIpDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "disassociate-fip") {
    formDialog = (
      <DisassociateFloatingIpDialog
        instance={dialog.instance}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "attach-volume") {
    formDialog = (
      <AttachVolumeDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "detach-volume") {
    formDialog = (
      <DetachVolumeDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "rescue") {
    formDialog = <RescueDialog instance={dialog.instance} onClose={close} />;
  }

  return {
    offers,
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

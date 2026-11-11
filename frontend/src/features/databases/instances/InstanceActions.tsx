// Every database instance action behind one hook, shared by the instances
// list and the instance page: `run(action, instances)` deletes the batch
// after asking, restarts it or detaches its configuration groups at once,
// opens the dialog that collects what an action needs, or goes to the page
// that runs it. The hook returns the dialogs to render.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { DbInstance } from "../../../lib/api/types/databases";
import {
  databaseWrites,
  deleteDbInstance,
  detachConfiguration,
  restartDbInstance,
} from "../api";
import { AttachConfigurationDialog } from "./dialogs/AttachConfigurationDialog";
import { ResizeInstanceDialog } from "./dialogs/ResizeInstanceDialog";
import { ResizeVolumeDialog } from "./dialogs/ResizeVolumeDialog";
import { UpdateInstanceDialog } from "./dialogs/UpdateInstanceDialog";
import { UpgradeInstanceDialog } from "./dialogs/UpgradeInstanceDialog";
import { availableDbInstanceActions, type DbInstanceActionId } from "../status";

/** The actions that open a dialog collecting what they need. */
type DialogActionId =
  "update" | "resize_volume" | "resize" | "upgrade" | "attach";

/** The actions that run on a batch of instances. */
type BatchActionId = "restart" | "detach" | "delete";

type Dialog = { kind: DialogActionId; instance: DbInstance } | null;

const BATCH_ACTIONS = new Set<DbInstanceActionId>([
  "restart",
  "detach",
  "delete",
]);

function isBatchAction(id: DbInstanceActionId): id is BatchActionId {
  return BATCH_ACTIONS.has(id);
}

/** Whether the instance's menu lets `id` run on it now. */
const allowed = (id: DbInstanceActionId) => (instance: DbInstance) =>
  allows(availableDbInstanceActions(instance), id);

const getId = (instance: DbInstance) => instance.id;
const getName = (instance: DbInstance) => instance.name || instance.id;

/**
 * The database instance actions. `onDeleted` runs once a delete has
 * removed at least one instance, so the instance page can go back to the
 * list.
 */
export function useInstanceActions(onDeleted?: () => void) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const bulk = useBulkAction<DbInstance, BatchActionId>({
    noun: { one: "database instance", many: "database instances" },
    name: getName,
    getId,
    invalidates: databaseWrites.everything,
    actions: {
      restart: {
        verb: { label: "Restart", done: "Restarting", failed: "restart" },
        tone: "primary",
        immediate: true,
        eligible: allowed("restart"),
        request: (instance) => restartDbInstance(instance.id),
      },
      detach: {
        verb: {
          label: "Detach the configuration group from",
          done: "Detached the configuration group from",
          failed: "detach the configuration group from",
        },
        tone: "primary",
        immediate: true,
        eligible: allowed("detach"),
        request: (instance) => detachConfiguration(instance.id),
      },
      delete: {
        verb: DELETE,
        body: (
          <p>The databases and their data are destroyed. Backups are kept.</p>
        ),
        request: (instance) => deleteDbInstance(instance.id),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: DbInstanceActionId, instances: DbInstance[]) => {
    if (isBatchAction(action)) {
      bulk.run(action, instances);
      return;
    }
    const [instance] = instances;
    if (!instance) return;
    if (action === "backup") {
      void navigate({
        to: "/databases/backups",
        search: { create: true, instance: instance.id },
      });
    } else if (action === "root") {
      void navigate({
        to: "/databases/instances/$instanceId",
        params: { instanceId: instance.id },
        search: { tab: "root" },
      });
    } else {
      setDialog({ kind: action, instance });
    }
  };

  const close = () => setDialog(null);

  let formDialog: ReactNode = null;
  if (dialog?.kind === "update") {
    formDialog = (
      <UpdateInstanceDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "resize_volume") {
    formDialog = (
      <ResizeVolumeDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "resize") {
    formDialog = (
      <ResizeInstanceDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "upgrade") {
    formDialog = (
      <UpgradeInstanceDialog instance={dialog.instance} onClose={close} />
    );
  } else if (dialog?.kind === "attach") {
    formDialog = (
      <AttachConfigurationDialog instance={dialog.instance} onClose={close} />
    );
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

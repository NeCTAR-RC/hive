// The instance detail page's attached volumes tab.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { DETACH } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import type {
  InstanceDetail,
  InstanceVolume,
} from "../../../../lib/api/types/compute";
import { formatGb } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { detachVolume, volumeAttachmentWriteKeys } from "../../../volumes/api";
import { instanceVolumesQuery } from "../../api";
import { AttachVolumeDialog } from "../dialogs/AttachVolumeDialog";

const VOLUME_COLUMNS: ColumnDef<InstanceVolume>[] = [
  { id: "name", label: "Name", isRowHeader: true, cell: (row) => row.name },
  {
    id: "device",
    label: "Device",
    cell: (row) => <code>{row.device ?? ""}</code>,
  },
  {
    id: "size",
    label: "Size",
    cell: (row) => formatGb(row.size_gb),
    hideBelow: "md",
  },
  { id: "status", label: "Status", cell: (row) => row.status ?? "" },
  {
    id: "bootable",
    label: "Bootable",
    cell: (row) => (row.bootable ? "Yes" : "No"),
    hideBelow: "lg",
  },
  {
    id: "type",
    label: "Type",
    cell: (row) => row.volume_type ?? "",
    hideBelow: "lg",
  },
];

/**
 * The volumes attached to the instance, with attach and detach. Both are
 * offered only while the instance is active or shut off, the states in
 * which Nova attaches and detaches.
 */
export function VolumesTab({ instance }: { instance: InstanceDetail }) {
  const projectId = useProjectId();
  const volumes = useQuery(instanceVolumesQuery(projectId, instance.id));
  const volumesTable = useQueryTable(volumes, {
    noun: "volumes",
    emptyTitle: "No volumes attached",
  });
  const [attaching, setAttaching] = useState(false);
  // Nova attaches and detaches only on active or shut off instances.
  const ready = ["ACTIVE", "SHUTOFF"].includes(instance.status);
  const detach = useBulkAction<InstanceVolume, "detach">({
    noun: { one: "volume", many: "volumes" },
    name: (volume) => volume.name,
    getId: (volume) => volume.id,
    invalidates: volumeAttachmentWriteKeys,
    actions: {
      detach: {
        verb: { ...DETACH, done: "Detaching" },
        request: (volume) =>
          detachVolume({ volumeId: volume.id, instanceId: instance.id }),
        title: ([volume]) =>
          `Detach ${volume?.name ?? "volume"} from ${instance.name}?`,
        body: (
          <p>
            The data stays on the volume, and another instance can attach it
            afterwards. Unmount the volume inside the instance first.
          </p>
        ),
      },
    },
  });
  return (
    <>
      <DataTable
        id="instance-volumes"
        label="Attached volumes"
        columns={VOLUME_COLUMNS}
        getRowId={(row) => row.id}
        {...volumesTable}
        {...detach.tableProps}
        toolbarActions={
          <Button
            variant="secondary"
            size="xs"
            onPress={() => setAttaching(true)}
            isDisabled={!ready}
          >
            Attach volume
          </Button>
        }
        rowActions={(row) => [
          {
            id: "detach",
            label: "Detach volume",
            tone: "danger",
            onAction: () => detach.run("detach", [row]),
            isDisabled: !ready,
            disabledReason: "The instance must be active or shut off",
          },
        ]}
        emptyBody={
          <p>
            Attach a volume for storage that outlives the instance, or manage
            volumes from the Volumes panel.
          </p>
        }
      />
      {attaching && (
        <AttachVolumeDialog
          instance={instance}
          onClose={() => setAttaching(false)}
        />
      )}
      {detach.dialog}
    </>
  );
}

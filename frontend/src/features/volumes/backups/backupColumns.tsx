// The columns of the volume backups list.
import { AppLink } from "../../../components/AppLink/AppLink";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { VolumeBackup } from "../../../lib/api/types/volumes";
import { formatDateTime, formatGb } from "../../../lib/format";
import { statusLabel, statusTone } from "../status";

/**
 * The backup list's columns: the name links to the backup, and the volume
 * and snapshot it was taken from link to theirs while they still exist.
 */
export const backupColumns: ColumnDef<VolumeBackup>[] = [
  {
    id: "name",
    label: "Name",
    isRowHeader: true,
    cell: (row) => (
      <AppLink
        size="sm"
        to="/storage/backups/$backupId"
        params={{ backupId: row.id }}
      >
        {row.name || row.id}
      </AppLink>
    ),
    sortValue: (row) => row.name || row.id,
    textValue: (row) => `${row.name} ${row.id}`,
  },
  {
    id: "description",
    label: "Description",
    cell: (row) => row.description ?? "",
    textValue: (row) => row.description ?? "",
    hideBelow: "lg",
  },
  {
    id: "size",
    label: "Size",
    cell: (row) => formatGb(row.size_gb),
    sortValue: (row) => row.size_gb ?? 0,
  },
  {
    id: "status",
    label: "Status",
    cell: (row) => (
      <StatusPill tone={statusTone(row.status)}>
        {statusLabel(row.status)}
      </StatusPill>
    ),
    sortValue: (row) => row.status,
  },
  {
    id: "availability_zone",
    label: "Availability zone",
    cell: (row) => row.availability_zone ?? "",
    sortValue: (row) => row.availability_zone ?? "",
    hideBelow: "lg",
  },
  {
    id: "volume",
    label: "Volume",
    cell: (row) =>
      row.volume_id ? (
        row.volume_name ? (
          <AppLink
            size="sm"
            to="/storage/volumes/$volumeId"
            params={{ volumeId: row.volume_id }}
          >
            {row.volume_name}
          </AppLink>
        ) : (
          `Deleted (${row.volume_id})`
        )
      ) : (
        ""
      ),
    sortValue: (row) => row.volume_name ?? row.volume_id ?? "",
    textValue: (row) => row.volume_name ?? row.volume_id ?? "",
    hideBelow: "md",
  },
  {
    id: "snapshot",
    label: "Snapshot",
    cell: (row) =>
      row.snapshot_id ? (
        row.snapshot_name ? (
          <AppLink
            size="sm"
            to="/storage/snapshots/$snapshotId"
            params={{ snapshotId: row.snapshot_id }}
          >
            {row.snapshot_name}
          </AppLink>
        ) : (
          "Deleted"
        )
      ) : (
        ""
      ),
    hideBelow: "lg",
  },
  {
    id: "created",
    label: "Created",
    cell: (row) => formatDateTime(row.created_at),
    sortValue: (row) => row.created_at ?? "",
    hideBelow: "md",
  },
];

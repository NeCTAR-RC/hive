// The columns of the snapshots table on a volume's detail page.
import { AppLink } from "../../../components/AppLink/AppLink";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { VolumeSnapshot } from "../../../lib/api/types/volumes";
import { formatDateTime, formatGb } from "../../../lib/format";
import { statusLabel, statusTone } from "../status";

/** The volume's own snapshots: each name links to the snapshot. */
export const volumeSnapshotColumns: ColumnDef<VolumeSnapshot>[] = [
  {
    id: "name",
    label: "Name",
    isRowHeader: true,
    cell: (row) => (
      <AppLink
        size="sm"
        to="/storage/snapshots/$snapshotId"
        params={{ snapshotId: row.id }}
      >
        {row.name || row.id}
      </AppLink>
    ),
    sortValue: (row) => row.name || row.id,
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
  },
  {
    id: "created",
    label: "Created",
    cell: (row) => formatDateTime(row.created_at),
    sortValue: (row) => row.created_at ?? "",
    hideBelow: "md",
  },
];

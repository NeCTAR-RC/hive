// The columns of the share snapshots list.
import { AppLink } from "../../../components/AppLink/AppLink";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { ShareSnapshot } from "../../../lib/api/types/shares";
import { statusLabel, statusTone } from "../status";

/**
 * The snapshot list's columns: the name links to the snapshot's detail
 * page, the source share to the share's.
 */
export const snapshotColumns: ColumnDef<ShareSnapshot>[] = [
  {
    id: "name",
    label: "Name",
    isRowHeader: true,
    cell: (row) => (
      <AppLink
        size="sm"
        to="/shares/snapshots/$snapshotId"
        params={{ snapshotId: row.id }}
      >
        {row.name || row.id}
      </AppLink>
    ),
    sortValue: (row) => row.name ?? row.id,
    textValue: (row) => `${row.name ?? ""} ${row.id} ${row.share_name ?? ""}`,
  },
  {
    id: "description",
    label: "Description",
    cell: (row) => row.description ?? "",
    hideBelow: "lg",
  },
  {
    id: "size",
    label: "Size",
    cell: (row) => (row.size === null ? "" : `${row.size} GiB`),
    sortValue: (row) => row.size ?? 0,
  },
  {
    id: "status",
    label: "Status",
    cell: (row) => (
      <StatusPill tone={statusTone(row.status)}>
        {statusLabel(row.status)}
      </StatusPill>
    ),
    sortValue: (row) => row.status ?? "",
  },
  {
    id: "source",
    label: "Source share",
    cell: (row) =>
      row.share_id ? (
        <AppLink
          size="sm"
          to="/shares/shares/$shareId"
          params={{ shareId: row.share_id }}
        >
          {row.share_name || row.share_id}
        </AppLink>
      ) : (
        ""
      ),
    sortValue: (row) => row.share_name ?? "",
    hideBelow: "md",
  },
];

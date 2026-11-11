// The image list's columns.
import { AppLink } from "../../../components/AppLink/AppLink";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Image } from "../../../lib/api/types/compute";
import { formatBytes, formatRelative } from "../../../lib/format";
import { imageStatusTone, visibilityLabel } from "./presentation";

/** The image list's columns, each image's name linking to its page. */
export const imageColumns: ColumnDef<Image>[] = [
  {
    id: "name",
    label: "Name",
    isRowHeader: true,
    cell: (row) => (
      <AppLink
        size="sm"
        to="/compute/images/$imageId"
        params={{ imageId: row.id }}
      >
        {row.name ?? row.id}
      </AppLink>
    ),
    sortValue: (row) => row.name ?? "",
  },
  {
    id: "status",
    label: "Status",
    cell: (row) => (
      <StatusPill tone={imageStatusTone(row.status)}>{row.status}</StatusPill>
    ),
    sortValue: (row) => row.status,
  },
  {
    id: "visibility",
    label: "Visibility",
    cell: (row) => visibilityLabel(row),
    sortValue: (row) => visibilityLabel(row),
    hideBelow: "md",
  },
  {
    id: "protected",
    label: "Protected",
    cell: (row) => (row.protected ? "Yes" : "No"),
    sortValue: (row) => (row.protected ? 1 : 0),
    hideBelow: "lg",
  },
  {
    id: "disk_format",
    label: "Format",
    cell: (row) => (row.disk_format ?? "").toUpperCase(),
    sortValue: (row) => row.disk_format ?? "",
    hideBelow: "lg",
  },
  {
    id: "size",
    label: "Size",
    cell: (row) => formatBytes(row.size),
    sortValue: (row) => row.size ?? 0,
    hideBelow: "md",
  },
  {
    id: "created_at",
    label: "Age",
    cell: (row) =>
      row.created_at ? (
        <time dateTime={row.created_at} title={row.created_at}>
          {formatRelative(row.created_at)}
        </time>
      ) : (
        ""
      ),
    sortValue: (row) => row.created_at ?? "",
    hideBelow: "lg",
  },
];

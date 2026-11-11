// The columns of a trunk's subports table.
import { AppLink } from "../../../components/AppLink/AppLink";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import type { TrunkSubport } from "../../../lib/api/types/network";

/** Each subport's port (linked), segmentation type and segmentation id. */
export const subportColumns: ColumnDef<TrunkSubport>[] = [
  {
    id: "port",
    label: "Port",
    isRowHeader: true,
    cell: (row) =>
      row.port_id ? (
        <AppLink
          size="sm"
          to="/network/ports/$portId"
          params={{ portId: row.port_id }}
        >
          {row.port_name || row.port_id}
        </AppLink>
      ) : (
        ""
      ),
    sortValue: (row) => row.port_name ?? row.port_id ?? "",
  },
  {
    id: "type",
    label: "Segmentation type",
    cell: (row) => (row.segmentation_type ?? "").toUpperCase(),
  },
  {
    id: "id",
    label: "Segmentation id",
    cell: (row) => row.segmentation_id ?? "",
    sortValue: (row) => row.segmentation_id ?? 0,
  },
];

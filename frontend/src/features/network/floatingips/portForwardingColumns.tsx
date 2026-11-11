// The columns of the port forwarding rules list.
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import type { PortForwarding } from "../../../lib/api/types/network";

/** Each rule's external and internal address and port, protocol and note. */
export const portForwardingColumns: ColumnDef<PortForwarding>[] = [
  {
    id: "external",
    label: "External",
    isRowHeader: true,
    cell: (row) => (
      <code>
        {row.floating_ip_address}:{row.external_port}
      </code>
    ),
    sortValue: (row) => `${row.floating_ip_address} ${row.external_port}`,
    textValue: (row) => `${row.floating_ip_address} ${row.external_port}`,
  },
  {
    id: "protocol",
    label: "Protocol",
    cell: (row) => row.protocol.toUpperCase(),
    sortValue: (row) => row.protocol,
  },
  {
    id: "internal",
    label: "Internal",
    cell: (row) => (
      <code>
        {row.internal_ip_address}:{row.internal_port}
      </code>
    ),
    textValue: (row) => `${row.internal_ip_address} ${row.internal_port}`,
  },
  {
    id: "description",
    label: "Description",
    cell: (row) => row.description,
    textValue: (row) => row.description,
    hideBelow: "md",
  },
];

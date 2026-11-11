// The columns of a pool's members table.
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Member } from "../../../lib/api/types/loadbalancers";
import {
  operatingLabel,
  operatingTone,
  provisioningLabel,
  provisioningTone,
} from "../status";

/** A member's address and port, name, weight, backup flag and statuses. */
export const memberColumns: ColumnDef<Member>[] = [
  {
    id: "address",
    label: "Address",
    isRowHeader: true,
    cell: (row) => `${row.address}:${row.protocol_port}`,
    sortValue: (row) => row.address,
  },
  {
    id: "name",
    label: "Name",
    cell: (row) => row.name || "",
    hideBelow: "md",
  },
  {
    id: "weight",
    label: "Weight",
    cell: (row) => row.weight ?? "",
    sortValue: (row) => row.weight ?? 0,
  },
  {
    id: "backup",
    label: "Backup",
    cell: (row) => (row.backup ? "Yes" : "No"),
    hideBelow: "lg",
  },
  {
    id: "operating",
    label: "Operating status",
    cell: (row) => (
      <StatusPill tone={operatingTone(row.operating_status)}>
        {operatingLabel(row.operating_status)}
      </StatusPill>
    ),
  },
  {
    id: "provisioning",
    label: "Provisioning",
    cell: (row) => (
      <StatusPill tone={provisioningTone(row.provisioning_status)}>
        {provisioningLabel(row.provisioning_status)}
      </StatusPill>
    ),
    hideBelow: "md",
  },
];

// The columns of the Networks list.
import { AppLink } from "../../../components/AppLink/AppLink";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Network } from "../../../lib/api/types/network";
import { adminStateLabel, statusLabel, statusTone } from "../status";
import styles from "./NetworksPage.module.scss";

/**
 * Each network linked by name, its subnets (name and address), whether it
 * is shared or external, its status and admin state, and its zones
 * (hidden until chosen).
 */
export const networkColumns: ColumnDef<Network>[] = [
  {
    id: "name",
    label: "Name",
    isRowHeader: true,
    cell: (row) => (
      <AppLink
        size="sm"
        to="/network/networks/$networkId"
        params={{ networkId: row.id }}
      >
        {row.name}
      </AppLink>
    ),
    sortValue: (row) => row.name,
    textValue: (row) => `${row.name} ${row.id}`,
  },
  {
    id: "subnets",
    label: "Subnets",
    cell: (row) =>
      row.subnets.length === 0 ? (
        ""
      ) : (
        <ul className={styles.subnets}>
          {row.subnets.map((subnet) => (
            <li key={subnet.id}>
              {subnet.name ? `${subnet.name} ` : ""}
              <code>{subnet.cidr}</code>
            </li>
          ))}
        </ul>
      ),
    textValue: (row) =>
      row.subnets.map((s) => `${s.name ?? ""} ${s.cidr ?? ""}`).join(" "),
  },
  {
    id: "shared",
    label: "Shared",
    cell: (row) => (row.is_shared ? "Yes" : "No"),
    sortValue: (row) => (row.is_shared ? 1 : 0),
    hideBelow: "md",
  },
  {
    id: "external",
    label: "External",
    cell: (row) => (row.is_external ? "Yes" : "No"),
    sortValue: (row) => (row.is_external ? 1 : 0),
    hideBelow: "md",
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
    id: "admin_state",
    label: "Admin state",
    cell: (row) => adminStateLabel(row.admin_state_up),
    sortValue: (row) => (row.admin_state_up ? 1 : 0),
    hideBelow: "lg",
  },
  {
    id: "zones",
    label: "Availability zones",
    cell: (row) => row.availability_zones.join(", "),
    hideBelow: "lg",
    defaultHidden: true,
  },
];

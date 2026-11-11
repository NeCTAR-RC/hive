// The columns of a zone's record sets table.
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { RecordSet } from "../../../lib/api/types/dns";
import { statusLabel, statusTone } from "../status";
import styles from "../Dns.module.scss";

/**
 * Name, type, records (one per line), TTL and status. Search reads the
 * name, type, records and description.
 */
export const recordSetColumns: ColumnDef<RecordSet>[] = [
  {
    id: "name",
    label: "Name",
    isRowHeader: true,
    cell: (row) => <span className={styles.recordName}>{row.name}</span>,
    sortValue: (row) => row.name ?? "",
    textValue: (row) =>
      `${row.name ?? ""} ${row.type ?? ""} ${row.records.join(" ")} ${row.description ?? ""}`,
  },
  {
    id: "type",
    label: "Type",
    cell: (row) => row.type ?? "",
    sortValue: (row) => row.type ?? "",
  },
  {
    id: "records",
    label: "Records",
    cell: (row) => (
      <ul className={styles.records}>
        {row.records.map((record) => (
          <li key={record}>{record}</li>
        ))}
      </ul>
    ),
    hideBelow: "md",
  },
  {
    id: "ttl",
    label: "TTL",
    cell: (row) => (row.ttl === null ? "Zone default" : String(row.ttl)),
    sortValue: (row) => row.ttl ?? -1,
    hideBelow: "lg",
  },
  {
    id: "status",
    label: "Status",
    cell: (row) => (
      <StatusPill tone={statusTone(row.status)}>
        {statusLabel(row.status, row.action)}
      </StatusPill>
    ),
    sortValue: (row) => row.status ?? "",
  },
];

// The columns of a mountable snapshot's access rules table.
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { ShareSnapshotDetail } from "../../../lib/api/types/shares";
import { ruleStateTone, statusLabel } from "../status";
import styles from "../Shares.module.scss";

/** One access rule on a mountable snapshot. */
export type SnapshotRule = NonNullable<
  ShareSnapshotDetail["access_rules"]
>[number];

/** The snapshot access rules' columns: who has access, how, and its state. */
export const snapshotRuleColumns: ColumnDef<SnapshotRule>[] = [
  {
    id: "to",
    label: "Access to",
    isRowHeader: true,
    cell: (row) => <span className={styles.identifier}>{row.access_to}</span>,
  },
  { id: "type", label: "Type", cell: (row) => row.access_type },
  {
    id: "state",
    label: "Status",
    cell: (row) => (
      <StatusPill tone={ruleStateTone(row.state)}>
        {statusLabel(row.state)}
      </StatusPill>
    ),
  },
];

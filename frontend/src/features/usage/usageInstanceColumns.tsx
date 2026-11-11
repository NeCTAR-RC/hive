// The columns of the Usage Trend page's per-instance table.
import type { ColumnDef } from "../../components/DataTable/DataTable";
import type { UsageInstance } from "../../lib/api/types/usage";
import { formatDate, formatNumber, formatSu } from "../../lib/format";
import styles from "./UsageTrendPage.module.scss";

/**
 * One row per instance that ran in the range: its name (with its id when
 * it has a display name), when it started and ended ("Running" while it
 * runs on), its zone and flavour, its hours and its service units.
 */
export const usageInstanceColumns: ColumnDef<UsageInstance>[] = [
  {
    id: "name",
    label: "Instance",
    isRowHeader: true,
    cell: (row) => (
      <span>
        {row.name}
        {row.display_name && (
          <span className={styles.muted}>
            {" "}
            <code>{row.id}</code>
          </span>
        )}
      </span>
    ),
    sortValue: (row) => row.name,
    textValue: (row) => `${row.name} ${row.id}`,
  },
  {
    id: "started",
    label: "Started",
    cell: (row) => formatDate(row.started_at),
    sortValue: (row) => row.started_at ?? "",
    hideBelow: "md",
  },
  {
    id: "ended",
    label: "Ended",
    cell: (row) => (row.ended_at ? formatDate(row.ended_at) : "Running"),
    sortValue: (row) => row.ended_at ?? "9999",
    hideBelow: "md",
  },
  {
    id: "zone",
    label: "Availability zone",
    cell: (row) => row.availability_zone ?? "",
    sortValue: (row) => row.availability_zone ?? "",
    hideBelow: "lg",
  },
  {
    id: "flavor",
    label: "Flavour",
    cell: (row) => row.flavor_name ?? "",
    sortValue: (row) => row.flavor_name ?? "",
    textValue: (row) => row.flavor_name ?? "",
    hideBelow: "lg",
  },
  {
    id: "hours",
    label: "Instance hours",
    cell: (row) => formatNumber(row.qty),
    sortValue: (row) => row.qty ?? 0,
    hideBelow: "md",
  },
  {
    id: "su",
    label: "SU",
    cell: (row) => formatSu(row.rate),
    sortValue: (row) => row.rate,
  },
];

// The columns of a security group's rules table.
import { useMemo } from "react";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { SecurityGroupRule } from "../../../lib/api/types/network";
import { portRange } from "./rules";
import styles from "./SecurityGroupDetailPage.module.scss";

/**
 * The rule columns: direction, ether type, protocol, port range, the
 * remote (a group by its name from `groupNames`, or a CIDR flagged when it
 * is open to the internet) and the description.
 */
export function useRuleColumns(
  groupNames: ReadonlyMap<string, string>,
): ColumnDef<SecurityGroupRule>[] {
  return useMemo<ColumnDef<SecurityGroupRule>[]>(
    () => [
      {
        id: "direction",
        label: "Direction",
        isRowHeader: true,
        cell: (row) => (row.direction === "ingress" ? "Ingress" : "Egress"),
        sortValue: (row) => row.direction,
      },
      {
        id: "ethertype",
        label: "Ether type",
        cell: (row) => row.ethertype,
        sortValue: (row) => row.ethertype,
        hideBelow: "md",
      },
      {
        id: "protocol",
        label: "Protocol",
        cell: (row) => (row.protocol ?? "Any").toUpperCase(),
        sortValue: (row) => row.protocol ?? "",
      },
      {
        id: "ports",
        label: "Port range",
        cell: (row) => portRange(row),
        sortValue: (row) => row.port_range_min ?? -1,
      },
      {
        id: "remote",
        label: "Remote",
        cell: (row) =>
          row.remote_group_id ? (
            <span>
              {groupNames.get(row.remote_group_id) ?? row.remote_group_id}
            </span>
          ) : (
            <span className={styles.remote}>
              <code>{row.remote_ip_prefix ?? "Any"}</code>
              {row.open_to_the_world && (
                <StatusPill tone="warning">Open to the internet</StatusPill>
              )}
            </span>
          ),
        sortValue: (row) => row.remote_ip_prefix ?? row.remote_group_id ?? "",
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description,
        hideBelow: "lg",
      },
    ],
    [groupNames],
  );
}

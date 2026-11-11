// The instance list's columns, which read the project's security risks to
// count each instance's.
import { useMemo } from "react";
import { AppLink } from "../../../components/AppLink/AppLink";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Instance } from "../../../lib/api/types/compute";
import type { RisksResponse } from "../../../lib/api/types/security";
import { formatRelative, formatSuRate } from "../../../lib/format";
import { humanise } from "../../../lib/status";
import {
  listedAddresses,
  powerStateLabel,
  statusLabel,
  statusTone,
} from "./status";
import styles from "./InstancesPage.module.scss";

/**
 * The instance list's columns, Nectar's instance table
 * (nectar_dashboard/overrides.py NectarInstancesTable). The security risks
 * column links each instance's risk count to the risks page, and starts
 * hidden while the project has no risks. A locked instance says so beside
 * its status, as its page does, since Nova refuses most actions on it.
 */
export function useInstanceColumns(
  risks: RisksResponse | undefined,
): ColumnDef<Instance>[] {
  const riskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const risk of risks?.items ?? []) {
      counts.set(risk.resource_id, (counts.get(risk.resource_id) ?? 0) + 1);
    }
    return counts;
  }, [risks]);

  return useMemo<ColumnDef<Instance>[]>(
    () => [
      {
        id: "name",
        label: "Instance name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/compute/instances/$instanceId"
            params={{ instanceId: row.id }}
          >
            {row.name}
          </AppLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "image",
        label: "Image name",
        cell: (row) =>
          row.boot_from_volume
            ? "Boot from volume"
            : (row.image?.name ?? row.image?.id ?? ""),
        sortValue: (row) => row.image?.name ?? "",
        textValue: (row) => row.image?.name ?? "",
        hideBelow: "lg",
      },
      {
        id: "addresses",
        label: "IP address",
        cell: (row) => (
          <ul className={styles.addresses}>
            {listedAddresses(row).map((address) => (
              <li key={address.addr}>
                {address.addr}
                {address.floating && (
                  <span className={styles.muted}> floating IP</span>
                )}
              </li>
            ))}
          </ul>
        ),
        textValue: (row) =>
          listedAddresses(row)
            .map((address) => address.addr)
            .join(" "),
      },
      {
        id: "flavor",
        label: "Flavour",
        cell: (row) =>
          row.flavor ? (
            <span>
              {row.flavor.name}
              {row.flavor.su_rate !== null && (
                <span className={styles.muted}>
                  {" "}
                  {formatSuRate(row.flavor.su_rate)}
                </span>
              )}
            </span>
          ) : (
            ""
          ),
        sortValue: (row) => row.flavor?.name ?? "",
        textValue: (row) => row.flavor?.name ?? "",
        hideBelow: "md",
      },
      {
        id: "key_name",
        label: "Key pair",
        cell: (row) => row.key_name ?? "",
        sortValue: (row) => row.key_name ?? "",
        hideBelow: "lg",
        defaultHidden: true,
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <span className={styles.pills}>
            <StatusPill tone={statusTone(row)}>{statusLabel(row)}</StatusPill>
            {row.locked && <StatusPill tone="neutral">Locked</StatusPill>}
          </span>
        ),
        sortValue: (row) => row.status,
      },
      {
        id: "task",
        label: "Task",
        cell: (row) => (row.task_state ? humanise(row.task_state) : "None"),
        sortValue: (row) => row.task_state ?? "",
        hideBelow: "lg",
        defaultHidden: true,
      },
      {
        id: "risks",
        label: "Security risks",
        cell: (row) => {
          const count = riskCounts.get(row.id) ?? 0;
          return count > 0 ? (
            <AppLink
              size="sm"
              to="/security/risks"
              hash={row.id}
              aria-label={`${count} security ${count === 1 ? "risk" : "risks"}`}
            >
              <StatusPill tone="danger">{`${count} ${count === 1 ? "risk" : "risks"}`}</StatusPill>
            </AppLink>
          ) : (
            ""
          );
        },
        sortValue: (row) => riskCounts.get(row.id) ?? 0,
        hideBelow: "lg",
        defaultHidden: !risks || risks.items.length === 0,
      },
      {
        id: "availability_zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        sortValue: (row) => row.availability_zone ?? "",
        hideBelow: "lg",
        defaultHidden: true,
      },
      {
        id: "power_state",
        label: "Power state",
        cell: (row) => powerStateLabel(row),
        sortValue: (row) => row.power_state,
        hideBelow: "lg",
        defaultHidden: true,
      },
      {
        id: "created",
        label: "Age",
        cell: (row) => (
          <time dateTime={row.created} title={row.created}>
            {formatRelative(row.created)}
          </time>
        ),
        sortValue: (row) => row.created,
        hideBelow: "md",
      },
    ],
    [riskCounts, risks],
  );
}

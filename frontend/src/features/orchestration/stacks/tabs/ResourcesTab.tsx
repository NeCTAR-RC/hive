// The resources tab of a stack: every resource Heat manages for it.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "../../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import type { StackResource } from "../../../../lib/api/types/orchestration";
import { formatRelative } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { stackResourcesQuery } from "../../api";
import { statusLabel, statusTone } from "../../status";
import { resourceHref } from "../resources";
import styles from "../../Orchestration.module.scss";

/**
 * A stack's resources with their physical IDs, types and statuses; a
 * physical ID links to its page where Hive has one for the type.
 */
export function ResourcesTab({ stackId }: { stackId: string }) {
  const projectId = useProjectId();
  const resources = useQuery(stackResourcesQuery(projectId, stackId));
  const resourcesTable = useQueryTable(resources, {
    noun: "resources",
    emptyTitle: "No resources",
  });
  const columns = useMemo<ColumnDef<StackResource>[]>(
    () => [
      {
        id: "name",
        label: "Resource",
        isRowHeader: true,
        cell: (row) => row.name ?? row.logical_id ?? "",
        sortValue: (row) => row.name ?? "",
      },
      {
        id: "physical",
        label: "Physical ID",
        cell: (row) => {
          const href = resourceHref(row.type, row.physical_id);
          const id = (
            <code className={styles.identifier}>{row.physical_id ?? ""}</code>
          );
          return href ? (
            <AppLink size="sm" href={href}>
              {id}
            </AppLink>
          ) : (
            id
          );
        },
        hideBelow: "lg",
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.type ?? "",
        sortValue: (row) => row.type ?? "",
        hideBelow: "md",
      },
      {
        id: "updated",
        label: "Updated",
        cell: (row) => formatRelative(row.updated_time) || "",
        sortValue: (row) => row.updated_time ?? "",
        hideBelow: "lg",
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
        id: "reason",
        label: "Status reason",
        cell: (row) => row.status_reason ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );
  return (
    <DataTable
      id="stack-resources"
      label="Resources"
      columns={columns}
      getRowId={(row) => row.name ?? row.logical_id ?? ""}
      {...resourcesTable}
    />
  );
}

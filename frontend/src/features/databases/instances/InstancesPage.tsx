// Database instances (trove-dashboard databases panel, Nectar columns):
// the project's instances with quota and the row actions.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { DbInstance } from "../../../lib/api/types/databases";
import { formatMb } from "../../../lib/format";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { dbInstancesQuery } from "../api";
import { useInstanceActions } from "./InstanceActions";
import { availableDbInstanceActions, statusLabel, statusTone } from "../status";
import styles from "../Databases.module.scss";

const dbInstancesRoute = getRouteApi("/app/databases/instances");

/** The project's database instances with their quota and row actions. */
export function InstancesPage() {
  const projectId = useProjectId();
  const instances = useQuery(dbInstancesQuery(projectId));
  const search = useListSearch(dbInstancesRoute);
  const table = useQueryTable(instances, {
    noun: "database instances",
    noMatchTitle: "No instances match",
    search,
    placeholder: "Search instances",
  });
  const { run, dialogs, tableProps } = useInstanceActions();

  const columns = useMemo<ColumnDef<DbInstance>[]>(
    () => [
      {
        id: "name",
        label: "Instance name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/databases/instances/$instanceId"
            params={{ instanceId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.datastore ?? ""} ${row.addresses.join(" ")}`,
      },
      {
        id: "datastore",
        label: "Datastore",
        cell: (row) => row.datastore ?? "",
        sortValue: (row) => row.datastore ?? "",
        hideBelow: "md",
      },
      {
        id: "version",
        label: "Datastore version",
        cell: (row) => row.datastore_version ?? "",
        hideBelow: "lg",
      },
      {
        id: "host",
        label: "Host",
        cell: (row) =>
          row.hostname ??
          (row.addresses.length ? row.addresses.join(", ") : "Not assigned"),
        hideBelow: "md",
      },
      {
        id: "size",
        label: "Size",
        cell: (row) =>
          row.flavor_name
            ? `${row.flavor_name}${row.ram ? ` | ${formatMb(row.ram)}` : ""}`
            : "",
        hideBelow: "lg",
      },
      {
        id: "volume",
        label: "Volume size",
        cell: (row) =>
          row.volume_size === null ? "" : `${row.volume_size} GB`,
        sortValue: (row) => row.volume_size ?? 0,
        hideBelow: "lg",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status_kind)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
    ],
    [],
  );
  const quota = instances.data?.quota;
  const count = instances.data?.items.length ?? 0;

  return (
    <>
      <PageHeader
        title="Database instances"
        crumbs={[{ label: "Project" }, { label: "Database" }]}
        actions={
          <AppLink variant="primary" size="sm" to="/databases/instances/new">
            Launch instance
          </AppLink>
        }
      >
        {quota && quota.max_instances !== null && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Instances"
              value={count}
              max={quota.max_instances}
              unit="instances"
            />
          </div>
        )}
      </PageHeader>
      <DataTable
        id="db-instances"
        label="Database instances"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        emptyBody={<p>Launch a managed MySQL or PostgreSQL instance.</p>}
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableDbInstanceActions(row), (id) => run(id, [row]))
        }
        batchActions={[
          {
            id: "restart",
            label: "Restart",
            isDisabled: (selected) =>
              !selected.some((i) =>
                allows(availableDbInstanceActions(i), "restart"),
              ),
            onAction: (selected) => run("restart", selected),
          },
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => run("delete", selected),
          },
        ]}
      />
      {dialogs}
    </>
  );
}

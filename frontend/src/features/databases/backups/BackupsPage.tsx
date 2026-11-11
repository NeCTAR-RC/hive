// Database backups (trove-dashboard database_backups panel): the list with
// the backup quota and the create dialog.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../lib/actions";
import type { DbBackup } from "../../../lib/api/types/databases";
import { formatDateTime } from "../../../lib/format";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { dbBackupsQuery } from "../api";
import { useBackupActions } from "./BackupActions";
import { CreateBackupDialog } from "./dialogs/CreateBackupDialog";
import { availableDbBackupActions, statusLabel, statusTone } from "../status";
import styles from "../Databases.module.scss";

const dbBackupsRoute = getRouteApi("/app/databases/backups");

/**
 * The project's database backups. The create dialog's open state and the
 * instance a link preselects live in the URL (`create`, `instance`).
 */
export function BackupsPage() {
  const projectId = useProjectId();
  const backups = useQuery(dbBackupsQuery(projectId));
  const search = useListSearch(dbBackupsRoute);
  const table = useQueryTable(backups, {
    noun: "database backups",
    noMatchTitle: "No backups match",
    search,
    placeholder: "Search backups",
  });
  const { run, dialogs, tableProps } = useBackupActions();
  const creating = search.params.create === true;
  // Closing the dialog also forgets the instance a link preselected.
  const setCreating = (open: boolean) =>
    search.patch(
      open ? { create: true } : { create: false, instance: undefined },
    );

  const columns = useMemo<ColumnDef<DbBackup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/databases/backups/$backupId"
            params={{ backupId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.instance_name ?? ""} ${row.datastore ?? ""}`,
      },
      {
        id: "datastore",
        label: "Datastore",
        cell: (row) => row.datastore ?? "",
        hideBelow: "md",
      },
      {
        id: "version",
        label: "Datastore version",
        cell: (row) => row.datastore_version ?? "",
        hideBelow: "lg",
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatDateTime(row.created) || "",
        sortValue: (row) => row.created ?? "",
        hideBelow: "md",
      },
      {
        id: "instance",
        label: "Database",
        cell: (row) =>
          row.instance_id ? (
            <AppLink
              size="sm"
              to="/databases/instances/$instanceId"
              params={{ instanceId: row.instance_id }}
            >
              {row.instance_name || row.instance_id}
            </AppLink>
          ) : (
            ""
          ),
        sortValue: (row) => row.instance_name ?? "",
      },
      {
        id: "incremental",
        label: "Incremental",
        cell: (row) => (row.incremental ? "Yes" : "No"),
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
  const quota = backups.data?.quota;
  const count = backups.data?.items.length ?? 0;

  return (
    <>
      <PageHeader
        title="Database backups"
        crumbs={[{ label: "Project" }, { label: "Database" }]}
        actions={
          <Button
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={(backups.data?.instances.length ?? 1) === 0}
          >
            Create backup
          </Button>
        }
      >
        {quota && quota.max_backups !== null && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Backups"
              value={count}
              max={quota.max_backups}
              unit="backups"
            />
          </div>
        )}
      </PageHeader>
      <DataTable
        id="db-backups"
        label="Database backups"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        emptyBody={<p>Back up an active instance to restore it later.</p>}
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          toRowActions(availableDbBackupActions(row), (id) => run(id, [row]))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => run("delete", selected),
          },
        ]}
      />
      {creating && (
        <CreateBackupDialog
          instanceId={search.params.instance ?? null}
          onClose={() => setCreating(false)}
        />
      )}
      {dialogs}
    </>
  );
}

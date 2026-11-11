// The Backups tab of a database instance (trove-dashboard instance detail
// tabs): the backups taken of it, with the backup actions.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../../lib/actions";
import type { DbBackup } from "../../../../lib/api/types/databases";
import { formatDateTime } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { dbInstanceBackupsQuery } from "../../api";
import { useBackupActions } from "../../backups/BackupActions";
import {
  availableDbBackupActions,
  statusLabel,
  statusTone,
} from "../../status";

/**
 * The instance's backups, newest first. Create backup opens the backups
 * list's create dialog with this instance chosen.
 */
export function BackupsTab({ instanceId }: { instanceId: string }) {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const backups = useQuery(dbInstanceBackupsQuery(projectId, instanceId));
  const { run, dialogs, tableProps } = useBackupActions();
  const backupsTable = useQueryTable(backups, {
    noun: "backups",
    emptyTitle: "No backups of this instance",
  });
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
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatDateTime(row.created) || "",
        sortValue: (row) => row.created ?? "",
      },
      {
        id: "incremental",
        label: "Incremental",
        cell: (row) => (row.incremental ? "Yes" : "No"),
        hideBelow: "md",
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
  return (
    <>
      <DataTable
        id="db-instance-backups"
        label="Backups"
        columns={columns}
        getRowId={(row) => row.id}
        {...backupsTable}
        {...tableProps}
        toolbarActions={
          <Button
            size="xs"
            onPress={() =>
              void navigate({
                to: "/databases/backups",
                search: { create: true, instance: instanceId },
              })
            }
          >
            Create backup
          </Button>
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          toRowActions(availableDbBackupActions(row), (id) => run(id, [row]))
        }
      />
      {dialogs}
    </>
  );
}

// The Logs tab of a database instance (trove-dashboard LogsTab with
// logs/tables.py): the guest logs with their publish, enable, disable and
// discard actions, and the viewer of a published log.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../../lib/actions";
import type { DbLog } from "../../../../lib/api/types/databases";
import { formatBytes } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { notify } from "../../../../lib/notify";
import { dbLogsQuery, useLogAction, type LogAction } from "../../api";
import { LogContentsDialog } from "../dialogs/LogContentsDialog";
import { availableDbLogActions, statusLabel, statusTone } from "../../status";

const PAST_TENSE: Record<LogAction, string> = {
  enable: "Enabled",
  disable: "Disabled",
  publish: "Published",
  discard: "Discarded",
};

/**
 * The instance's guest logs. `openLog` names the log whose viewer is open
 * (the page keeps it in the URL); `onOpenLog` opens one, or closes the
 * viewer with null.
 */
export function LogsTab({
  instanceId,
  openLog,
  onOpenLog,
}: {
  instanceId: string;
  openLog: string | undefined;
  onOpenLog: (name: string | null) => void;
}) {
  const projectId = useProjectId();
  const logs = useQuery(dbLogsQuery(projectId, instanceId));
  const table = useQueryTable(logs, {
    noun: "logs",
    emptyTitle: "This datastore offers no guest logs",
  });
  const act = useLogAction();
  const columns = useMemo<ColumnDef<DbLog>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => row.name ?? "",
        sortValue: (row) => row.name ?? "",
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.type ?? "",
        sortValue: (row) => row.type ?? "",
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
      {
        id: "published",
        label: "Published",
        cell: (row) => formatBytes(row.published),
        sortValue: (row) => row.published,
        hideBelow: "md",
      },
      {
        id: "pending",
        label: "Publishable",
        cell: (row) => formatBytes(row.pending),
        sortValue: (row) => row.pending,
        hideBelow: "lg",
      },
      {
        id: "container",
        label: "Container",
        cell: (row) => row.container ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );
  const run = (row: DbLog, action: LogAction) =>
    act.mutate(
      { instanceId, name: row.name ?? "", action },
      {
        onSuccess: () =>
          notify.success(`${PAST_TENSE[action]} log ${row.name}.`),
        onError: () => notify.danger(`Could not ${action} log ${row.name}.`),
      },
    );
  return (
    <>
      <DataTable
        id="db-logs"
        label="Logs"
        columns={columns}
        getRowId={(row) => row.name ?? ""}
        {...table}
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableDbLogActions(row), (id) =>
            id === "view" ? onOpenLog(row.name ?? "") : run(row, id),
          )
        }
      />
      {openLog && (
        <LogContentsDialog
          instanceId={instanceId}
          name={openLog}
          onClose={() => onOpenLog(null)}
        />
      )}
    </>
  );
}

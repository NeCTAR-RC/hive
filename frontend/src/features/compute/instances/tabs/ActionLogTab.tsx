// The instance detail page's action log tab.
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import type {
  InstanceAction,
  InstanceDetail,
} from "../../../../lib/api/types/compute";
import { formatDateTime } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { instanceActionLogQuery } from "../../api";

const ACTION_LOG_COLUMNS: ColumnDef<InstanceAction>[] = [
  {
    id: "action",
    label: "Action",
    isRowHeader: true,
    cell: (row) => row.action,
    sortValue: (row) => row.action,
  },
  {
    id: "start_time",
    label: "Start time",
    cell: (row) => formatDateTime(row.start_time),
    sortValue: (row) => row.start_time,
  },
  {
    id: "user",
    label: "User ID",
    cell: (row) => <code>{row.user_id ?? ""}</code>,
    hideBelow: "lg",
  },
  {
    id: "request",
    label: "Request ID",
    cell: (row) => <code>{row.request_id}</code>,
    hideBelow: "md",
  },
  {
    id: "message",
    label: "Message",
    cell: (row) => row.message ?? "",
    hideBelow: "lg",
  },
];

/** Nova's record of the actions taken on the instance, newest first. */
export function ActionLogTab({ instance }: { instance: InstanceDetail }) {
  const projectId = useProjectId();
  const actions = useQuery(instanceActionLogQuery(projectId, instance.id));
  const actionsTable = useQueryTable(actions, {
    noun: "actions",
    emptyTitle: "No actions recorded",
  });
  return (
    <DataTable
      id="instance-actions"
      label="Action log"
      columns={ACTION_LOG_COLUMNS}
      getRowId={(row) => `${row.request_id}-${row.start_time}`}
      {...actionsTable}
      defaultSort={{ column: "start_time", direction: "descending" }}
    />
  );
}

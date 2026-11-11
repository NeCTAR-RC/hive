// The events tab of a stack: Heat's event log, newest first.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import type { StackEvent } from "../../../../lib/api/types/orchestration";
import { formatDateTime } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { stackEventsQuery } from "../../api";
import { statusLabel, statusTone } from "../../status";

/** A stack's events, sorted newest first. */
export function EventsTab({ stackId }: { stackId: string }) {
  const projectId = useProjectId();
  const events = useQuery(stackEventsQuery(projectId, stackId));
  const eventsTable = useQueryTable(events, {
    noun: "events",
    emptyTitle: "No events",
  });
  const columns = useMemo<ColumnDef<StackEvent>[]>(
    () => [
      {
        id: "resource",
        label: "Resource",
        isRowHeader: true,
        cell: (row) => row.resource_name ?? "",
        sortValue: (row) => row.resource_name ?? "",
      },
      {
        id: "time",
        label: "Time",
        cell: (row) => formatDateTime(row.event_time) || "",
        sortValue: (row) => row.event_time ?? "",
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
        hideBelow: "md",
      },
    ],
    [],
  );
  return (
    <DataTable
      id="stack-events"
      label="Events"
      columns={columns}
      getRowId={(row) =>
        row.id ?? `${row.resource_name ?? ""}-${row.event_time ?? ""}`
      }
      {...eventsTable}
      defaultSort={{ column: "time", direction: "descending" }}
    />
  );
}

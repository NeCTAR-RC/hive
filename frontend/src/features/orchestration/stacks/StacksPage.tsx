// Stacks (heat-dashboard stacks panel): the project's stacks with their
// status, and the suspend, resume, check, cancel update and delete
// actions.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { Stack } from "../../../lib/api/types/orchestration";
import { formatRelative } from "../../../lib/format";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { stacksQuery } from "../api";
import { useStackActions } from "./StackActions";
import { availableStackActions, statusLabel, statusTone } from "../status";

const stacksRoute = getRouteApi("/app/orchestration/stacks");

export function StacksPage() {
  const projectId = useProjectId();
  const stacks = useQuery(stacksQuery(projectId));
  const search = useListSearch(stacksRoute);
  const table = useQueryTable(stacks, {
    noun: "stacks",
    search,
    placeholder: "Search stacks",
  });
  const { run, dialogs, tableProps } = useStackActions();

  const columns = useMemo<ColumnDef<Stack>[]>(
    () => [
      {
        id: "name",
        label: "Stack name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/orchestration/stacks/$stackId"
            params={{ stackId: row.id }}
          >
            {row.name}
          </AppLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id} ${row.description ?? ""}`,
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatRelative(row.creation_time) || "",
        sortValue: (row) => row.creation_time ?? "",
        hideBelow: "md",
      },
      {
        id: "updated",
        label: "Updated",
        cell: (row) => formatRelative(row.updated_time) || "Never",
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
    <>
      <PageHeader
        title="Stacks"
        crumbs={[{ label: "Project" }, { label: "Orchestration" }]}
        actions={
          <AppLink variant="primary" size="sm" to="/orchestration/stacks/new">
            Launch stack
          </AppLink>
        }
      />
      <DataTable
        id="stacks"
        label="Stacks"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        emptyBody={
          <p>
            Launch a stack from a Heat template to create a set of resources
            together.
          </p>
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          toRowActions(availableStackActions(row), (id) => run(id, [row]))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) =>
              !selected.some((s) => allows(availableStackActions(s), "delete")),
            onAction: (selected) => run("delete", selected),
          },
        ]}
      />
      {dialogs}
    </>
  );
}

// Stacks (heat-dashboard stacks panel): the project's stacks with their
// status, and the suspend, resume, check and delete actions.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Link } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { Stack } from "../../lib/api/types";
import { formatRelative } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { stacksQuery, useDeleteStack, useStackAction } from "./api";
import { ACTION_LABELS, statusLabel, statusTone } from "./status";
import styles from "./Orchestration.module.scss";

export function StacksPage() {
  const projectId = useProjectId();
  const stacks = useQuery(stacksQuery(projectId));
  const act = useStackAction(projectId);
  const remove = useDeleteStack(projectId);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Stack[]>([]);

  const columns = useMemo<ColumnDef<Stack>[]>(
    () => [
      {
        id: "name",
        label: "Stack name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/orchestration/stacks/$stackId"
            params={{ stackId: row.id }}
            className={styles.nameLink}
          >
            {row.name}
          </RouterLink>
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
  const rows = useMemo(
    () => filterRows(stacks.data?.items ?? [], query, columns),
    [stacks.data, query, columns],
  );

  const run = (stack: Stack, action: string) =>
    act.mutate(
      { id: stack.id, action },
      {
        onSuccess: () =>
          notify.success(`${ACTION_LABELS[action] ?? action}: ${stack.name}.`),
        onError: () =>
          notify.danger(`Could not ${action} stack ${stack.name}.`),
      },
    );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((s) => remove.mutateAsync(s.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting stack ${deleting[0]?.name}.`
          : `Deleting ${deleting.length} stacks.`,
      );
    } else {
      notify.danger(`Could not delete ${failed} of ${deleting.length} stacks.`);
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Stacks"
        crumbs={[{ label: "Project" }, { label: "Orchestration" }]}
        actions={
          <Link variant="primary" size="sm" href="/orchestration/stacks/new">
            Launch stack
          </Link>
        }
      />
      <DataTable
        id="stacks"
        label="Stacks"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={stacks.isPending}
        isFetching={stacks.isFetching}
        error={stacks.error}
        onRetry={() => void stacks.refetch()}
        onRefresh={() => void stacks.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search stacks",
        }}
        resetKey={query}
        emptyTitle={
          stacks.data?.items.length ? "No stacks match" : "No stacks yet"
        }
        emptyBody={
          stacks.data?.items.length === 0 ? (
            <p>
              Launch a stack from a Heat template to create a set of resources
              together.
            </p>
          ) : null
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) => [
          ...(row.actions.includes("resume")
            ? [
                {
                  id: "resume",
                  label: "Resume stack",
                  onAction: () => run(row, "resume"),
                },
              ]
            : [
                {
                  id: "suspend",
                  label: "Suspend stack",
                  isDisabled: !row.actions.includes("suspend"),
                  disabledReason: `The stack cannot be suspended while it is ${statusLabel(row.status).toLowerCase()}.`,
                  onAction: () => run(row, "suspend"),
                },
              ]),
          {
            id: "check",
            label: "Check stack",
            isDisabled: !row.actions.includes("check"),
            disabledReason: "The stack can be checked once it is complete.",
            onAction: () => run(row, "check"),
          },
          {
            id: "delete",
            label: "Delete stack",
            tone: "danger",
            isDisabled: !row.actions.includes("delete"),
            disabledReason: "The stack is already being deleted.",
            onAction: () => setDeleting([row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) =>
              selected.every((s) => !s.actions.includes("delete")),
            onAction: (selected) =>
              setDeleting(selected.filter((s) => s.actions.includes("delete"))),
          },
        ]}
      />
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete stack ${deleting[0]?.name}?`
            : `Delete ${deleting.length} stacks?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>
          Every resource the stack created is deleted with it. This cannot be
          undone.
        </p>
      </ConfirmDialog>
    </>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import type { SecurityGroup } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { securityGroupsQuery, useDeleteSecurityGroups } from "../api";
import {
  CreateSecurityGroupDialog,
  EditSecurityGroupDialog,
} from "./SecurityGroupDialogs";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

export function SecurityGroupsPage() {
  const projectId = useProjectId();
  const groups = useQuery(securityGroupsQuery(projectId));
  const remove = useDeleteSecurityGroups(projectId);
  // Search and the create dialog live in the URL, as on the sibling lists.
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const query = typeof search.q === "string" ? search.q : "";
  const creating = search.create === true;
  const setSearch = (patch: { q?: string; create?: boolean }) =>
    void navigate({
      to: "/network/security-groups",
      search: (previous) => {
        const next: Record<string, unknown> = { ...previous, ...patch };
        if (!next.q) delete next.q;
        if (!next.create) delete next.create;
        return next;
      },
      replace: true,
    });
  const setQuery = (q: string) => setSearch({ q });
  const setCreating = (open: boolean) => setSearch({ create: open });
  const [editing, setEditing] = useState<SecurityGroup | null>(null);
  const [deleting, setDeleting] = useState<SecurityGroup[]>([]);

  const columns = useMemo<ColumnDef<SecurityGroup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/network/security-groups/$groupId"
            params={{ groupId: row.id }}
          >
            {row.name}
          </RouteLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description,
        sortValue: (row) => row.description,
        textValue: (row) => row.description,
        hideBelow: "md",
      },
      {
        id: "rules",
        label: "Rules",
        cell: (row) => row.rule_count,
        sortValue: (row) => row.rule_count,
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(groups.data?.items ?? [], query, columns),
    [groups.data, query, columns],
  );

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(deleting.map((g) => g.id));
      notify.success(
        deleting.length === 1
          ? `Security group ${deleting[0]?.name} deleted.`
          : `${deleting.length} security groups deleted.`,
      );
    } catch (error) {
      notify.danger(`Could not delete: ${(error as Error).message}`);
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Security Groups"
        crumbs={[{ label: "Project" }, { label: "Network" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create security group
          </Button>
        }
      />
      <DataTable
        id="security-groups"
        label="Security groups"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={groups.isPending}
        isFetching={groups.isFetching}
        error={groups.error}
        onRetry={() => void groups.refetch()}
        onRefresh={() => void groups.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search security groups",
        }}
        resetKey={query}
        emptyTitle={
          groups.data?.items.length
            ? "No security groups match"
            : "No security groups"
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "rules",
            label: "Manage rules",
            onAction: () =>
              void navigate({
                to: "/network/security-groups/$groupId",
                params: { groupId: row.id },
              }),
          },
          {
            id: "edit",
            label: "Edit security group",
            onAction: () => setEditing(row),
          },
          {
            id: "delete",
            label: "Delete security group",
            tone: "danger",
            onAction: () => setDeleting([row]),
            isDisabled: row.name === "default",
            disabledReason: "The default group cannot be deleted",
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => setDeleting(rows),
            isDisabled: (rows) => rows.some((row) => row.name === "default"),
          },
        ]}
      />
      <CreateSecurityGroupDialog
        projectId={projectId}
        isOpen={creating}
        onOpenChange={setCreating}
      />
      {editing && (
        <EditSecurityGroupDialog
          projectId={projectId}
          group={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete security group ${deleting[0]?.name}?`
            : `Delete ${deleting.length} security groups?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>A group still applied to an instance cannot be deleted.</p>
      </ConfirmDialog>
    </>
  );
}

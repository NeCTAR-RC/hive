// Project Members: the project's member and tenantmanager assignments,
// one row per (user, role) as in nectar_dashboard/project_members.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import type { MemberRow } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { membersRoute } from "../../../app/router";
import { membersQuery, useRemoveMember } from "../api";
import { AddMemberDialog } from "./MemberDialogs";
import styles from "./MembersPage.module.scss";

export function MembersPage() {
  const projectId = useProjectId();
  const search = membersRoute.useSearch();
  const navigate = useNavigate({ from: membersRoute.fullPath });
  const members = useQuery(membersQuery(projectId));
  const remove = useRemoveMember(projectId);
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<MemberRow[]>([]);
  const adding = search.add === true;
  const setAdding = (open: boolean) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous };
        if (open) next.add = true;
        else delete next.add;
        return next;
      },
      replace: true,
    });

  const columns = useMemo<ColumnDef<MemberRow>[]>(
    () => [
      {
        id: "name",
        label: "User name",
        isRowHeader: true,
        cell: (row) => (
          <span>
            {row.name}
            {row.is_self && <span className={styles.muted}> (you)</span>}
          </span>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => row.name,
      },
      {
        id: "role",
        label: "Role",
        cell: (row) => row.role_name,
        sortValue: (row) => row.role_name,
        textValue: (row) => row.role_name,
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(members.data?.items ?? [], query, columns),
    [members.data, query, columns],
  );

  const confirmRemove = async () => {
    const targets = removing.filter((row) => row.can_remove && row.role_id);
    const results = await Promise.allSettled(
      targets.map((row) =>
        remove.mutateAsync({ user_id: row.user_id, role_id: row.role_id! }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        targets.length === 1
          ? `Removed ${targets[0]?.name} (${targets[0]?.role_name}).`
          : `Removed ${targets.length} members.`,
      );
    } else {
      notify.danger(`Could not remove ${failed} of ${targets.length} members.`);
    }
    setRemoving([]);
  };

  return (
    <>
      <PageHeader
        title="Project Members"
        crumbs={[{ label: "Identity" }]}
        actions={
          <Button size="sm" onPress={() => setAdding(true)}>
            Add member
          </Button>
        }
      >
        <p className={styles.intro}>
          Members can use the project&apos;s resources. Tenant managers can also
          add and remove members and manage the allocation. A user who holds
          both roles appears twice.
        </p>
      </PageHeader>
      <DataTable
        id="members"
        label="Project members"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={members.isPending}
        isFetching={members.isFetching}
        error={members.error}
        onRetry={() => void members.refetch()}
        onRefresh={() => void members.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search members",
        }}
        resetKey={query}
        emptyTitle={
          members.data?.items.length ? "No members match" : "No members"
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "remove",
            label: "Remove",
            tone: "danger",
            isDisabled: !row.can_remove,
            disabledReason: row.is_self
              ? "You cannot remove yourself."
              : "This role cannot be removed here.",
            onAction: () => setRemoving([row]),
          },
        ]}
        batchActions={[
          {
            id: "remove",
            label: "Remove",
            tone: "danger",
            isDisabled: (selected) => selected.every((row) => !row.can_remove),
            onAction: (selected) => setRemoving(selected),
          },
        ]}
      />
      <AddMemberDialog
        projectId={projectId}
        roles={members.data?.roles ?? []}
        isOpen={adding}
        onOpenChange={setAdding}
      />
      <ConfirmDialog
        isOpen={removing.length > 0}
        onOpenChange={(open) => !open && setRemoving([])}
        title={
          removing.length === 1
            ? `Remove ${removing[0]?.name} as ${removing[0]?.role_name}?`
            : `Remove ${removing.length} members?`
        }
        confirmLabel="Remove"
        isPending={remove.isPending}
        onConfirm={() => void confirmRemove()}
      >
        <p>
          The user loses that role on this project straight away. Their
          instances and other resources stay in the project.
        </p>
        {removing.some((row) => !row.can_remove) && (
          <p>Rows that cannot be removed, including your own, are skipped.</p>
        )}
      </ConfirmDialog>
    </>
  );
}

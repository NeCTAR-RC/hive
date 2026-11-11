// Project Members: the project's member and tenantmanager assignments,
// one row per (user, role) as in nectar_dashboard/project_members.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { REMOVE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { allows, toRowActions } from "../../../lib/actions";
import type { MemberRow } from "../../../lib/api/types/identity";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { memberWriteKeys, membersQuery, removeMemberRole } from "../api";
import { availableMemberActions } from "../status";
import { AddMemberDialog } from "./dialogs/AddMemberDialog";
import styles from "./MembersPage.module.scss";

const membersRoute = getRouteApi("/app/members");

/** Whether the row's role can be removed now. */
const removable = (row: MemberRow) =>
  allows(availableMemberActions(row), "remove");

/**
 * The project's members, one row per user and role, with add and remove.
 */
export function MembersPage() {
  const projectId = useProjectId();
  const members = useQuery(membersQuery(projectId));
  const search = useListSearch(membersRoute);
  const table = useQueryTable(members, {
    noun: "members",
    emptyTitle: "No members",
    search,
    placeholder: "Search members",
  });
  const remove = useBulkAction<MemberRow, "remove">({
    noun: { one: "member", many: "members" },
    name: (row) => `${row.name} (${row.role_name})`,
    getId: (row) => row.id,
    invalidates: memberWriteKeys,
    actions: {
      remove: {
        verb: REMOVE,
        request: (row) =>
          row.role_id
            ? removeMemberRole(row.user_id, row.role_id)
            : Promise.reject(new Error("This role cannot be removed here")),
        title: (rows) => {
          const [only] = rows;
          return rows.length === 1 && only
            ? `Remove ${only.name} as ${only.role_name}?`
            : `Remove ${rows.length} members?`;
        },
        body: (
          <p>
            The user loses that role on this project straight away. Their
            instances and other resources stay in the project.
          </p>
        ),
        eligible: removable,
        skippedWhy:
          "you cannot remove yourself, and some roles cannot be removed here",
      },
    },
  });
  const adding = search.params.add === true;
  const setAdding = (add: boolean) => search.patch({ add });

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

  return (
    <>
      <PageHeader
        title="Project members"
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
        getRowId={(row) => row.id}
        {...table}
        {...remove.tableProps}
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableMemberActions(row), (id) =>
            remove.run(id, [row]),
          )
        }
        batchActions={[
          {
            id: "remove",
            label: "Remove",
            tone: "danger",
            isDisabled: (selected) => !selected.some(removable),
            onAction: (selected) => remove.run("remove", selected),
          },
        ]}
      />
      {adding && (
        <AddMemberDialog
          roles={members.data?.roles ?? []}
          members={members.data?.items ?? []}
          onClose={() => setAdding(false)}
        />
      )}
      {remove.dialog}
    </>
  );
}

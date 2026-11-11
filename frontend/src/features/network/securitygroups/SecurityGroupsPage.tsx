// The Security groups list, with Create security group.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { allows, toRowActions } from "../../../lib/actions";
import type { SecurityGroup } from "../../../lib/api/types/network";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { securityGroupsQuery } from "../api";
import { availableSecurityGroupActions } from "../status";
import { useSecurityGroupActions } from "./SecurityGroupActions";
import { CreateSecurityGroupDialog } from "./dialogs/CreateSecurityGroupDialog";

const securityGroupsRoute = getRouteApi("/app/network/security-groups");

/**
 * The Security groups list page with its row and batch actions. The create
 * dialog is in the address (`?create=1`), as on the other network lists.
 */
export function SecurityGroupsPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const groups = useQuery(securityGroupsQuery(projectId));
  const search = useListSearch(securityGroupsRoute);
  const table = useQueryTable(groups, {
    noun: "security groups",
    emptyTitle: "No security groups",
    search,
    placeholder: "Search security groups",
  });
  const actions = useSecurityGroupActions();
  const setCreating = (create: boolean) => search.patch({ create });

  const columns = useMemo<ColumnDef<SecurityGroup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/network/security-groups/$groupId"
            params={{ groupId: row.id }}
          >
            {row.name}
          </AppLink>
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

  return (
    <>
      <PageHeader
        title="Security groups"
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
        getRowId={(row) => row.id}
        {...table}
        {...actions.tableProps}
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
          ...toRowActions(availableSecurityGroupActions(row), (id) =>
            actions.run(id, [row]),
          ),
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => actions.run("delete", rows),
            isDisabled: (rows) =>
              !rows.some((row) =>
                allows(availableSecurityGroupActions(row), "delete"),
              ),
          },
        ]}
      />
      {search.params.create && (
        <CreateSecurityGroupDialog onClose={() => setCreating(false)} />
      )}
      {actions.dialogs}
    </>
  );
}

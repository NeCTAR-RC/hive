// Share groups (manila-ui share_groups panel): the project's share groups
// with the create, snapshot, edit and delete actions.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { ShareGroup } from "../../../lib/api/types/shares";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { shareGroupsQuery } from "../api";
import { useShareGroupActions } from "./ShareGroupActions";
import { CreateShareGroupDialog } from "./dialogs/CreateShareGroupDialog";
import { availableShareGroupActions, statusLabel, statusTone } from "../status";

const shareGroupsRoute = getRouteApi("/app/shares/share-groups");

/**
 * The project's share groups. The create dialog opens from the header or
 * from a share group snapshot's "create share group" link.
 */
export function ShareGroupsPage() {
  const projectId = useProjectId();
  const groups = useQuery(shareGroupsQuery(projectId));
  const search = useListSearch(shareGroupsRoute);
  const table = useQueryTable(groups, {
    noun: "share groups",
    search,
    placeholder: "Search share groups",
  });
  const { run, dialogs, tableProps } = useShareGroupActions();
  const creating = search.params.create === true;
  // Closing the dialog also forgets the snapshot a link preselected.
  const setCreating = (open: boolean) =>
    search.patch(
      open ? { create: true } : { create: false, snapshot: undefined },
    );

  const columns = useMemo<ColumnDef<ShareGroup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/shares/share-groups/$groupId"
            params={{ groupId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.description ?? ""}`,
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
        id: "zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        hideBelow: "md",
      },
      {
        id: "source",
        label: "Source snapshot",
        cell: (row) => row.source_share_group_snapshot_id ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Share groups"
        crumbs={[{ label: "Project" }, { label: "Share" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create share group
          </Button>
        }
      />
      <DataTable
        id="share-groups"
        label="Share groups"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        emptyBody={
          <p>A share group lets you snapshot several shares together.</p>
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableShareGroupActions(row), (id) => run(id, [row]))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) =>
              !selected.some((group) =>
                allows(availableShareGroupActions(group), "delete"),
              ),
            onAction: (selected) => run("delete", selected),
          },
        ]}
      />
      {creating && (
        <CreateShareGroupDialog
          snapshotId={search.params.snapshot ?? null}
          onClose={() => setCreating(false)}
        />
      )}
      {dialogs}
    </>
  );
}

// Share group snapshots (manila-ui share_group_snapshots panel): the
// project's group snapshots with the create group, edit and delete actions.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { ShareGroupSnapshot } from "../../../lib/api/types/shares";
import { formatDateTime } from "../../../lib/format";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import {
  deleteShareGroupSnapshot,
  shareGroupSnapshotsQuery,
  shareWriteKeys,
} from "../api";
import { EditShareGroupSnapshotDialog } from "./dialogs/EditShareGroupSnapshotDialog";
import {
  availableShareGroupSnapshotActions,
  statusLabel,
  statusTone,
  type ShareGroupSnapshotActionId,
} from "../status";

const groupSnapshotsRoute = getRouteApi("/app/shares/share-group-snapshots");

/**
 * The project's share group snapshots. A row's "create share group" opens
 * the share groups page's create dialog with the snapshot as source.
 */
export function ShareGroupSnapshotsPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const snapshots = useQuery(shareGroupSnapshotsQuery(projectId));
  const search = useListSearch(groupSnapshotsRoute);
  const table = useQueryTable(snapshots, {
    noun: "share group snapshots",
    search,
    placeholder: "Search share group snapshots",
  });
  const [editing, setEditing] = useState<ShareGroupSnapshot | null>(null);
  const remove = useBulkAction<ShareGroupSnapshot, "delete">({
    noun: { one: "share group snapshot", many: "share group snapshots" },
    name: (snapshot) => snapshot.name || snapshot.id,
    getId: (snapshot) => snapshot.id,
    invalidates: shareWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (snapshot) => deleteShareGroupSnapshot(snapshot.id),
        body: <p>Share groups created from the snapshot are not affected.</p>,
        eligible: (snapshot) =>
          allows(availableShareGroupSnapshotActions(snapshot), "delete"),
        skippedWhy: "they are busy",
      },
    },
  });

  /** Runs one row menu action on `snapshot`. */
  const runAction = (
    id: ShareGroupSnapshotActionId,
    snapshot: ShareGroupSnapshot,
  ) => {
    if (id === "create-group") {
      void navigate({
        to: "/shares/share-groups",
        search: { create: true, snapshot: snapshot.id },
      });
    } else if (id === "edit") {
      setEditing(snapshot);
    } else {
      remove.run("delete", [snapshot]);
    }
  };

  const columns = useMemo<ColumnDef<ShareGroupSnapshot>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => row.name || row.id,
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.share_group_name ?? ""}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        hideBelow: "lg",
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatDateTime(row.created_at) || "",
        sortValue: (row) => row.created_at ?? "",
        hideBelow: "md",
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
        id: "source",
        label: "Source share group",
        cell: (row) =>
          row.share_group_id ? (
            <AppLink
              size="sm"
              to="/shares/share-groups/$groupId"
              params={{ groupId: row.share_group_id }}
            >
              {row.share_group_name || row.share_group_id}
            </AppLink>
          ) : (
            ""
          ),
        hideBelow: "md",
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Share group snapshots"
        crumbs={[{ label: "Project" }, { label: "Share" }]}
      />
      <DataTable
        id="share-group-snapshots"
        label="Share group snapshots"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...remove.tableProps}
        emptyBody={<p>Create one from a share group's actions.</p>}
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableShareGroupSnapshotActions(row), (id) =>
            runAction(id, row),
          )
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) =>
              !selected.some((snapshot) =>
                allows(availableShareGroupSnapshotActions(snapshot), "delete"),
              ),
            onAction: (selected) => remove.run("delete", selected),
          },
        ]}
      />
      {editing && (
        <EditShareGroupSnapshotDialog
          snapshot={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {remove.dialog}
    </>
  );
}

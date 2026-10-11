// Share groups and share group snapshots (manila-ui share_groups and
// share_group_snapshots panels), with one group's detail and members.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { ShareGroup, ShareGroupSnapshot } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { shareGroupRoute, shareGroupsRoute } from "../../app/router";
import {
  shareGroupQuery,
  shareGroupSnapshotsQuery,
  shareGroupsQuery,
  useDeleteShareGroup,
  useDeleteShareGroupSnapshot,
} from "./api";
import {
  CreateShareGroupDialog,
  CreateShareGroupSnapshotDialog,
  EditShareGroupDialog,
  EditShareGroupSnapshotDialog,
} from "./ShareGroupDialogs";
import { statusLabel, statusTone } from "./status";
import styles from "./Shares.module.scss";

type GroupDialog = { kind: "edit" | "snapshot"; group: ShareGroup } | null;

export function ShareGroupsPage() {
  const projectId = useProjectId();
  const search = shareGroupsRoute.useSearch();
  const navigate = useNavigate({ from: shareGroupsRoute.fullPath });
  const groups = useQuery(shareGroupsQuery(projectId));
  const remove = useDeleteShareGroup(projectId);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<GroupDialog>(null);
  const [deleting, setDeleting] = useState<ShareGroup[]>([]);
  const creating = search.create === true;
  const setCreating = (open: boolean) =>
    void navigate({
      search: open
        ? {
            create: true,
            ...(search.snapshot ? { snapshot: search.snapshot } : {}),
          }
        : {},
      replace: true,
    });

  const columns = useMemo<ColumnDef<ShareGroup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/shares/share-groups/$groupId"
            params={{ groupId: row.id }}
            className={styles.nameLink}
          >
            {row.name || row.id}
          </RouterLink>
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
  const rows = useMemo(
    () => filterRows(groups.data?.items ?? [], query, columns),
    [groups.data, query, columns],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((g) => remove.mutateAsync(g.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting share group ${deleting[0]?.name || deleting[0]?.id}.`
          : `Deleting ${deleting.length} share groups.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} share groups.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Share Groups"
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
          placeholder: "Search share groups",
        }}
        resetKey={query}
        emptyTitle={
          groups.data?.items.length
            ? "No share groups match"
            : "No share groups yet"
        }
        emptyBody={
          groups.data?.items.length === 0 ? (
            <p>A share group lets you snapshot several shares together.</p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "snapshot",
            label: "Create share group snapshot",
            isDisabled: !row.actions.includes("snapshot"),
            disabledReason: "The share group must be available.",
            onAction: () => setDialog({ kind: "snapshot", group: row }),
          },
          {
            id: "edit",
            label: "Edit share group",
            isDisabled: !row.actions.includes("edit"),
            disabledReason: "The share group is busy.",
            onAction: () => setDialog({ kind: "edit", group: row }),
          },
          {
            id: "delete",
            label: "Delete share group",
            tone: "danger",
            isDisabled: !row.actions.includes("delete"),
            disabledReason: "The share group is busy.",
            onAction: () => setDeleting([row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) =>
              selected.every((g) => !g.actions.includes("delete")),
            onAction: (selected) =>
              setDeleting(selected.filter((g) => g.actions.includes("delete"))),
          },
        ]}
      />
      {creating && (
        <CreateShareGroupDialog
          projectId={projectId}
          snapshotId={search.snapshot ?? null}
          onClose={() => setCreating(false)}
        />
      )}
      {dialog?.kind === "edit" && (
        <EditShareGroupDialog
          projectId={projectId}
          group={dialog.group}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "snapshot" && (
        <CreateShareGroupSnapshotDialog
          projectId={projectId}
          group={dialog.group}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete share group ${deleting[0]?.name || deleting[0]?.id}?`
            : `Delete ${deleting.length} share groups?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>The group must be empty. Its shares are not deleted.</p>
      </ConfirmDialog>
    </>
  );
}

export function ShareGroupDetailPage() {
  const projectId = useProjectId();
  const { groupId } = shareGroupRoute.useParams();
  const group = useQuery(shareGroupQuery(projectId, groupId));
  const [dialog, setDialog] = useState<"edit" | "snapshot" | null>(null);
  const data = group.data;
  return (
    <>
      <PageHeader
        title={data?.name || data?.id || "Share group"}
        crumbs={[
          { label: "Project" },
          { label: "Share" },
          { label: "Share Groups", href: "/shares/share-groups" },
        ]}
        actions={
          data ? (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("snapshot")}
                isDisabled={!data.actions.includes("snapshot")}
              >
                Create snapshot
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("edit")}
                isDisabled={!data.actions.includes("edit")}
              >
                Edit
              </Button>
            </div>
          ) : null
        }
      />
      {group.isPending ? (
        <SkeletonLines lines={8} />
      ) : group.isError ? (
        <ErrorState error={group.error} onRetry={() => group.refetch()} />
      ) : data ? (
        <div className={styles.grid}>
          <Panel title="Details" headingLevel={2}>
            <KeyValueList
              items={[
                {
                  label: "Status",
                  value: (
                    <StatusPill tone={statusTone(data.status)}>
                      {statusLabel(data.status)}
                    </StatusPill>
                  ),
                },
                { label: "Description", value: data.description || "-" },
                {
                  label: "Availability zone",
                  value: data.availability_zone ?? "-",
                },
                {
                  label: "Share group type",
                  value: data.share_group_type_id ?? "-",
                },
                {
                  label: "Share types",
                  value: data.share_types_detail.length
                    ? data.share_types_detail
                        .map((t) => t.name || t.id)
                        .join(", ")
                    : "-",
                },
                {
                  label: "Consistent snapshots",
                  value: data.consistent_snapshot_support ?? "-",
                },
                {
                  label: "Source snapshot",
                  value: data.source_share_group_snapshot_id ?? "-",
                },
                {
                  label: "Created",
                  value: formatDateTime(data.created_at) || "-",
                },
                { label: "ID", value: <code>{data.id}</code> },
              ]}
            />
          </Panel>
          <Panel title="Member shares" headingLevel={2}>
            {data.members.length === 0 ? (
              <p className={styles.muted}>No shares in this group yet.</p>
            ) : (
              <ul className={styles.list}>
                {data.members.map((share) => (
                  <li key={share.id}>
                    <RouterLink
                      to="/shares/shares/$shareId"
                      params={{ shareId: share.id }}
                    >
                      {share.name || share.id}
                    </RouterLink>{" "}
                    ({share.size} GiB, {statusLabel(share.status).toLowerCase()}
                    )
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
      {data && dialog === "edit" && (
        <EditShareGroupDialog
          projectId={projectId}
          group={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "snapshot" && (
        <CreateShareGroupSnapshotDialog
          projectId={projectId}
          group={data}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

export function ShareGroupSnapshotsPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const snapshots = useQuery(shareGroupSnapshotsQuery(projectId));
  const remove = useDeleteShareGroupSnapshot(projectId);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ShareGroupSnapshot | null>(null);
  const [deleting, setDeleting] = useState<ShareGroupSnapshot[]>([]);

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
        cell: (row) => (row.description ?? "").slice(0, 40),
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
            <RouterLink
              to="/shares/share-groups/$groupId"
              params={{ groupId: row.share_group_id }}
            >
              {row.share_group_name || row.share_group_id}
            </RouterLink>
          ) : (
            ""
          ),
        hideBelow: "md",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(snapshots.data?.items ?? [], query, columns),
    [snapshots.data, query, columns],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((s) => remove.mutateAsync(s.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting share group snapshot ${deleting[0]?.name || deleting[0]?.id}.`
          : `Deleting ${deleting.length} share group snapshots.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} share group snapshots.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Share Group Snapshots"
        crumbs={[{ label: "Project" }, { label: "Share" }]}
      />
      <DataTable
        id="share-group-snapshots"
        label="Share group snapshots"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={snapshots.isPending}
        isFetching={snapshots.isFetching}
        error={snapshots.error}
        onRetry={() => void snapshots.refetch()}
        onRefresh={() => void snapshots.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search share group snapshots",
        }}
        resetKey={query}
        emptyTitle={
          snapshots.data?.items.length
            ? "No share group snapshots match"
            : "No share group snapshots yet"
        }
        emptyBody={
          snapshots.data?.items.length === 0 ? (
            <p>Create one from a share group's actions.</p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "create-group",
            label: "Create share group from snapshot",
            isDisabled: !row.actions.includes("create_group"),
            disabledReason: "The snapshot must be available.",
            onAction: () =>
              void navigate({
                to: "/shares/share-groups",
                search: { create: true, snapshot: row.id },
              }),
          },
          {
            id: "edit",
            label: "Edit",
            isDisabled: !row.actions.includes("edit"),
            disabledReason: "The snapshot is busy.",
            onAction: () => setEditing(row),
          },
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: !row.actions.includes("delete"),
            disabledReason: "The snapshot is busy.",
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
      {editing && (
        <EditShareGroupSnapshotDialog
          projectId={projectId}
          snapshot={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete share group snapshot ${deleting[0]?.name || deleting[0]?.id}?`
            : `Delete ${deleting.length} share group snapshots?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>Share groups created from the snapshot are not affected.</p>
      </ConfirmDialog>
    </>
  );
}

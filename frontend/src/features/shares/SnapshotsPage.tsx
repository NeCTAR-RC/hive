// Share snapshots (manila-ui share_snapshots panel) and one snapshot's
// detail with its access rules when the share supports mounting them.
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
import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { ShareSnapshot } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { shareSnapshotRoute } from "../../app/router";
import {
  shareSnapshotQuery,
  shareSnapshotsQuery,
  useDeleteSnapshot,
  useSnapshotDenyAccess,
} from "./api";
import { EditSnapshotDialog, SnapshotAccessDialog } from "./SnapshotDialogs";
import { ruleStateTone, statusLabel, statusTone } from "./status";
import styles from "./Shares.module.scss";

export function SnapshotsPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const snapshots = useQuery(shareSnapshotsQuery(projectId));
  const remove = useDeleteSnapshot(projectId);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ShareSnapshot | null>(null);
  const [deleting, setDeleting] = useState<ShareSnapshot[]>([]);

  const columns = useMemo<ColumnDef<ShareSnapshot>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/shares/snapshots/$snapshotId"
            params={{ snapshotId: row.id }}
            className={styles.nameLink}
          >
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.share_name ?? ""}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => (row.description ?? "").slice(0, 40),
        hideBelow: "lg",
      },
      {
        id: "size",
        label: "Size",
        cell: (row) => (row.size === null ? "" : `${row.size} GiB`),
        sortValue: (row) => row.size ?? 0,
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
        label: "Source share",
        cell: (row) =>
          row.share_id ? (
            <RouterLink
              to="/shares/shares/$shareId"
              params={{ shareId: row.share_id }}
            >
              {row.share_name || row.share_id}
            </RouterLink>
          ) : (
            ""
          ),
        sortValue: (row) => row.share_name ?? "",
        hideBelow: "md",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(snapshots.data?.items ?? [], query, columns),
    [snapshots.data, query, columns],
  );
  const quota = snapshots.data?.quota ?? {};
  const maxSnaps = quota["maxTotalShareSnapshots"] ?? -1;
  const usedSnaps = quota["totalShareSnapshotsUsed"] ?? 0;
  const maxGb = quota["maxTotalSnapshotGigabytes"] ?? -1;
  const usedGb = quota["totalSnapshotGigabytesUsed"] ?? 0;

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((s) => remove.mutateAsync(s.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting snapshot ${deleting[0]?.name || deleting[0]?.id}.`
          : `Deleting ${deleting.length} snapshots.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} snapshots.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Share Snapshots"
        crumbs={[{ label: "Project" }, { label: "Share" }]}
      >
        {snapshots.data && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Snapshots"
              value={usedSnaps}
              max={maxSnaps}
              valueText={`${usedSnaps} of ${maxSnaps < 0 ? "unlimited" : maxSnaps} snapshots`}
            />
            <QuotaMeter
              label="Snapshot storage"
              value={usedGb}
              max={maxGb}
              valueText={`${usedGb} of ${maxGb < 0 ? "unlimited" : maxGb} GiB`}
            />
          </div>
        )}
      </PageHeader>
      <DataTable
        id="share-snapshots"
        label="Share snapshots"
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
          placeholder: "Search snapshots",
        }}
        resetKey={query}
        emptyTitle={
          snapshots.data?.items.length
            ? "No snapshots match"
            : "No share snapshots yet"
        }
        emptyBody={
          snapshots.data?.items.length === 0 ? (
            <p>
              Create a snapshot from a share's actions to keep a point-in-time
              copy.
            </p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "edit",
            label: "Edit snapshot",
            onAction: () => setEditing(row),
          },
          {
            id: "create-share",
            label: "Create share from snapshot",
            isDisabled: !row.actions.includes("create_share"),
            disabledReason: "The snapshot must be available.",
            onAction: () =>
              void navigate({
                to: "/shares/shares",
                search: { create: true, snapshot: row.id },
              }),
          },
          {
            id: "rules",
            label: "Manage snapshot rules",
            isDisabled: !row.actions.includes("rules"),
            disabledReason: "The share does not support mounting snapshots.",
            onAction: () =>
              void navigate({
                to: "/shares/snapshots/$snapshotId",
                params: { snapshotId: row.id },
              }),
          },
          {
            id: "delete",
            label: "Delete snapshot",
            tone: "danger",
            isDisabled: !row.actions.includes("delete"),
            disabledReason: "The snapshot cannot be deleted while it is busy.",
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
        <EditSnapshotDialog
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
            ? `Delete snapshot ${deleting[0]?.name || deleting[0]?.id}?`
            : `Delete ${deleting.length} snapshots?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>Shares created from the snapshot are not affected.</p>
      </ConfirmDialog>
    </>
  );
}

export function SnapshotDetailPage() {
  const projectId = useProjectId();
  const { snapshotId } = shareSnapshotRoute.useParams();
  const snapshot = useQuery(shareSnapshotQuery(projectId, snapshotId));
  const deny = useSnapshotDenyAccess(projectId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [denying, setDenying] = useState<{
    id: string;
    access_to?: string;
  } | null>(null);
  const data = snapshot.data;
  const rules = data?.access_rules ?? [];
  const columns = useMemo<
    ColumnDef<{
      id: string;
      access_type?: string;
      access_to?: string;
      state?: string;
    }>[]
  >(
    () => [
      {
        id: "to",
        label: "Access to",
        isRowHeader: true,
        cell: (row) => <span className={styles.mono}>{row.access_to}</span>,
      },
      { id: "type", label: "Type", cell: (row) => row.access_type ?? "" },
      {
        id: "state",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={ruleStateTone(row.state)}>
            {statusLabel(row.state)}
          </StatusPill>
        ),
      },
    ],
    [],
  );
  return (
    <>
      <PageHeader
        title={data?.name || data?.id || "Share snapshot"}
        crumbs={[
          { label: "Project" },
          { label: "Share" },
          { label: "Share Snapshots", href: "/shares/snapshots" },
        ]}
        actions={
          data ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => setEditing(true)}
            >
              Edit
            </Button>
          ) : null
        }
      />
      {snapshot.isPending ? (
        <SkeletonLines lines={8} />
      ) : snapshot.isError ? (
        <ErrorState error={snapshot.error} onRetry={() => snapshot.refetch()} />
      ) : data ? (
        <div className={styles.stack}>
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
                  {
                    label: "Size",
                    value: data.size === null ? "-" : `${data.size} GiB`,
                  },
                  {
                    label: "Source share",
                    value: data.share_id ? (
                      <RouterLink
                        to="/shares/shares/$shareId"
                        params={{ shareId: data.share_id }}
                      >
                        {data.share_name || data.share_id}
                      </RouterLink>
                    ) : (
                      "-"
                    ),
                  },
                  { label: "Description", value: data.description || "-" },
                  {
                    label: "Created",
                    value: formatDateTime(data.created_at) || "-",
                  },
                  { label: "ID", value: <code>{data.id}</code> },
                ]}
              />
            </Panel>
            {data.mount_snapshot_support && (
              <Panel title="Export locations" headingLevel={2}>
                {(data.export_locations ?? []).length === 0 ? (
                  <p className={styles.muted}>None</p>
                ) : (
                  <ul className={styles.list}>
                    {(data.export_locations ?? []).map((location, index) => (
                      <li key={location.id ?? index}>{location.path}</li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>
          {data.mount_snapshot_support && (
            <DataTable
              id="snapshot-rules"
              label="Snapshot access rules"
              columns={columns}
              rows={rules}
              getRowId={(row) => row.id}
              isLoading={false}
              isFetching={snapshot.isFetching}
              onRefresh={() => void snapshot.refetch()}
              toolbarActions={
                <Button
                  size="xs"
                  onPress={() => setAdding(true)}
                  isDisabled={
                    !["available", "in-use"].includes(
                      (data.status ?? "").toLowerCase(),
                    )
                  }
                >
                  Add rule
                </Button>
              }
              emptyTitle="No snapshot access rules"
              rowActions={(row) => [
                {
                  id: "delete",
                  label: "Delete rule",
                  tone: "danger",
                  onAction: () => setDenying(row),
                },
              ]}
            />
          )}
        </div>
      ) : null}
      {data && adding && (
        <SnapshotAccessDialog
          projectId={projectId}
          snapshot={data}
          onClose={() => setAdding(false)}
        />
      )}
      {data && editing && (
        <EditSnapshotDialog
          projectId={projectId}
          snapshot={data}
          onClose={() => setEditing(false)}
        />
      )}
      <ConfirmDialog
        isOpen={denying !== null}
        onOpenChange={(open) => !open && setDenying(null)}
        title={`Delete the rule for ${denying?.access_to}?`}
        confirmLabel="Delete"
        isPending={deny.isPending}
        error={deny.error}
        onConfirm={() => {
          if (!denying) return;
          deny.mutate(
            { snapshotId, accessId: denying.id },
            {
              onSuccess: () => {
                notify.success(
                  `Access for ${denying.access_to} is being removed.`,
                );
                setDenying(null);
              },
            },
          );
        }}
      >
        <p>Clients using this rule lose access to the snapshot.</p>
      </ConfirmDialog>
    </>
  );
}

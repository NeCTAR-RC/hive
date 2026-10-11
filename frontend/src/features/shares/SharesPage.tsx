// Shares (manila-ui shares panel): the project's shares with quota, and
// the create, edit, resize, revert, snapshot, rules and delete actions.
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
import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { Share } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { sharesRoute } from "../../app/router";
import { sharesQuery, useDeleteShare } from "./api";
import {
  CreateShareDialog,
  CreateSnapshotDialog,
  EditShareDialog,
  MetadataDialog,
  ResizeShareDialog,
  RevertShareDialog,
} from "./ShareDialogs";
import { statusLabel, statusTone } from "./status";
import styles from "./Shares.module.scss";

type Dialog = {
  kind: "edit" | "metadata" | "resize" | "revert" | "snapshot";
  share: Share;
} | null;

export function SharesPage() {
  const projectId = useProjectId();
  const search = sharesRoute.useSearch();
  const navigate = useNavigate({ from: sharesRoute.fullPath });
  const shares = useQuery(sharesQuery(projectId));
  const remove = useDeleteShare(projectId);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState<Share[]>([]);
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

  const columns = useMemo<ColumnDef<Share>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/shares/shares/$shareId"
            params={{ shareId: row.id }}
            className={styles.nameLink}
          >
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.description ?? ""} ${row.protocol ?? ""}`,
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
        id: "protocol",
        label: "Protocol",
        cell: (row) => row.protocol ?? "",
        sortValue: (row) => row.protocol ?? "",
        hideBelow: "md",
      },
      {
        id: "visibility",
        label: "Visibility",
        cell: (row) => (row.is_public ? "Public" : "Private"),
        hideBelow: "lg",
      },
      {
        id: "type",
        label: "Share type",
        cell: (row) => row.share_type ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(shares.data?.items ?? [], query, columns),
    [shares.data, query, columns],
  );
  const quota = shares.data?.quota ?? {};
  const maxShares = quota["maxTotalShares"] ?? -1;
  const usedShares = quota["totalSharesUsed"] ?? 0;
  const maxGb = quota["maxTotalShareGigabytes"] ?? -1;
  const usedGb = quota["totalShareGigabytesUsed"] ?? 0;

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((s) => remove.mutateAsync(s.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting share ${deleting[0]?.name || deleting[0]?.id}.`
          : `Deleting ${deleting.length} shares.`,
      );
    } else {
      notify.danger(`Could not delete ${failed} of ${deleting.length} shares.`);
    }
    setDeleting([]);
  };

  const disabled = (row: Share, action: string, reason: string) => ({
    isDisabled: !row.actions.includes(action),
    disabledReason: reason,
  });

  return (
    <>
      <PageHeader
        title="Shares"
        crumbs={[{ label: "Project" }, { label: "Share" }]}
        actions={
          <Button
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={shares.data ? !shares.data.can_create : false}
          >
            Create share
          </Button>
        }
      >
        {shares.data && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Shares"
              value={usedShares}
              max={maxShares}
              valueText={`${usedShares} of ${maxShares < 0 ? "unlimited" : maxShares} shares`}
            />
            <QuotaMeter
              label="Share storage"
              value={usedGb}
              max={maxGb}
              valueText={`${usedGb} of ${maxGb < 0 ? "unlimited" : maxGb} GiB`}
            />
            {!shares.data.can_create && shares.data.create_reason && (
              <p className={styles.muted}>{shares.data.create_reason}</p>
            )}
          </div>
        )}
      </PageHeader>
      <DataTable
        id="shares"
        label="Shares"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={shares.isPending}
        isFetching={shares.isFetching}
        error={shares.error}
        onRetry={() => void shares.refetch()}
        onRefresh={() => void shares.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search shares",
        }}
        resetKey={query}
        emptyTitle={
          shares.data?.items.length ? "No shares match" : "No shares yet"
        }
        emptyBody={
          shares.data?.items.length === 0 ? (
            <p>Create a share to mount a file system from several instances.</p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "edit",
            label: "Edit share",
            ...disabled(
              row,
              "edit",
              "The share can be edited once it is available.",
            ),
            onAction: () => setDialog({ kind: "edit", share: row }),
          },
          {
            id: "resize",
            label: "Resize share",
            ...disabled(
              row,
              "resize",
              "The share can be resized once it is available.",
            ),
            onAction: () => setDialog({ kind: "resize", share: row }),
          },
          {
            id: "revert",
            label: "Revert to snapshot",
            ...disabled(
              row,
              "revert",
              row.revert_to_snapshot_support
                ? "The share can be reverted once it is available."
                : "This share type does not support reverting to a snapshot.",
            ),
            onAction: () => setDialog({ kind: "revert", share: row }),
          },
          {
            id: "snapshot",
            label: "Create snapshot",
            ...disabled(
              row,
              "snapshot",
              "Snapshots are not available for this share right now.",
            ),
            onAction: () => setDialog({ kind: "snapshot", share: row }),
          },
          {
            id: "rules",
            label: "Manage rules",
            onAction: () =>
              void navigate({
                to: "/shares/shares/$shareId",
                params: { shareId: row.id },
                search: { tab: "rules" },
              }),
          },
          {
            id: "metadata",
            label: "Edit metadata",
            ...disabled(
              row,
              "metadata",
              "Metadata can be edited once the share is available.",
            ),
            onAction: () => setDialog({ kind: "metadata", share: row }),
          },
          {
            id: "delete",
            label: "Delete share",
            tone: "danger",
            ...disabled(
              row,
              "delete",
              row.has_snapshot
                ? "Delete the share's snapshots first."
                : "The share cannot be deleted while it is busy.",
            ),
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
      {creating && (
        <CreateShareDialog
          projectId={projectId}
          snapshotId={search.snapshot ?? null}
          onClose={() => setCreating(false)}
        />
      )}
      {dialog?.kind === "edit" && (
        <EditShareDialog
          projectId={projectId}
          share={dialog.share}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "metadata" && (
        <MetadataDialog
          projectId={projectId}
          share={dialog.share}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "resize" && (
        <ResizeShareDialog
          projectId={projectId}
          share={dialog.share}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "revert" && (
        <RevertShareDialog
          projectId={projectId}
          share={dialog.share}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "snapshot" && (
        <CreateSnapshotDialog
          projectId={projectId}
          share={dialog.share}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete share ${deleting[0]?.name || deleting[0]?.id}?`
            : `Delete ${deleting.length} shares?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>The data on the share is lost. This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}

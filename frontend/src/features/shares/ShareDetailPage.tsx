// One share: overview with export locations and metadata, and the access
// rules tab (manila-ui share detail and manage rules page).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, Button, TabItem, Tabs } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { CopyButton } from "../../components/CopyButton/CopyButton";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { ShareAccessRule, ShareDetail } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { shareRoute } from "../../app/router";
import {
  shareAccessQuery,
  shareQuery,
  useDeleteShare,
  useDenyAccess,
} from "./api";
import {
  AccessRuleDialog,
  CreateSnapshotDialog,
  EditShareDialog,
  MetadataDialog,
  ResizeShareDialog,
  RevertShareDialog,
} from "./ShareDialogs";
import { ruleStateTone, statusLabel, statusTone } from "./status";
import styles from "./Shares.module.scss";

type Dialog =
  "edit" | "metadata" | "resize" | "revert" | "snapshot" | "rule" | null;

export function ShareDetailPage() {
  const projectId = useProjectId();
  const { shareId } = shareRoute.useParams();
  const search = shareRoute.useSearch();
  const navigate = useNavigate({ from: shareRoute.fullPath });
  const share = useQuery(shareQuery(projectId, shareId));
  const remove = useDeleteShare(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState(false);
  const tab = search.tab ?? "overview";
  const selectTab = (key: React.Key) =>
    void navigate({
      search: key === "overview" ? {} : { tab: String(key) },
      replace: true,
    });
  const data = share.data;
  const can = (action: string) => Boolean(data?.actions.includes(action));

  return (
    <>
      <PageHeader
        title={data?.name || data?.id || "Share"}
        crumbs={[
          { label: "Project" },
          { label: "Share" },
          { label: "Shares", href: "/shares/shares" },
        ]}
        actions={
          data ? (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("edit")}
                isDisabled={!can("edit")}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("resize")}
                isDisabled={!can("resize")}
              >
                Resize
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("snapshot")}
                isDisabled={!can("snapshot")}
              >
                Create snapshot
              </Button>
              {data.revert_to_snapshot_support && (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => setDialog("revert")}
                  isDisabled={!can("revert")}
                >
                  Revert
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("metadata")}
                isDisabled={!can("metadata")}
              >
                Edit metadata
              </Button>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => setDeleting(true)}
                isDisabled={!can("delete")}
              >
                Delete
              </Button>
            </div>
          ) : null
        }
      />
      {share.isError ? (
        <ErrorState error={share.error} onRetry={() => share.refetch()} />
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={selectTab}
          aria-label="Share details"
        >
          <TabItem id="overview" title="Overview">
            {data ? <Overview share={data} /> : <SkeletonLines lines={10} />}
          </TabItem>
          <TabItem id="rules" title="Access rules">
            <Rules
              projectId={projectId}
              shareId={shareId}
              onAdd={() => setDialog("rule")}
            />
          </TabItem>
        </Tabs>
      )}
      {data && dialog === "edit" && (
        <EditShareDialog
          projectId={projectId}
          share={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "metadata" && (
        <MetadataDialog
          projectId={projectId}
          share={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "resize" && (
        <ResizeShareDialog
          projectId={projectId}
          share={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "revert" && (
        <RevertShareDialog
          projectId={projectId}
          share={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "snapshot" && (
        <CreateSnapshotDialog
          projectId={projectId}
          share={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "rule" && (
        <AccessRuleDialog
          projectId={projectId}
          share={data}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete share ${data?.name || data?.id}?`}
        confirmLabel="Delete"
        confirmText={data?.name ?? ""}
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(shareId, {
            onSuccess: () => {
              notify.success(`Deleting share ${data?.name || data?.id}.`);
              void navigate({ to: "/shares/shares" });
            },
          })
        }
      >
        <p>The data on the share is lost. This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}

function Overview({ share }: { share: ShareDetail }) {
  return (
    <div className={styles.grid}>
      {share.has_snapshot && (
        <Alert tone="info" role="status">
          This share has snapshots. Delete them before deleting the share.
        </Alert>
      )}
      <Panel title="Details" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Status",
              value: (
                <StatusPill tone={statusTone(share.status)}>
                  {statusLabel(share.status)}
                </StatusPill>
              ),
            },
            {
              label: "Size",
              value: share.size === null ? "-" : `${share.size} GiB`,
            },
            { label: "Protocol", value: share.protocol ?? "-" },
            { label: "Share type", value: share.share_type ?? "-" },
            {
              label: "Availability zone",
              value: share.availability_zone ?? "-",
            },
            {
              label: "Visibility",
              value: share.is_public ? "Public" : "Private",
            },
            { label: "Description", value: share.description || "-" },
            {
              label: "Created",
              value: formatDateTime(share.created_at) || "-",
            },
            { label: "ID", value: <code>{share.id}</code> },
          ]}
        />
      </Panel>
      <Panel title="Export locations" headingLevel={3}>
        {share.export_locations.length === 0 ? (
          <p className={styles.muted}>
            Not available until the share is ready.
          </p>
        ) : (
          <ul className={styles.list}>
            {share.export_locations.map((location) => (
              <li key={location.id ?? location.path ?? ""}>
                {location.path}
                {location.preferred ? " (preferred)" : ""}{" "}
                {location.path && <CopyButton text={location.path} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Capabilities" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Snapshots",
              value: share.snapshot_support ? "Supported" : "Not supported",
            },
            {
              label: "Revert to snapshot",
              value: share.revert_to_snapshot_support
                ? "Supported"
                : "Not supported",
            },
            {
              label: "Mountable snapshots",
              value: share.mount_snapshot_support
                ? "Supported"
                : "Not supported",
            },
            { label: "Share group", value: share.share_group_id ?? "-" },
            { label: "Source snapshot", value: share.snapshot_id ?? "-" },
            { label: "Task state", value: share.task_state ?? "-" },
          ]}
        />
      </Panel>
      <Panel title="Metadata" headingLevel={3}>
        {Object.keys(share.metadata).length === 0 ? (
          <p className={styles.muted}>None</p>
        ) : (
          <KeyValueList
            items={Object.entries(share.metadata).map(([key, value]) => ({
              label: key,
              value: <code>{value}</code>,
            }))}
          />
        )}
      </Panel>
    </div>
  );
}

function Rules({
  projectId,
  shareId,
  onAdd,
}: {
  projectId: string;
  shareId: string;
  onAdd: () => void;
}) {
  const access = useQuery(shareAccessQuery(projectId, shareId));
  const deny = useDenyAccess(projectId);
  const [deleting, setDeleting] = useState<ShareAccessRule | null>(null);
  const columns = useMemo<ColumnDef<ShareAccessRule>[]>(
    () => [
      {
        id: "to",
        label: "Access to",
        isRowHeader: true,
        cell: (row) => <span className={styles.mono}>{row.access_to}</span>,
        sortValue: (row) => row.access_to ?? "",
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.access_type ?? "",
        sortValue: (row) => row.access_type ?? "",
      },
      { id: "level", label: "Level", cell: (row) => row.access_level ?? "" },
      {
        id: "state",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={ruleStateTone(row.state)}>
            {statusLabel(row.state)}
          </StatusPill>
        ),
        sortValue: (row) => row.state ?? "",
      },
      {
        id: "key",
        label: "Access key",
        cell: (row) =>
          row.access_key ? (
            <span className={styles.mono}>
              {row.access_key} <CopyButton text={row.access_key} />
            </span>
          ) : (
            ""
          ),
        hideBelow: "md",
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatDateTime(row.created_at) || "",
        sortValue: (row) => row.created_at ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="share-rules"
        label="Access rules"
        columns={columns}
        rows={access.data?.items}
        getRowId={(row) => row.id}
        isLoading={access.isPending}
        isFetching={access.isFetching}
        error={access.error}
        onRetry={() => void access.refetch()}
        onRefresh={() => void access.refetch()}
        toolbarActions={
          <Button size="xs" onPress={onAdd} isDisabled={!access.data?.can_add}>
            Add rule
          </Button>
        }
        emptyTitle="No access rules"
        emptyBody={
          <p>Nothing can mount the share until a rule grants access.</p>
        }
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete rule",
            tone: "danger",
            onAction: () => setDeleting(row),
          },
        ]}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete the rule for ${deleting?.access_to}?`}
        confirmLabel="Delete"
        isPending={deny.isPending}
        error={deny.error}
        onConfirm={() => {
          if (!deleting) return;
          deny.mutate(
            { shareId, accessId: deleting.id },
            {
              onSuccess: () => {
                notify.success(
                  `Access for ${deleting.access_to} is being removed.`,
                );
                setDeleting(null);
              },
            },
          );
        }}
      >
        <p>Clients using this rule lose access to the share.</p>
      </ConfirmDialog>
    </>
  );
}

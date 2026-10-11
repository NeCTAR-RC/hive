import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import {
  DataTable,
  RowActionsMenu,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { ApiError } from "../../../lib/api/client";
import type { VolumeSnapshot } from "../../../lib/api/types";
import { formatDateTime, formatGb } from "../../../lib/format";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { volumeRoute } from "../../../app/router";
import {
  attachableInstancesQuery,
  snapshotsQuery,
  volumeLimitsQuery,
  volumeQuery,
} from "../api";
import { useSnapshotActions } from "../snapshots/SnapshotActions";
import {
  attachmentLabel,
  availableSnapshotActions,
  availableVolumeActions,
  statusLabel,
  statusTone,
} from "../status";
import { useVolumeActions } from "./VolumeActions";
import styles from "./VolumeDetailPage.module.scss";

const CRUMBS = [
  { label: "Project" },
  { label: "Volumes" },
  { label: "Volumes", href: "/storage/volumes" },
];

export function VolumeDetailPage() {
  const projectId = useProjectId();
  const { volumeId } = volumeRoute.useParams();
  const navigate = useNavigate();
  const volume = useQuery(volumeQuery(projectId, volumeId));
  const instances = useQuery(attachableInstancesQuery(projectId));
  const snapshots = useQuery(snapshotsQuery(projectId));
  const limits = useQuery(volumeLimitsQuery(projectId));
  const { run, dialogs } = useVolumeActions(projectId);
  const snapshotActions = useSnapshotActions(projectId);

  const instanceNames = useMemo(
    () =>
      new Map(
        (instances.data?.items ?? []).map((i) => [i.id, i.name] as const),
      ),
    [instances.data],
  );
  const ownSnapshots = useMemo(
    () => (snapshots.data?.items ?? []).filter((s) => s.volume_id === volumeId),
    [snapshots.data, volumeId],
  );
  const snapshotColumns = useMemo<ColumnDef<VolumeSnapshot>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/storage/snapshots/$snapshotId"
            params={{ snapshotId: row.id }}
          >
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name || row.id,
      },
      {
        id: "size",
        label: "Size",
        cell: (row) => formatGb(row.size_gb),
        sortValue: (row) => row.size_gb ?? 0,
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatDateTime(row.created_at),
        sortValue: (row) => row.created_at ?? "",
        hideBelow: "md",
      },
    ],
    [],
  );

  if (volume.isError) {
    const notFound =
      volume.error instanceof ApiError && volume.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Volume not found" : "Volume"}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no volume <code>{volumeId}</code> in this project.{" "}
            <RouterLink to="/storage/volumes" search={{}}>
              Back to volumes
            </RouterLink>
          </p>
        ) : (
          <ErrorState
            error={volume.error}
            onRetry={() => void volume.refetch()}
          />
        )}
      </>
    );
  }

  const data = volume.data;
  const title = data ? data.name || data.id : "Volume";
  return (
    <>
      <PageHeader
        title={title}
        crumbs={CRUMBS}
        actions={
          data && (
            <RowActionsMenu
              actions={availableVolumeActions(data, limits.data).map(
                (action) => ({
                  id: action.id,
                  label: action.label,
                  onAction: () => run(data, action.id),
                  isDisabled: action.isDisabled,
                  ...(action.disabledReason
                    ? { disabledReason: action.disabledReason }
                    : {}),
                  ...(action.tone ? { tone: action.tone } : {}),
                }),
              )}
            />
          )
        }
      />
      <div className={styles.grid}>
        <Panel title="Overview">
          {!data ? (
            <SkeletonLines lines={8} />
          ) : (
            <KeyValueList
              items={[
                { label: "Name", value: data.name },
                { label: "ID", value: <code>{data.id}</code> },
                { label: "Description", value: data.description },
                {
                  label: "Status",
                  value: (
                    <StatusPill tone={statusTone(data.status)}>
                      {statusLabel(data.status)}
                    </StatusPill>
                  ),
                },
                { label: "Size", value: formatGb(data.size_gb) },
                { label: "Type", value: data.volume_type },
                { label: "Bootable", value: data.bootable ? "Yes" : "No" },
                { label: "Encrypted", value: data.encrypted ? "Yes" : "No" },
                {
                  label: "Availability zone",
                  value: data.availability_zone,
                },
                {
                  label: "Source",
                  value: data.image ? (
                    <>
                      Image{" "}
                      <RouterLink
                        to="/compute/images/$imageId"
                        params={{ imageId: data.image.id }}
                      >
                        {data.image.name ?? data.image.id}
                      </RouterLink>
                    </>
                  ) : data.snapshot_id ? (
                    <>
                      Snapshot{" "}
                      <RouterLink
                        to="/storage/snapshots/$snapshotId"
                        params={{ snapshotId: data.snapshot_id }}
                      >
                        {data.snapshot_id}
                      </RouterLink>
                    </>
                  ) : data.source_volume_id ? (
                    <>
                      Volume{" "}
                      <RouterLink
                        to="/storage/volumes/$volumeId"
                        params={{ volumeId: data.source_volume_id }}
                      >
                        {data.source_volume_id}
                      </RouterLink>
                    </>
                  ) : (
                    "Empty volume"
                  ),
                },
                { label: "Created", value: formatDateTime(data.created_at) },
                {
                  label: "Metadata",
                  value:
                    Object.keys(data.metadata).length === 0 ? null : (
                      <ul className={styles.metadata}>
                        {Object.entries(data.metadata).map(([key, value]) => (
                          <li key={key}>
                            <code>{key}</code> = <code>{value}</code>
                          </li>
                        ))}
                      </ul>
                    ),
                },
              ]}
            />
          )}
        </Panel>
        <Panel
          title="Attachments"
          actions={
            data && (
              <Button
                variant="secondary"
                size="xs"
                onPress={() => run(data, "attachments")}
                isDisabled={!["available", "in-use"].includes(data.status)}
              >
                Manage attachments
              </Button>
            )
          }
        >
          {!data ? (
            <SkeletonLines lines={2} />
          ) : data.attachments.length === 0 ? (
            <p className={styles.muted}>Not attached to any instance.</p>
          ) : (
            <ul className={styles.attachments}>
              {data.attachments.map((attachment) => (
                <li key={attachment.id ?? attachment.server_id ?? ""}>
                  {attachment.server_id ? (
                    <RouterLink
                      to="/compute/instances/$instanceId"
                      params={{ instanceId: attachment.server_id }}
                    >
                      {attachmentLabel(
                        attachment,
                        instanceNames.get(attachment.server_id),
                      )}
                    </RouterLink>
                  ) : (
                    attachmentLabel(attachment, undefined)
                  )}
                  {attachment.attached_at && (
                    <span className={styles.muted}>
                      {" "}
                      since {formatDateTime(attachment.attached_at)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Snapshots"
          actions={
            data && (
              <Button
                variant="secondary"
                size="xs"
                onPress={() => run(data, "snapshot")}
                isDisabled={!["available", "in-use"].includes(data.status)}
              >
                Create snapshot
              </Button>
            )
          }
        >
          <DataTable
            id="volume-snapshots"
            label="Snapshots of this volume"
            columns={snapshotColumns}
            rows={snapshots.data ? ownSnapshots : undefined}
            getRowId={(row) => row.id}
            isLoading={snapshots.isPending}
            isFetching={snapshots.isFetching}
            error={snapshots.error}
            onRetry={() => void snapshots.refetch()}
            emptyTitle="No snapshots"
            emptyBody={
              <p>
                A snapshot is a point-in-time copy you can create new volumes
                from.
              </p>
            }
            rowActions={(row) =>
              availableSnapshotActions(row).map((action) => ({
                id: action.id,
                label: action.label,
                onAction: () => snapshotActions.run(row, action.id),
                isDisabled: action.isDisabled,
                ...(action.disabledReason
                  ? { disabledReason: action.disabledReason }
                  : {}),
                ...(action.tone ? { tone: action.tone } : {}),
              }))
            }
          />
        </Panel>
      </div>
      {dialogs}
      {snapshotActions.dialogs}
      {data && !data.bootable && data.status === "available" && (
        <p className={styles.hint}>
          Want to boot from this volume?{" "}
          <Button variant="link" size="sm" onPress={() => run(data, "edit")}>
            Mark it bootable
          </Button>{" "}
          first, then launch it as an instance.
        </p>
      )}
      {data && data.bootable && data.status === "available" && (
        <p className={styles.hint}>
          <Button
            variant="link"
            size="sm"
            onPress={() =>
              void navigate({
                to: "/compute/instances/launch",
                search: { source: `volume:${data.id}` },
              })
            }
          >
            Launch an instance from this volume
          </Button>
        </p>
      )}
    </>
  );
}

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Alert, Button } from "@ardc-ui/react";
import { DataTable } from "../../../components/DataTable/DataTable";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { Panel } from "../../../components/Panel/Panel";
import { allows, toRowActions } from "../../../lib/actions";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { snapshotsQuery, volumeLimitsQuery, volumeQuery } from "../api";
import { instancesQuery } from "../../compute/api";
import { useSnapshotActions } from "../snapshots/SnapshotActions";
import { availableSnapshotActions, availableVolumeActions } from "../status";
import { StatusMeta } from "../StatusMeta";
import { useVolumeActions } from "./VolumeActions";
import { VolumeAttachments } from "./VolumeAttachments";
import styles from "./VolumeDetailPage.module.scss";
import { VolumeOverview } from "./VolumeOverview";
import { volumeSnapshotColumns } from "./volumeSnapshotColumns";

const volumeRoute = getRouteApi("/app/storage/volumes/$volumeId");

const CRUMBS = [
  { label: "Project" },
  { label: "Volumes" },
  { label: "Volumes", href: "/storage/volumes" },
];

/**
 * One volume: its status under the title, why it failed when Cinder says,
 * its overview, attachments and snapshots, with every volume action in the
 * header menu and hints to boot from it.
 */
export function VolumeDetailPage() {
  const projectId = useProjectId();
  const { volumeId } = volumeRoute.useParams();
  const volume = useQuery(volumeQuery(projectId, volumeId));
  const instances = useQuery(instancesQuery(projectId));
  const snapshots = useQuery(snapshotsQuery(projectId));
  const limits = useQuery(volumeLimitsQuery(projectId));
  const { run, dialogs } = useVolumeActions();
  const snapshotActions = useSnapshotActions();

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

  return (
    <>
      <DetailPage
        query={volume}
        noun="volume"
        id={volumeId}
        crumbs={CRUMBS}
        backTo={{ label: "volumes", href: "/storage/volumes" }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(
              availableVolumeActions(data, limits.data),
              (id) => run(id, [data]),
            )}
          />
        )}
        meta={(data) => <StatusMeta status={data.status} />}
      >
        {(data) => {
          const offers = availableVolumeActions(data, limits.data);
          return (
            <div className={styles.page}>
              {data.fault && (
                <Alert tone="danger" role="alert">
                  <strong>Fault:</strong> {data.fault.message}
                  {data.fault.created
                    ? ` (${formatDateTime(data.fault.created)})`
                    : ""}
                </Alert>
              )}
              <div className={styles.grid}>
                <VolumeOverview volume={data} />
                <VolumeAttachments
                  volume={data}
                  instanceNames={instanceNames}
                  canManage={allows(offers, "attachments")}
                  onManage={() => run("attachments", [data])}
                />
                <Panel
                  title="Snapshots"
                  actions={
                    <Button
                      variant="secondary"
                      size="xs"
                      onPress={() => run("snapshot", [data])}
                      isDisabled={!allows(offers, "snapshot")}
                    >
                      Create snapshot
                    </Button>
                  }
                >
                  <DataTable
                    id="volume-detail-snapshots"
                    label="Snapshots of this volume"
                    columns={volumeSnapshotColumns}
                    rows={snapshots.data ? ownSnapshots : undefined}
                    getRowId={(row) => row.id}
                    isLoading={snapshots.isPending}
                    isFetching={snapshots.isFetching}
                    error={snapshots.error}
                    onRetry={() => void snapshots.refetch()}
                    {...snapshotActions.tableProps}
                    emptyTitle="No snapshots"
                    emptyBody={
                      <p>
                        A snapshot is a point-in-time copy you can create new
                        volumes from.
                      </p>
                    }
                    rowActions={(row) =>
                      toRowActions(availableSnapshotActions(row), (id) =>
                        snapshotActions.run(id, [row]),
                      )
                    }
                  />
                </Panel>
              </div>
              {!data.bootable && data.status === "available" && (
                <p className={styles.hint}>
                  Want to boot from this volume?{" "}
                  <Button
                    variant="link"
                    size="xs"
                    onPress={() => run("edit", [data])}
                  >
                    Mark it bootable
                  </Button>{" "}
                  first, then launch it as an instance.
                </p>
              )}
              {data.bootable && data.status === "available" && (
                <p className={styles.hint}>
                  <Button
                    variant="link"
                    size="xs"
                    onPress={() => run("launch", [data])}
                  >
                    Launch an instance from this volume
                  </Button>
                </p>
              )}
            </div>
          );
        }}
      </DetailPage>
      {dialogs}
      {snapshotActions.dialogs}
    </>
  );
}

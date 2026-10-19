import { useQuery } from "@tanstack/react-query";
import { RowActionsMenu } from "../../../components/DataTable/DataTable";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { ApiError } from "../../../lib/api/client";
import { formatDateTime, formatGb } from "../../../lib/format";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { snapshotRoute } from "../../../app/router";
import { snapshotQuery } from "../api";
import { availableSnapshotActions, statusLabel, statusTone } from "../status";
import { useSnapshotActions } from "./SnapshotActions";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

const CRUMBS = [
  { label: "Project" },
  { label: "Volumes" },
  { label: "Snapshots", href: "/storage/snapshots" },
];

export function SnapshotDetailPage() {
  const projectId = useProjectId();
  const { snapshotId } = snapshotRoute.useParams();
  const snapshot = useQuery(snapshotQuery(projectId, snapshotId));
  const { run, dialogs } = useSnapshotActions(projectId);

  if (snapshot.isError) {
    const notFound =
      snapshot.error instanceof ApiError && snapshot.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Snapshot not found" : "Snapshot"}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no volume snapshot <code>{snapshotId}</code> in this
            project.{" "}
            <RouteLink to="/storage/snapshots" search={{}}>
              Back to snapshots
            </RouteLink>
          </p>
        ) : (
          <ErrorState
            error={snapshot.error}
            onRetry={() => void snapshot.refetch()}
          />
        )}
      </>
    );
  }

  const data = snapshot.data;
  return (
    <>
      <PageHeader
        title={data ? data.name || data.id : "Snapshot"}
        crumbs={CRUMBS}
        actions={
          data && (
            <RowActionsMenu
              actions={availableSnapshotActions(data).map((action) => ({
                id: action.id,
                label: action.label,
                onAction: () => run(data, action.id),
                isDisabled: action.isDisabled,
                ...(action.disabledReason
                  ? { disabledReason: action.disabledReason }
                  : {}),
                ...(action.tone ? { tone: action.tone } : {}),
              }))}
            />
          )
        }
      />
      <Panel title="Overview">
        {!data ? (
          <SkeletonLines lines={7} />
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
              {
                label: "Volume",
                value: data.volume_id ? (
                  <RouteLink
                    to="/storage/volumes/$volumeId"
                    params={{ volumeId: data.volume_id }}
                  >
                    {data.volume_name || data.volume_id}
                  </RouteLink>
                ) : null,
              },
              { label: "Progress", value: data.progress },
              { label: "Created", value: formatDateTime(data.created_at) },
              { label: "Updated", value: formatDateTime(data.updated_at) },
            ]}
          />
        )}
      </Panel>
      {dialogs}
    </>
  );
}

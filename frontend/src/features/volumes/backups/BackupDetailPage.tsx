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
import { backupRoute } from "../../../app/router";
import { backupQuery } from "../api";
import { availableBackupActions, statusLabel, statusTone } from "../status";
import { useBackupActions } from "./BackupActions";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

const CRUMBS = [
  { label: "Project" },
  { label: "Volumes" },
  { label: "Backups", href: "/storage/backups" },
];

export function BackupDetailPage() {
  const projectId = useProjectId();
  const { backupId } = backupRoute.useParams();
  const backup = useQuery(backupQuery(projectId, backupId));
  const { run, dialogs } = useBackupActions(projectId);

  if (backup.isError) {
    const notFound =
      backup.error instanceof ApiError && backup.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Backup not found" : "Backup"}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no volume backup <code>{backupId}</code> in this project.{" "}
            <RouteLink to="/storage/backups" search={{}}>
              Back to backups
            </RouteLink>
          </p>
        ) : (
          <ErrorState
            error={backup.error}
            onRetry={() => void backup.refetch()}
          />
        )}
      </>
    );
  }

  const data = backup.data;
  return (
    <>
      <PageHeader
        title={data ? data.name || data.id : "Backup"}
        crumbs={CRUMBS}
        actions={
          data && (
            <RowActionsMenu
              actions={availableBackupActions(data).map((action) => ({
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
              { label: "Availability zone", value: data.availability_zone },
              {
                label: "Volume",
                value: data.volume_id ? (
                  data.volume_name ? (
                    <RouteLink
                      to="/storage/volumes/$volumeId"
                      params={{ volumeId: data.volume_id }}
                    >
                      {data.volume_name}
                    </RouteLink>
                  ) : (
                    `Deleted (${data.volume_id})`
                  )
                ) : null,
              },
              {
                label: "Snapshot",
                value: data.snapshot_id ? (
                  data.snapshot_name ? (
                    <RouteLink
                      to="/storage/snapshots/$snapshotId"
                      params={{ snapshotId: data.snapshot_id }}
                    >
                      {data.snapshot_name}
                    </RouteLink>
                  ) : (
                    `Deleted (${data.snapshot_id})`
                  )
                ) : null,
              },
              { label: "Container", value: data.container },
              {
                label: "Incremental",
                value: data.is_incremental ? "Yes" : "No",
              },
              {
                label: "Has dependent backups",
                value: data.has_dependent_backups ? "Yes" : "No",
              },
              {
                label: "Data as at",
                value: formatDateTime(data.data_timestamp),
              },
              { label: "Failure reason", value: data.fail_reason },
              { label: "Created", value: formatDateTime(data.created_at) },
            ]}
          />
        )}
      </Panel>
      {dialogs}
    </>
  );
}

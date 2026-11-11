import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { toRowActions } from "../../../lib/actions";
import { formatDateTime, formatGb } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { backupQuery } from "../api";
import { availableBackupActions } from "../status";
import { StatusMeta } from "../StatusMeta";
import { useBackupActions } from "./BackupActions";

const backupRoute = getRouteApi("/app/storage/backups/$backupId");

const CRUMBS = [
  { label: "Project" },
  { label: "Volumes" },
  { label: "Backups", href: "/storage/backups" },
];

/**
 * One volume backup: its status under the title, its overview, and its
 * actions in the header menu.
 */
export function BackupDetailPage() {
  const projectId = useProjectId();
  const { backupId } = backupRoute.useParams();
  const backup = useQuery(backupQuery(projectId, backupId));
  const { run, dialogs } = useBackupActions();

  return (
    <>
      <DetailPage
        query={backup}
        noun="volume backup"
        id={backupId}
        crumbs={CRUMBS}
        backTo={{ label: "backups", href: "/storage/backups" }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(availableBackupActions(data), (id) =>
              run(id, [data]),
            )}
          />
        )}
        meta={(data) => <StatusMeta status={data.status} />}
      >
        {(data) => (
          <Panel title="Overview">
            <KeyValueList
              items={[
                { label: "Name", value: data.name },
                { label: "ID", value: <code>{data.id}</code> },
                { label: "Description", value: data.description },
                { label: "Size", value: formatGb(data.size_gb) },
                { label: "Availability zone", value: data.availability_zone },
                {
                  label: "Volume",
                  value: data.volume_id ? (
                    data.volume_name ? (
                      <AppLink
                        to="/storage/volumes/$volumeId"
                        params={{ volumeId: data.volume_id }}
                      >
                        {data.volume_name}
                      </AppLink>
                    ) : (
                      `Deleted (${data.volume_id})`
                    )
                  ) : null,
                },
                {
                  label: "Snapshot",
                  value: data.snapshot_id ? (
                    data.snapshot_name ? (
                      <AppLink
                        to="/storage/snapshots/$snapshotId"
                        params={{ snapshotId: data.snapshot_id }}
                      >
                        {data.snapshot_name}
                      </AppLink>
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
          </Panel>
        )}
      </DetailPage>
      {dialogs}
    </>
  );
}

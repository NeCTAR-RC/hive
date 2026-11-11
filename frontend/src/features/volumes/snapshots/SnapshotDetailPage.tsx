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
import { snapshotQuery } from "../api";
import { MetadataList } from "../MetadataList";
import { availableSnapshotActions } from "../status";
import { StatusMeta } from "../StatusMeta";
import { useSnapshotActions } from "./SnapshotActions";

const snapshotRoute = getRouteApi("/app/storage/snapshots/$snapshotId");

const CRUMBS = [
  { label: "Project" },
  { label: "Volumes" },
  { label: "Snapshots", href: "/storage/snapshots" },
];

/**
 * One volume snapshot: its status under the title, its overview with its
 * metadata, and its actions in the header menu.
 */
export function SnapshotDetailPage() {
  const projectId = useProjectId();
  const { snapshotId } = snapshotRoute.useParams();
  const snapshot = useQuery(snapshotQuery(projectId, snapshotId));
  const { run, dialogs } = useSnapshotActions();

  return (
    <>
      <DetailPage
        query={snapshot}
        noun="volume snapshot"
        id={snapshotId}
        crumbs={CRUMBS}
        backTo={{ label: "snapshots", href: "/storage/snapshots" }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(availableSnapshotActions(data), (id) =>
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
                {
                  label: "Volume",
                  value: data.volume_id ? (
                    <AppLink
                      to="/storage/volumes/$volumeId"
                      params={{ volumeId: data.volume_id }}
                    >
                      {data.volume_name || data.volume_id}
                    </AppLink>
                  ) : null,
                },
                { label: "Progress", value: data.progress },
                { label: "Created", value: formatDateTime(data.created_at) },
                { label: "Updated", value: formatDateTime(data.updated_at) },
                {
                  label: "Metadata",
                  value:
                    Object.keys(data.metadata).length === 0 ? null : (
                      <MetadataList metadata={data.metadata} />
                    ),
                },
              ]}
            />
          </Panel>
        )}
      </DetailPage>
      {dialogs}
    </>
  );
}

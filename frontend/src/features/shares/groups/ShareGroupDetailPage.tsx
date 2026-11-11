// One share group (manila-ui share_groups panel): its details and its
// member shares.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../lib/actions";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { shareGroupQuery } from "../api";
import { useShareGroupActions } from "./ShareGroupActions";
import { availableShareGroupActions, statusLabel, statusTone } from "../status";
import styles from "../Shares.module.scss";

const shareGroupRoute = getRouteApi("/app/shares/share-groups/$groupId");

const GROUP_CRUMBS = [
  { label: "Project" },
  { label: "Share" },
  { label: "Share groups", href: "/shares/share-groups" },
];

/**
 * One share group's detail page, with the group's actions in the header;
 * deleting the group goes back to the list.
 */
export function ShareGroupDetailPage() {
  const projectId = useProjectId();
  const { groupId } = shareGroupRoute.useParams();
  const navigate = useNavigate();
  const group = useQuery(shareGroupQuery(projectId, groupId));
  const { run, dialogs } = useShareGroupActions(
    () => void navigate({ to: "/shares/share-groups" }),
  );
  return (
    <>
      <DetailPage
        query={group}
        noun="share group"
        id={groupId}
        crumbs={GROUP_CRUMBS}
        backTo={{ label: "share groups", href: "/shares/share-groups" }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(availableShareGroupActions(data), (id) =>
              run(id, [data]),
            )}
          />
        )}
      >
        {(data) => (
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
                  { label: "Description", value: data.description },
                  {
                    label: "Availability zone",
                    value: data.availability_zone,
                  },
                  {
                    label: "Share group type",
                    value: data.share_group_type_id,
                  },
                  {
                    label: "Share types",
                    value: data.share_types_detail
                      .map((t) => t.name || t.id)
                      .join(", "),
                  },
                  {
                    label: "Consistent snapshots",
                    value: data.consistent_snapshot_support,
                  },
                  {
                    label: "Source snapshot",
                    value: data.source_share_group_snapshot_id,
                  },
                  {
                    label: "Created",
                    value: formatDateTime(data.created_at),
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
                      <AppLink
                        to="/shares/shares/$shareId"
                        params={{ shareId: share.id }}
                      >
                        {share.name || share.id}
                      </AppLink>{" "}
                      ({share.size} GiB,{" "}
                      {statusLabel(share.status).toLowerCase()})
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </DetailPage>
      {dialogs}
    </>
  );
}

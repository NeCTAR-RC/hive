import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { toRowActions } from "../../../lib/actions";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { instancesQuery, serverGroupsQuery } from "../api";
import { POLICY_LABELS } from "./policies";
import { RelatedList, RelatedRow } from "../RelatedList";
import { useServerGroupActions } from "./ServerGroupActions";
import { availableServerGroupActions } from "./status";
import styles from "./ServerGroupDetailPage.module.scss";

const serverGroupRoute = getRouteApi("/app/compute/server-groups/$groupId");

const CRUMBS = [
  { label: "Project" },
  { label: "Compute" },
  { label: "Server groups", href: "/compute/server-groups" },
];

/**
 * A server group's page: its policy and member instances, with the same
 * actions as its row in the list; deleting it returns to the list.
 */
export function ServerGroupDetailPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const { groupId } = serverGroupRoute.useParams();
  const groups = useQuery(serverGroupsQuery(projectId));
  const instances = useQuery(instancesQuery(projectId));
  const names = new Map(
    (instances.data?.items ?? []).map((i) => [i.id, i.name]),
  );
  const actions = useServerGroupActions(
    () => void navigate({ to: "/compute/server-groups", search: {} }),
  );

  return (
    <>
      <DetailPage
        query={groups}
        select={(data) => data.items.find((g) => g.id === groupId)}
        noun="server group"
        id={groupId}
        crumbs={CRUMBS}
        backTo={{ label: "server groups", href: "/compute/server-groups" }}
        title={(group) => group.name}
        actions={(group) => (
          <RowActionsMenu
            actions={toRowActions(availableServerGroupActions(group), (id) =>
              actions.run(id, [group]),
            )}
          />
        )}
      >
        {(group) => (
          <div className={styles.grid}>
            <Panel title="Server group">
              <KeyValueList
                items={[
                  { label: "Name", value: group.name },
                  { label: "ID", value: <code>{group.id}</code> },
                  {
                    label: "Policy",
                    value: POLICY_LABELS[group.policy] ?? group.policy,
                  },
                ]}
              />
            </Panel>
            <Panel title="Members">
              {group.members.length === 0 ? (
                <p className={styles.muted}>No instances are in this group.</p>
              ) : (
                <RelatedList>
                  {group.members.map((id) => (
                    <RelatedRow key={id}>
                      <AppLink
                        to="/compute/instances/$instanceId"
                        params={{ instanceId: id }}
                      >
                        {names.get(id) ?? id}
                      </AppLink>
                    </RelatedRow>
                  ))}
                </RelatedList>
              )}
            </Panel>
          </div>
        )}
      </DetailPage>
      {actions.dialogs}
    </>
  );
}

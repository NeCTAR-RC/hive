import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { serverGroupRoute } from "../../../app/router";
import { instancesQuery, serverGroupsQuery } from "../api";
import { POLICY_LABELS } from "./policies";
import styles from "./ServerGroupDetailPage.module.scss";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

const CRUMBS = [
  { label: "Project" },
  { label: "Compute" },
  { label: "Server Groups", href: "/compute/server-groups" },
];

export function ServerGroupDetailPage() {
  const projectId = useProjectId();
  const { groupId } = serverGroupRoute.useParams();
  const groups = useQuery(serverGroupsQuery(projectId));
  const instances = useQuery(instancesQuery(projectId));
  const group = groups.data?.items.find((g) => g.id === groupId);
  const names = new Map(
    (instances.data?.items ?? []).map((i) => [i.id, i.name]),
  );

  if (groups.isError) {
    return (
      <>
        <PageHeader title="Server group" crumbs={CRUMBS} />
        <ErrorState
          error={groups.error}
          onRetry={() => void groups.refetch()}
        />
      </>
    );
  }
  if (groups.data && !group) {
    return (
      <>
        <PageHeader title="Server group not found" crumbs={CRUMBS} />
        <p>
          There is no server group with id <code>{groupId}</code> in this
          project.{" "}
          <RouteLink to="/compute/server-groups">
            Back to server groups
          </RouteLink>
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title={group?.name ?? "Server group"} crumbs={CRUMBS} />
      <div className={styles.grid}>
        <Panel title="Server group">
          {!group ? (
            <SkeletonLines lines={3} />
          ) : (
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
          )}
        </Panel>
        <Panel title="Members">
          {!group ? (
            <SkeletonLines lines={3} />
          ) : group.members.length === 0 ? (
            <p className={styles.muted}>No instances are in this group.</p>
          ) : (
            <ul className={styles.members}>
              {group.members.map((id) => (
                <li key={id}>
                  <RouteLink
                    to="/compute/instances/$instanceId"
                    params={{ instanceId: id }}
                  >
                    {names.get(id) ?? id}
                  </RouteLink>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

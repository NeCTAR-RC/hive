// One cluster: overview, node groups and labels (magnum-ui cluster
// details with the Nectar node group actions).
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, TabItem, Tabs } from "@ardc-ui/react";
import { allows } from "../../../lib/actions";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { useTabSearch } from "../../../lib/hooks/useTabSearch";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { clusterQuery } from "../api";
import { availableClusterActions } from "../status";
import { useClusterActions } from "./ClusterActions";
import { LabelsTab } from "./tabs/LabelsTab";
import { NodeGroupsTab } from "./tabs/NodeGroupsTab";
import { OverviewTab } from "./tabs/OverviewTab";

const clusterRoute = getRouteApi("/app/kubernetes/clusters/$clusterId");

const CRUMBS = [
  { label: "Project" },
  { label: "Container infra" },
  { label: "Clusters", href: "/kubernetes/clusters" },
];

/**
 * A cluster's detail page: the kubeconfig, upgrade and delete actions in the
 * header and the overview, node groups and labels tabs below.
 */
export function ClusterDetailPage() {
  const projectId = useProjectId();
  const { clusterId } = clusterRoute.useParams();
  const navigate = clusterRoute.useNavigate();
  const cluster = useQuery(clusterQuery(projectId, clusterId));
  const { run, dialogs } = useClusterActions(
    () => void navigate({ to: "/kubernetes/clusters" }),
  );
  const { tab, selectTab } = useTabSearch(clusterRoute, "overview");

  return (
    <>
      <DetailPage
        query={cluster}
        noun="cluster"
        id={clusterId}
        crumbs={CRUMBS}
        backTo={{ label: "clusters", href: "/kubernetes/clusters" }}
        title={(data) => data.name}
        actions={(data) => {
          const offers = availableClusterActions(data);
          return (
            <>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => run("config", [data])}
                isDisabled={!allows(offers, "config")}
              >
                Download kubeconfig
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => run("upgrade", [data])}
                isDisabled={!allows(offers, "upgrade")}
              >
                Upgrade
              </Button>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => run("delete", [data])}
                isDisabled={!allows(offers, "delete")}
              >
                Delete
              </Button>
            </>
          );
        }}
      >
        {(data) => (
          <Tabs
            selectedKey={tab}
            onSelectionChange={selectTab}
            aria-label="Cluster details"
          >
            <TabItem id="overview" title="Overview">
              <OverviewTab cluster={data} />
            </TabItem>
            <TabItem id="nodegroups" title="Node groups">
              <NodeGroupsTab cluster={data} />
            </TabItem>
            <TabItem id="labels" title="Labels">
              <LabelsTab cluster={data} />
            </TabItem>
          </Tabs>
        )}
      </DetailPage>
      {dialogs}
    </>
  );
}

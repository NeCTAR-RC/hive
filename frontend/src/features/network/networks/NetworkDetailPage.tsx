// A network's detail page: its overview, subnets and ports as tabs.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { TabItem, Tabs } from "@ardc-ui/react";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { toRowActions } from "../../../lib/actions";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { useTabSearch } from "../../../lib/hooks/useTabSearch";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { networkQuery, networkQuotaQuery } from "../api";
import { availableNetworkActions, quotaLeft } from "../status";
import { useNetworkActions } from "./NetworkActions";
import { OverviewTab } from "./tabs/OverviewTab";
import { PortsTab } from "./tabs/PortsTab";
import { SubnetsTab } from "./tabs/SubnetsTab";

const networkRoute = getRouteApi("/app/network/networks/$networkId");

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Networks", href: "/network/networks" },
];

/**
 * One network with its actions in the header; Create subnet and Create
 * port wait for room in the quota.
 */
export function NetworkDetailPage() {
  const projectId = useProjectId();
  const { networkId } = networkRoute.useParams();
  const navigate = networkRoute.useNavigate();
  const network = useQuery(networkQuery(projectId, networkId));
  const quota = useQuery(networkQuotaQuery(projectId));
  const toList = () => void navigate({ to: "/network/networks", search: {} });
  const actions = useNetworkActions(toList);
  const { tab, selectTab } = useTabSearch(networkRoute, "overview");

  return (
    <>
      <DetailPage
        query={network}
        noun="network"
        id={networkId}
        scope="visible"
        crumbs={CRUMBS}
        backTo={{ label: "networks", href: "/network/networks" }}
        title={(data) => data.name}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(
              availableNetworkActions(data, quota.data),
              (id) => actions.run(id, [data]),
            )}
          />
        )}
      >
        {(data) => (
          <Tabs
            selectedKey={tab}
            onSelectionChange={selectTab}
            aria-label="Network details"
          >
            <TabItem id="overview" title="Overview">
              <OverviewTab network={data} />
            </TabItem>
            <TabItem id="subnets" title="Subnets">
              <SubnetsTab
                network={data}
                canCreate={data.is_project && quotaLeft(quota.data, "subnet")}
                refetch={() => void network.refetch()}
              />
            </TabItem>
            <TabItem id="ports" title="Ports">
              <PortsTab
                network={data}
                canCreate={quotaLeft(quota.data, "port")}
                refetch={() => void network.refetch()}
              />
            </TabItem>
          </Tabs>
        )}
      </DetailPage>
      {actions.dialogs}
    </>
  );
}

// A router's detail page: its overview, interfaces and, unless the cloud
// lacks the extraroute extension, its static routes as tabs.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { TabItem, Tabs } from "@ardc-ui/react";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { toRowActions } from "../../../lib/actions";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { useTabSearch } from "../../../lib/hooks/useTabSearch";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { networkOptionsQuery, routerQuery } from "../api";
import { availableRouterActions } from "../status";
import { useRouterActions } from "./RouterActions";
import { InterfacesTab } from "./tabs/InterfacesTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { StaticRoutesTab } from "./tabs/StaticRoutesTab";

const routerRoute = getRouteApi("/app/network/routers/$routerId");

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Routers", href: "/network/routers" },
];

/** One router with its actions in the header. */
export function RouterDetailPage() {
  const projectId = useProjectId();
  const { routerId } = routerRoute.useParams();
  const navigate = routerRoute.useNavigate();
  const router = useQuery(routerQuery(projectId, routerId));
  const options = useQuery(networkOptionsQuery(projectId));
  const actions = useRouterActions(
    () => void navigate({ to: "/network/routers", search: {} }),
  );
  const { tab, selectTab } = useTabSearch(routerRoute, "overview");
  const extraroute = options.data?.extensions?.extraroute ?? true;

  return (
    <>
      <DetailPage
        query={router}
        noun="router"
        id={routerId}
        crumbs={CRUMBS}
        backTo={{ label: "routers", href: "/network/routers" }}
        title={(data) => data.name}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(availableRouterActions(data), (id) =>
              actions.run(id, [data]),
            )}
          />
        )}
      >
        {(data) => (
          <Tabs
            selectedKey={tab}
            onSelectionChange={selectTab}
            aria-label="Router details"
          >
            <TabItem id="overview" title="Overview">
              <OverviewTab router={data} />
            </TabItem>
            <TabItem id="interfaces" title="Interfaces">
              <InterfacesTab
                router={data}
                refetch={() => void router.refetch()}
              />
            </TabItem>
            {extraroute && (
              <TabItem id="routes" title="Static routes">
                <StaticRoutesTab router={data} />
              </TabItem>
            )}
          </Tabs>
        )}
      </DetailPage>
      {actions.dialogs}
    </>
  );
}

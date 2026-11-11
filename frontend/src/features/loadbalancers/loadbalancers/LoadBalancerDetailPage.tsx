// One load balancer: overview, listeners and pools (octavia-dashboard
// loadbalancer details).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { TabItem, Tabs } from "@ardc-ui/react";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../lib/actions";
import type { Listener, Pool } from "../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { useTabSearch } from "../../../lib/hooks/useTabSearch";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { loadBalancerTreeQuery } from "../api";
import { CreateListenerDialog } from "../listeners/dialogs/CreateListenerDialog";
import { EditListenerDialog } from "../listeners/dialogs/EditListenerDialog";
import { CreatePoolDialog } from "../pools/dialogs/CreatePoolDialog";
import { EditPoolDialog } from "../pools/dialogs/EditPoolDialog";
import {
  availableLoadBalancerActions,
  isChainRunning,
  operatingLabel,
  operatingTone,
  provisioningLabel,
  provisioningTone,
} from "../status";
import { BusyNotice } from "./BusyNotice";
import { ChainNotice } from "./ChainNotice";
import { useLoadBalancerActions } from "./LoadBalancerActions";
import { ListenersTab } from "./tabs/ListenersTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { PoolsTab } from "./tabs/PoolsTab";
import styles from "../LoadBalancers.module.scss";

const loadBalancerRoute = getRouteApi("/app/load-balancers/$lbId");

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Load balancers", href: "/load-balancers" },
];

type Dialog =
  | { kind: "create-listener" }
  | { kind: "edit-listener"; listener: Listener }
  | { kind: "create-pool" }
  | { kind: "edit-pool"; pool: Pool }
  | null;

/**
 * One load balancer's page: its statuses and VIP in the header, the create
 * chain's progress or why changes wait, and the overview, listeners and
 * pools tabs.
 */
export function LoadBalancerDetailPage() {
  const projectId = useProjectId();
  const { lbId } = loadBalancerRoute.useParams();
  const navigate = loadBalancerRoute.useNavigate();
  const tree = useQuery(loadBalancerTreeQuery(projectId, lbId));
  const { run, dialogs } = useLoadBalancerActions(
    () => void navigate({ to: "/load-balancers" }),
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const { tab, selectTab } = useTabSearch(loadBalancerRoute, "overview");

  return (
    <>
      <DetailPage
        query={tree}
        noun="load balancer"
        id={lbId}
        crumbs={CRUMBS}
        backTo={{ label: "load balancers", href: "/load-balancers" }}
        title={(data) => data.load_balancer.name || data.load_balancer.id}
        actions={({ load_balancer: lb }) => (
          <RowActionsMenu
            actions={toRowActions(availableLoadBalancerActions(lb), (id) =>
              run(id, [lb]),
            )}
          />
        )}
        meta={({ load_balancer: lb }) => (
          <div className={styles.statusRow}>
            <StatusPill tone={provisioningTone(lb.provisioning_status)}>
              {provisioningLabel(lb.provisioning_status)}
            </StatusPill>
            <StatusPill tone={operatingTone(lb.operating_status)}>
              {operatingLabel(lb.operating_status)}
            </StatusPill>
            <span className={styles.note}>
              {lb.vip_address}
              {lb.floating_ip ? ` (floating ${lb.floating_ip.address})` : ""}
            </span>
          </div>
        )}
      >
        {(data) => (
          <>
            {data.chain && <ChainNotice chain={data.chain} />}
            <BusyNotice
              lb={data.load_balancer}
              chainRunning={isChainRunning(data.chain)}
            />
            <Tabs
              selectedKey={tab}
              onSelectionChange={selectTab}
              aria-label="Load balancer details"
            >
              <TabItem id="overview" title="Overview">
                <OverviewTab tree={data} />
              </TabItem>
              <TabItem id="listeners" title="Listeners">
                <ListenersTab
                  tree={data}
                  onCreate={() => setDialog({ kind: "create-listener" })}
                  onEdit={(listener) =>
                    setDialog({ kind: "edit-listener", listener })
                  }
                />
              </TabItem>
              <TabItem id="pools" title="Pools">
                <PoolsTab
                  tree={data}
                  onCreate={() => setDialog({ kind: "create-pool" })}
                  onEdit={(pool) => setDialog({ kind: "edit-pool", pool })}
                />
              </TabItem>
            </Tabs>
          </>
        )}
      </DetailPage>
      {dialog?.kind === "create-listener" && tree.data && (
        <CreateListenerDialog
          tree={tree.data}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "edit-listener" && tree.data && (
        <EditListenerDialog
          tree={tree.data}
          listener={dialog.listener}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "create-pool" && tree.data && (
        <CreatePoolDialog tree={tree.data} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "edit-pool" && (
        <EditPoolDialog pool={dialog.pool} onClose={() => setDialog(null)} />
      )}
      {dialogs}
    </>
  );
}

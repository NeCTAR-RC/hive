// The instance detail page: status in the header, the fault if any, and
// the instance's tabs.
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Alert, TabItem, Tabs } from "@ardc-ui/react";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../lib/actions";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { useTabSearch } from "../../../lib/hooks/useTabSearch";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { instanceQuery } from "../api";
import { useInstanceActions } from "./InstanceActions";
import { powerStateLabel, statusLabel, statusTone } from "./status";
import { ActionLogTab } from "./tabs/ActionLogTab";
import { InterfacesTab } from "./tabs/InterfacesTab";
import { LogTab } from "./tabs/LogTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { SecurityGroupsTab } from "./tabs/SecurityGroupsTab";
import { VolumesTab } from "./tabs/VolumesTab";
import styles from "./InstanceDetailPage.module.scss";

const instanceRoute = getRouteApi("/app/compute/instances/$instanceId");

const CRUMBS = [
  { label: "Project" },
  { label: "Compute" },
  { label: "Instances", href: "/compute/instances" },
];

/**
 * An instance's page: its status, power state and flags in the header, its
 * row actions, and its tabs. Horizon's resize URL lands here with
 * `?action=resize` and opens the resize dialog once.
 */
export function InstanceDetailPage() {
  const projectId = useProjectId();
  const { instanceId } = instanceRoute.useParams();
  const search = instanceRoute.useSearch();
  const navigate = instanceRoute.useNavigate();
  const instance = useQuery(instanceQuery(projectId, instanceId));
  const { offers, run, dialogs } = useInstanceActions();
  const { tab, selectTab } = useTabSearch(instanceRoute, "overview");

  // Horizon's /resize/ page maps to ?action=resize: open the dialog once.
  const openedAction = useRef(false);
  useEffect(() => {
    if (search.action === "resize" && instance.data && !openedAction.current) {
      openedAction.current = true;
      run("resize", [instance.data]);
      void navigate({ search: { tab: search.tab }, replace: true });
    }
  }, [search.action, search.tab, instance.data, run, navigate]);

  return (
    <>
      <DetailPage
        query={instance}
        noun="instance"
        id={instanceId}
        crumbs={CRUMBS}
        backTo={{ label: "instances", href: "/compute/instances" }}
        title={(data) => data.name}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(offers(data), (id) => run(id, [data]))}
          />
        )}
        meta={(data) => (
          <div className={styles.statusRow}>
            <StatusPill tone={statusTone(data)}>{statusLabel(data)}</StatusPill>
            <span className={styles.muted}>{powerStateLabel(data)}</span>
            {data.locked && <StatusPill tone="neutral">Locked</StatusPill>}
            {data.flavor?.is_preemptible && (
              <StatusPill tone="warning">Preemptible</StatusPill>
            )}
          </div>
        )}
      >
        {(data) => (
          <div className={styles.page}>
            {data.fault && (
              <Alert tone="danger" role="alert">
                <strong>Fault:</strong> {data.fault.message ?? "unknown error"}
                {data.fault.created
                  ? ` (${formatDateTime(data.fault.created)})`
                  : ""}
              </Alert>
            )}
            <Tabs
              selectedKey={tab}
              onSelectionChange={selectTab}
              aria-label="Instance details"
            >
              <TabItem id="overview" title="Overview">
                <OverviewTab instance={data} />
              </TabItem>
              <TabItem id="interfaces" title="Interfaces">
                <InterfacesTab
                  instance={data}
                  onAttach={() => run("attach-interface", [data])}
                />
              </TabItem>
              <TabItem id="volumes" title="Volumes">
                <VolumesTab instance={data} />
              </TabItem>
              <TabItem id="security" title="Security groups">
                <SecurityGroupsTab
                  instance={data}
                  onEdit={() => run("security-groups", [data])}
                />
              </TabItem>
              <TabItem id="log" title="Log">
                <LogTab
                  instance={data}
                  onConsole={() => run("console", [data])}
                />
              </TabItem>
              <TabItem id="actions" title="Action log">
                <ActionLogTab instance={data} />
              </TabItem>
            </Tabs>
          </div>
        )}
      </DetailPage>
      {dialogs}
    </>
  );
}

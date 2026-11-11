// One database instance: overview, users, databases, backups, guest logs,
// configuration defaults and root access (trove-dashboard instance detail
// tabs, Nectar layout).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, TabItem, Tabs } from "@ardc-ui/react";
import { allows } from "../../../lib/actions";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { useTabSearch } from "../../../lib/hooks/useTabSearch";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { dbInstanceQuery } from "../api";
import { availableDbInstanceActions, type DbInstanceActionId } from "../status";
import { EnableRootDialog } from "./dialogs/EnableRootDialog";
import { useInstanceActions } from "./InstanceActions";
import { BackupsTab } from "./tabs/BackupsTab";
import { DatabasesTab } from "./tabs/DatabasesTab";
import { DefaultsTab } from "./tabs/DefaultsTab";
import { LogsTab } from "./tabs/LogsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { RootTab } from "./tabs/RootTab";
import { UsersTab } from "./tabs/UsersTab";
import styles from "../Databases.module.scss";

const dbInstanceRoute = getRouteApi("/app/databases/instances/$instanceId");

const CRUMBS = [
  { label: "Project" },
  { label: "Database" },
  { label: "Instances", href: "/databases/instances" },
];

/** The header's buttons, each running one instance action. */
const HEADER_ACTIONS: { id: DbInstanceActionId; label: string }[] = [
  { id: "update", label: "Update" },
  { id: "resize_volume", label: "Resize volume" },
  { id: "resize", label: "Resize" },
  { id: "upgrade", label: "Upgrade" },
  { id: "restart", label: "Restart" },
];

/**
 * One database instance in tabs, with the instance actions as header
 * buttons; a delete returns to the instances list.
 */
export function InstanceDetailPage() {
  const projectId = useProjectId();
  const { instanceId } = dbInstanceRoute.useParams();
  const search = dbInstanceRoute.useSearch();
  const navigate = dbInstanceRoute.useNavigate();
  const instance = useQuery(dbInstanceQuery(projectId, instanceId));
  const { run, dialogs } = useInstanceActions(
    () => void navigate({ to: "/databases/instances" }),
  );
  const [enablingRoot, setEnablingRoot] = useState(false);
  const { tab, selectTab } = useTabSearch(dbInstanceRoute, "overview");
  // The open log lives in the URL so Horizon's log_contents links land on it.
  const openLog = (name: string | null) =>
    void navigate({
      search: name ? { tab: "logs", log: name } : { tab: "logs" },
      replace: true,
    });
  const offers = instance.data ? availableDbInstanceActions(instance.data) : [];

  return (
    <>
      <DetailPage
        query={instance}
        noun="database instance"
        id={instanceId}
        crumbs={CRUMBS}
        backTo={{ label: "database instances", href: "/databases/instances" }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <div className={styles.actions}>
            {HEADER_ACTIONS.map(({ id, label }) => (
              <Button
                key={id}
                variant="secondary"
                size="sm"
                onPress={() => run(id, [data])}
                isDisabled={!allows(offers, id)}
              >
                {label}
              </Button>
            ))}
            <Button
              variant="secondary"
              tone="danger"
              size="sm"
              onPress={() => run("delete", [data])}
              isDisabled={!allows(offers, "delete")}
            >
              Delete
            </Button>
          </div>
        )}
      >
        {(data) => (
          <Tabs
            selectedKey={tab}
            onSelectionChange={selectTab}
            aria-label="Database instance details"
          >
            <TabItem id="overview" title="Overview">
              <OverviewTab
                instance={data}
                canAttach={allows(offers, "attach")}
                canDetach={allows(offers, "detach")}
                onAttach={() => run("attach", [data])}
                onDetach={() => run("detach", [data])}
              />
            </TabItem>
            <TabItem id="users" title="Users">
              <UsersTab instanceId={instanceId} datastore={data.datastore} />
            </TabItem>
            <TabItem id="databases" title="Databases">
              <DatabasesTab
                instanceId={instanceId}
                datastore={data.datastore}
              />
            </TabItem>
            <TabItem id="backups" title="Backups">
              <BackupsTab instanceId={instanceId} />
            </TabItem>
            <TabItem id="logs" title="Logs">
              <LogsTab
                instanceId={instanceId}
                openLog={search.log}
                onOpenLog={openLog}
              />
            </TabItem>
            <TabItem id="defaults" title="Defaults">
              <DefaultsTab instanceId={instanceId} />
            </TabItem>
            <TabItem id="root" title="Root access">
              <RootTab
                instance={data}
                canEnable={allows(offers, "root")}
                onEnable={() => setEnablingRoot(true)}
              />
            </TabItem>
          </Tabs>
        )}
      </DetailPage>
      {instance.data && enablingRoot && (
        <EnableRootDialog
          instance={instance.data}
          onClose={() => setEnablingRoot(false)}
        />
      )}
      {dialogs}
    </>
  );
}

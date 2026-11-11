// One stack: overview with outputs and parameters, resources, events and
// the template (heat-dashboard stack detail tabs, minus the topology
// graph), plus the change-template dialog.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, TabItem, Tabs } from "@ardc-ui/react";
import { allows } from "../../../lib/actions";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { useTabSearch } from "../../../lib/hooks/useTabSearch";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { stackQuery } from "../api";
import { availableStackActions } from "../status";
import { UpdateStackDialog } from "./dialogs/UpdateStackDialog";
import { useStackActions } from "./StackActions";
import { EventsTab } from "./tabs/EventsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { ResourcesTab } from "./tabs/ResourcesTab";
import { TemplateTab } from "./tabs/TemplateTab";
import styles from "../Orchestration.module.scss";

const stackRoute = getRouteApi("/app/orchestration/stacks/$stackId");

const CRUMBS = [
  { label: "Project" },
  { label: "Orchestration" },
  { label: "Stacks", href: "/orchestration/stacks" },
];

/**
 * A stack's detail page: change template, suspend or resume, check and
 * delete in the header, and the overview, resources, events and template
 * tabs below.
 */
export function StackDetailPage() {
  const projectId = useProjectId();
  const { stackId } = stackRoute.useParams();
  const navigate = stackRoute.useNavigate();
  const stack = useQuery(stackQuery(projectId, stackId));
  const { run, dialogs } = useStackActions(
    () => void navigate({ to: "/orchestration/stacks" }),
  );
  const [updating, setUpdating] = useState(false);
  const { tab, selectTab } = useTabSearch(stackRoute, "overview");

  return (
    <>
      <DetailPage
        query={stack}
        noun="stack"
        id={stackId}
        crumbs={CRUMBS}
        backTo={{ label: "stacks", href: "/orchestration/stacks" }}
        title={(data) => data.name}
        actions={(data) => {
          const offers = availableStackActions(data);
          return (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setUpdating(true)}
                isDisabled={!data.actions.includes("update")}
              >
                Change template
              </Button>
              {allows(offers, "cancel_update") && (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => run("cancel_update", [data])}
                >
                  Cancel update
                </Button>
              )}
              {allows(offers, "resume") ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => run("resume", [data])}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => run("suspend", [data])}
                  isDisabled={!allows(offers, "suspend")}
                >
                  Suspend
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onPress={() => run("check", [data])}
                isDisabled={!allows(offers, "check")}
              >
                Check
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
            </div>
          );
        }}
      >
        {(data) => (
          <Tabs
            selectedKey={tab}
            onSelectionChange={selectTab}
            aria-label="Stack details"
          >
            <TabItem id="overview" title="Overview">
              <OverviewTab stack={data} />
            </TabItem>
            <TabItem id="resources" title="Resources">
              <ResourcesTab stackId={stackId} />
            </TabItem>
            <TabItem id="events" title="Events">
              <EventsTab stackId={stackId} />
            </TabItem>
            <TabItem id="template" title="Template">
              <TemplateTab stackId={stackId} />
            </TabItem>
          </Tabs>
        )}
      </DetailPage>
      {updating && stack.data && (
        <UpdateStackDialog
          stack={stack.data}
          onClose={() => setUpdating(false)}
        />
      )}
      {dialogs}
    </>
  );
}

// One share: overview with export locations and metadata, and the access
// rules tab (manila-ui share detail and manage rules page).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { TabItem, Tabs } from "@ardc-ui/react";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { toRowActions } from "../../../lib/actions";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { useTabSearch } from "../../../lib/hooks/useTabSearch";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { shareQuery } from "../api";
import { useShareActions } from "./ShareActions";
import { AccessRuleDialog } from "./dialogs/AccessRuleDialog";
import { OverviewTab } from "./tabs/OverviewTab";
import { RulesTab } from "./tabs/RulesTab";
import { availableShareActions } from "../status";

const shareRoute = getRouteApi("/app/shares/shares/$shareId");

const CRUMBS = [
  { label: "Project" },
  { label: "Share" },
  { label: "Shares", href: "/shares/shares" },
];

/**
 * One share's detail page: the share's actions in the header, and the
 * overview and access rules tabs, the tab kept in the URL.
 */
export function ShareDetailPage() {
  const projectId = useProjectId();
  const { shareId } = shareRoute.useParams();
  const navigate = shareRoute.useNavigate();
  const share = useQuery(shareQuery(projectId, shareId));
  const { run, dialogs } = useShareActions(
    () => void navigate({ to: "/shares/shares" }),
  );
  const [addingRule, setAddingRule] = useState(false);
  const { tab, selectTab } = useTabSearch(shareRoute, "overview");

  return (
    <>
      <DetailPage
        query={share}
        noun="share"
        id={shareId}
        crumbs={CRUMBS}
        backTo={{ label: "shares", href: "/shares/shares" }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(availableShareActions(data), (id) =>
              run(id, [data]),
            )}
          />
        )}
      >
        {(data) => (
          <Tabs
            selectedKey={tab}
            onSelectionChange={selectTab}
            aria-label="Share details"
          >
            <TabItem id="overview" title="Overview">
              <OverviewTab share={data} />
            </TabItem>
            <TabItem id="rules" title="Access rules">
              <RulesTab shareId={shareId} onAdd={() => setAddingRule(true)} />
            </TabItem>
          </Tabs>
        )}
      </DetailPage>
      {share.data && addingRule && (
        <AccessRuleDialog
          share={share.data}
          onClose={() => setAddingRule(false)}
        />
      )}
      {dialogs}
    </>
  );
}

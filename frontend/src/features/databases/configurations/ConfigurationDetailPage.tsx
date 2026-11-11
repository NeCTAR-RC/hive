// One configuration group (trove-dashboard database_configurations detail):
// its values, instances and details.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, TabItem, Tabs } from "@ardc-ui/react";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { useTabSearch } from "../../../lib/hooks/useTabSearch";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { dbConfigurationQuery } from "../api";
import { DetailsTab } from "./tabs/DetailsTab";
import { InstancesTab } from "./tabs/InstancesTab";
import { ValuesTab } from "./tabs/ValuesTab";
import { useDeleteConfigurations } from "./useDeleteConfigurations";

const dbConfigurationRoute = getRouteApi(
  "/app/databases/configuration-groups/$configurationId",
);

const CONFIGURATION_CRUMBS = [
  { label: "Project" },
  { label: "Database" },
  { label: "Configuration groups", href: "/databases/configuration-groups" },
];

/**
 * One configuration group in tabs, with Delete; a delete returns to the
 * groups list.
 */
export function ConfigurationDetailPage() {
  const projectId = useProjectId();
  const { configurationId } = dbConfigurationRoute.useParams();
  const navigate = dbConfigurationRoute.useNavigate();
  const configuration = useQuery(
    dbConfigurationQuery(projectId, configurationId),
  );
  const remove = useDeleteConfigurations(
    () => void navigate({ to: "/databases/configuration-groups" }),
  );
  const { tab, selectTab } = useTabSearch(dbConfigurationRoute, "values");

  return (
    <>
      <DetailPage
        query={configuration}
        noun="configuration group"
        id={configurationId}
        crumbs={CONFIGURATION_CRUMBS}
        backTo={{
          label: "configuration groups",
          href: "/databases/configuration-groups",
        }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <Button
            variant="secondary"
            tone="danger"
            size="sm"
            onPress={() => remove.run("delete", [data])}
          >
            Delete
          </Button>
        )}
      >
        {(data) => (
          <Tabs
            selectedKey={tab}
            onSelectionChange={selectTab}
            aria-label="Configuration group details"
          >
            <TabItem id="values" title="Values">
              <ValuesTab
                configuration={data}
                isFetching={configuration.isFetching}
                onRefresh={() => void configuration.refetch()}
              />
            </TabItem>
            <TabItem id="instances" title="Instances">
              <InstancesTab configuration={data} />
            </TabItem>
            <TabItem id="details" title="Details">
              <DetailsTab configuration={data} />
            </TabItem>
          </Tabs>
        )}
      </DetailPage>
      {remove.dialog}
    </>
  );
}

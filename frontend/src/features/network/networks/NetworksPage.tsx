// The Networks list: every network the user may use plus the floating
// networks, filtered by scope, with Create network while the quota has
// room.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { DataTable } from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { allows, toRowActions } from "../../../lib/actions";
import type { Network } from "../../../lib/api/types/network";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { networkQuotaQuery, panelNetworksQuery } from "../api";
import { availableNetworkActions, quotaLeft } from "../status";
import { CreateNetworkDialog } from "./dialogs/CreateNetworkDialog";
import { networkColumns } from "./networkColumns";
import { useNetworkActions } from "./NetworkActions";

const networksRoute = getRouteApi("/app/network/networks");

const SCOPES: { id: string; label: string }[] = [
  { id: "", label: "All networks" },
  { id: "project", label: "My project's networks" },
  { id: "shared", label: "Shared networks" },
  { id: "external", label: "External networks" },
];

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

/** Whether a network belongs in the "Show" filter's scope; blank is all. */
function inScope(network: Network, scope: string): boolean {
  if (scope === "project") return network.is_project;
  if (scope === "shared") return network.is_shared;
  if (scope === "external") return network.is_external;
  return true;
}

/** The Networks list page, with its "Show" scope filter in the URL. */
export function NetworksPage() {
  const projectId = useProjectId();
  const search = useListSearch(networksRoute);
  const scope = search.params.scope ?? "";
  const networks = useQuery(panelNetworksQuery(projectId));
  const table = useQueryTable(networks, {
    noun: "networks",
    emptyTitle: "No networks",
    search,
    placeholder: "Search by name or subnet",
    filter: (row) => inScope(row, scope),
    resetKey: scope,
  });
  const quota = useQuery(networkQuotaQuery(projectId));
  const actions = useNetworkActions();
  const setCreating = (create: boolean) => search.patch({ create });

  const canCreate = quotaLeft(quota.data, "network");
  return (
    <>
      <PageHeader
        title="Networks"
        crumbs={CRUMBS}
        actions={
          <Button
            variant="primary"
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={!canCreate}
          >
            {canCreate ? "Create network" : "Create network (quota exceeded)"}
          </Button>
        }
      />
      <DataTable
        id="networks"
        label="Networks"
        columns={networkColumns}
        getRowId={(row) => row.id}
        {...table}
        {...actions.tableProps}
        filters={
          <Select
            aria-label="Show"
            labelPosition="side"
            selectedKey={scope}
            onSelectionChange={(key: Key | null) =>
              search.patch({ scope: key === null ? "" : String(key) })
            }
          >
            <Label>Show</Label>
            {SCOPES.map((option) => (
              <SelectItem
                key={option.id}
                id={option.id}
                textValue={option.label}
              >
                {option.label}
              </SelectItem>
            ))}
          </Select>
        }
        emptyBody={
          <p>Create a network to give your instances a private subnet.</p>
        }
        rowActions={(row) =>
          toRowActions(availableNetworkActions(row, quota.data), (id) =>
            actions.run(id, [row]),
          )
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => actions.run("delete", selected),
            isDisabled: (selected) =>
              !selected.some((row) =>
                allows(availableNetworkActions(row), "delete"),
              ),
          },
        ]}
      />
      {actions.dialogs}
      {search.params.create && (
        <CreateNetworkDialog onClose={() => setCreating(false)} />
      )}
    </>
  );
}

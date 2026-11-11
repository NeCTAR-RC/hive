// The instance list: Horizon's instance table with a status filter, batch
// actions and the project's security risks per instance.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Alert, Label, Link, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import {
  DataTable,
  type BatchAction,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { allows, toRowActions } from "../../../lib/actions";
import type { Instance } from "../../../lib/api/types/compute";
import { risksQuery } from "../../../lib/queries";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { instancesQuery } from "../api";
import { useInstanceActions } from "./InstanceActions";
import {
  matchesStatusFilter,
  STATUS_FILTERS,
  type InstanceActionId,
} from "./status";
import { useInstanceColumns } from "./useInstanceColumns";

const instancesRoute = getRouteApi("/app/compute/instances");

/** Horizon's batch buttons on the instance table, in its order. */
const BATCH_ACTIONS: {
  id: InstanceActionId;
  label: string;
  tone?: "danger";
}[] = [
  { id: "start", label: "Start" },
  { id: "stop", label: "Shut off" },
  { id: "soft-reboot", label: "Soft reboot" },
  { id: "delete", label: "Delete", tone: "danger" },
];

/**
 * The project's instances, filtered by status and searched by name, image
 * or address, with Horizon's row and batch actions. A project with more
 * instances than one page says so above the table.
 */
export function InstancesPage() {
  const projectId = useProjectId();
  const search = useListSearch(instancesRoute);
  const instances = useQuery(instancesQuery(projectId));
  const risks = useQuery(risksQuery(projectId));
  const { offers, run, dialogs, tableProps } = useInstanceActions();

  const status = search.params.status ?? "";

  const columns = useInstanceColumns(risks.data);

  const table = useQueryTable(instances, {
    noun: "instances",
    search,
    placeholder: "Search by name, image or address",
    filter: status ? (row) => matchesStatusFilter(row, status) : undefined,
    resetKey: status,
  });

  return (
    <>
      <PageHeader
        title="Instances"
        crumbs={[{ label: "Project" }, { label: "Compute" }]}
        actions={
          <Link variant="primary" size="sm" href="/compute/instances/launch">
            Launch instance
          </Link>
        }
      />
      {instances.data?.has_more && (
        <Alert tone="info" role="status">
          Only the first {instances.data.items.length} instances are shown; this
          project has more.
        </Alert>
      )}
      <DataTable
        id="instances"
        label="Instances"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        filters={
          <Select
            aria-label="Status"
            labelPosition="side"
            selectedKey={status}
            onSelectionChange={(key: Key | null) =>
              search.patch({ status: key === null ? "" : String(key) })
            }
          >
            <Label>Status</Label>
            {STATUS_FILTERS.map((option) => (
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
        emptyBody={<p>Launch your first instance to get started.</p>}
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) => toRowActions(offers(row), (id) => run(id, [row]))}
        batchActions={BATCH_ACTIONS.map((action): BatchAction<Instance> => ({
          ...action,
          isDisabled: (selected) =>
            !selected.some((row) => allows(offers(row), action.id)),
          onAction: (selected) => run(action.id, selected),
        }))}
      />
      {dialogs}
    </>
  );
}

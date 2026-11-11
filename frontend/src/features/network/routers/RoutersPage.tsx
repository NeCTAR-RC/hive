// The Routers list, with Create router while the quota has room.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { AppLink } from "../../../components/AppLink/AppLink";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../lib/actions";
import type { Router } from "../../../lib/api/types/network";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { networkQuotaQuery, routersQuery } from "../api";
import {
  adminStateLabel,
  availableRouterActions,
  quotaLeft,
  statusLabel,
  statusTone,
} from "../status";
import { useRouterActions } from "./RouterActions";
import { CreateRouterDialog } from "./dialogs/CreateRouterDialog";

const routersRoute = getRouteApi("/app/network/routers");

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

/** The Routers list page with its row and batch actions. */
export function RoutersPage() {
  const projectId = useProjectId();
  const search = useListSearch(routersRoute);
  const routers = useQuery(routersQuery(projectId));
  const table = useQueryTable(routers, {
    noun: "routers",
    search,
    placeholder: "Search by name or external network",
  });
  const quota = useQuery(networkQuotaQuery(projectId));
  const actions = useRouterActions();
  const setCreating = (create: boolean) => search.patch({ create });

  const columns = useMemo<ColumnDef<Router>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/network/routers/$routerId"
            params={{ routerId: row.id }}
          >
            {row.name}
          </AppLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
      {
        id: "gateway",
        label: "External network",
        cell: (row) =>
          row.external_gateway
            ? (row.external_gateway.network_name ??
              row.external_gateway.network_id)
            : "",
        sortValue: (row) => row.external_gateway?.network_name ?? "",
        textValue: (row) => row.external_gateway?.network_name ?? "",
      },
      {
        id: "gateway_ip",
        label: "External address",
        cell: (row) => (
          <code>
            {(row.external_gateway?.fixed_ips ?? [])
              .map((ip) => ip.ip_address)
              .join(", ")}
          </code>
        ),
        hideBelow: "md",
      },
      {
        id: "admin_state",
        label: "Admin state",
        cell: (row) => adminStateLabel(row.admin_state_up),
        hideBelow: "lg",
      },
      {
        id: "zones",
        label: "Availability zones",
        cell: (row) => row.availability_zones.join(", "),
        hideBelow: "lg",
        defaultHidden: true,
      },
    ],
    [],
  );
  const canCreate = quotaLeft(quota.data, "router");
  return (
    <>
      <PageHeader
        title="Routers"
        crumbs={CRUMBS}
        actions={
          <Button
            variant="primary"
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={!canCreate}
          >
            {canCreate ? "Create router" : "Create router (quota exceeded)"}
          </Button>
        }
      />
      <DataTable
        id="routers"
        label="Routers"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...actions.tableProps}
        emptyBody={
          <p>
            A router connects your private subnets to an external network and
            lets floating IPs reach them.
          </p>
        }
        rowActions={(row) =>
          toRowActions(availableRouterActions(row), (id) =>
            actions.run(id, [row]),
          )
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => actions.run("delete", selected),
          },
        ]}
      />
      {actions.dialogs}
      {search.params.create && (
        <CreateRouterDialog onClose={() => setCreating(false)} />
      )}
    </>
  );
}

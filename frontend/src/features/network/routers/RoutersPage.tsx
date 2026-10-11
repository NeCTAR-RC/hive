import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Router } from "../../../lib/api/types";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { routersRoute } from "../../../app/router";
import { networkQuotaQuery, routersQuery } from "../api";
import {
  adminStateLabel,
  availableRouterActions,
  quotaLeft,
  statusLabel,
  statusTone,
} from "../status";
import { useRouterActions } from "./RouterActions";
import { CreateRouterDialog } from "./RouterDialogs";

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

export function RoutersPage() {
  const projectId = useProjectId();
  const search = routersRoute.useSearch();
  const navigate = useNavigate({ from: routersRoute.fullPath });
  const routers = useQuery(routersQuery(projectId));
  const quota = useQuery(networkQuotaQuery(projectId));
  const { run, runDelete, dialogs } = useRouterActions(projectId);

  const q = search.q ?? "";
  const setSearch = (patch: { q?: string }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.q) delete next.q;
        return next;
      },
      replace: true,
    });
  const setCreating = (open: boolean) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous };
        delete next.create;
        return open ? { ...next, create: true } : next;
      },
      replace: true,
    });

  const columns = useMemo<ColumnDef<Router>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/network/routers/$routerId"
            params={{ routerId: row.id }}
          >
            {row.name}
          </RouterLink>
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

  const rows = useMemo(
    () => filterRows(routers.data?.items ?? [], q, columns),
    [routers.data, q, columns],
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
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={routers.isPending}
        isFetching={routers.isFetching}
        error={routers.error}
        onRetry={() => void routers.refetch()}
        onRefresh={() => void routers.refetch()}
        search={{
          value: q,
          onChange: (value) => setSearch({ q: value }),
          placeholder: "Search by name or external network",
        }}
        resetKey={q}
        emptyTitle={
          routers.data && routers.data.items.length > 0
            ? "No routers match"
            : "No routers yet"
        }
        emptyBody={
          routers.data && routers.data.items.length === 0 ? (
            <p>
              A router connects your private subnets to an external network and
              lets floating IPs reach them.
            </p>
          ) : null
        }
        rowActions={(row) =>
          availableRouterActions(row).map((action) => ({
            id: action.id,
            label: action.label,
            onAction: () => run(row, action.id),
            isDisabled: action.isDisabled,
            ...(action.disabledReason
              ? { disabledReason: action.disabledReason }
              : {}),
            ...(action.tone ? { tone: action.tone } : {}),
          }))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => runDelete(selected),
          },
        ]}
      />
      {dialogs}
      <CreateRouterDialog
        key={search.create ? "open" : "closed"}
        projectId={projectId}
        isOpen={Boolean(search.create)}
        onOpenChange={setCreating}
      />
    </>
  );
}

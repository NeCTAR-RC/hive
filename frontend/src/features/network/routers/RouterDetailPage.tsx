import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button, TabItem, Tabs } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  RowActionsMenu,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { ApiError } from "../../../lib/api/client";
import type {
  HostRoute,
  RouterDetail,
  RouterInterface,
} from "../../../lib/api/types";
import { formatDateTime } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { routerRoute } from "../../../app/router";
import {
  networkOptionsQuery,
  routerQuery,
  useRemoveInterface,
  useSetRoutes,
} from "../api";
import {
  adminStateLabel,
  availableRouterActions,
  interfaceKindLabel,
  statusLabel,
  statusTone,
} from "../status";
import { useRouterActions } from "./RouterActions";
import { AddInterfaceDialog, AddRouteDialog } from "./RouterDialogs";
import styles from "./RouterDetailPage.module.scss";

const TABS = ["overview", "interfaces", "routes"] as const;
type Tab = (typeof TABS)[number];

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Routers", href: "/network/routers" },
];

export function RouterDetailPage() {
  const projectId = useProjectId();
  const { routerId } = routerRoute.useParams();
  const search = routerRoute.useSearch();
  const navigate = useNavigate({ from: routerRoute.fullPath });
  const router = useQuery(routerQuery(projectId, routerId));
  const options = useQuery(networkOptionsQuery(projectId));
  const actions = useRouterActions(
    projectId,
    () => void navigate({ to: "/network/routers", search: {} }),
  );
  const tab: Tab = TABS.includes(search.tab as Tab)
    ? (search.tab as Tab)
    : "overview";
  const selectTab = (key: Key) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous };
        if (key === "overview") delete next.tab;
        else next.tab = String(key);
        return next;
      },
      replace: true,
    });

  if (router.isError) {
    const notFound =
      router.error instanceof ApiError && router.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Router not found" : "Router"}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no router <code>{routerId}</code> in this project.{" "}
            <RouterLink to="/network/routers" search={{}}>
              Back to routers
            </RouterLink>
          </p>
        ) : (
          <ErrorState
            error={router.error}
            onRetry={() => void router.refetch()}
          />
        )}
      </>
    );
  }

  const data = router.data;
  const extraroute = options.data?.extensions?.extraroute ?? true;
  return (
    <>
      <PageHeader
        title={data ? data.name : "Router"}
        crumbs={CRUMBS}
        actions={
          data && (
            <RowActionsMenu
              actions={availableRouterActions(data).map((action) => ({
                id: action.id,
                label: action.label,
                onAction: () => actions.run(data, action.id),
                isDisabled: action.isDisabled,
                ...(action.disabledReason
                  ? { disabledReason: action.disabledReason }
                  : {}),
                ...(action.tone ? { tone: action.tone } : {}),
              }))}
            />
          )
        }
      />
      <Tabs
        selectedKey={tab}
        onSelectionChange={selectTab}
        aria-label="Router details"
      >
        <TabItem id="overview" title="Overview">
          {data ? <Overview router={data} /> : <SkeletonLines lines={8} />}
        </TabItem>
        <TabItem id="interfaces" title="Interfaces">
          {data && (
            <Interfaces
              projectId={projectId}
              router={data}
              refetch={() => void router.refetch()}
            />
          )}
        </TabItem>
        {extraroute && (
          <TabItem id="routes" title="Static routes">
            {data && <StaticRoutes projectId={projectId} router={data} />}
          </TabItem>
        )}
      </Tabs>
      {actions.dialogs}
    </>
  );
}

function Overview({ router }: { router: RouterDetail }) {
  const gateway = router.external_gateway;
  return (
    <div className={styles.overview}>
      <KeyValueList
        items={[
          { label: "Name", value: router.name },
          { label: "ID", value: <code>{router.id}</code> },
          { label: "Description", value: router.description || null },
          {
            label: "Status",
            value: (
              <StatusPill tone={statusTone(router.status)}>
                {statusLabel(router.status)}
              </StatusPill>
            ),
          },
          {
            label: "Admin state",
            value: adminStateLabel(router.admin_state_up),
          },
          {
            label: "External network",
            value: gateway ? (
              gateway.network_id ? (
                <RouterLink
                  to="/network/networks/$networkId"
                  params={{ networkId: gateway.network_id }}
                  search={{}}
                >
                  {gateway.network_name ?? gateway.network_id}
                </RouterLink>
              ) : (
                gateway.network_name
              )
            ) : (
              "No gateway"
            ),
          },
          {
            label: "External address",
            value:
              gateway && gateway.fixed_ips.length > 0 ? (
                <code>
                  {gateway.fixed_ips.map((ip) => ip.ip_address).join(", ")}
                </code>
              ) : null,
          },
          {
            label: "SNAT",
            value: gateway
              ? gateway.enable_snat === null
                ? null
                : gateway.enable_snat
                  ? "Enabled"
                  : "Disabled"
              : null,
          },
          {
            label: "Availability zones",
            value: router.availability_zones.join(", ") || null,
          },
          { label: "Created", value: formatDateTime(router.created_at) },
          { label: "Updated", value: formatDateTime(router.updated_at) },
        ]}
      />
    </div>
  );
}

function Interfaces({
  projectId,
  router,
  refetch,
}: {
  projectId: string;
  router: RouterDetail;
  refetch: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RouterInterface | null>(null);
  const remove = useRemoveInterface(projectId);
  const columns = useMemo<ColumnDef<RouterInterface>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink to="/network/ports/$portId" params={{ portId: row.id }}>
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name || row.id,
      },
      {
        id: "network",
        label: "Network",
        cell: (row) =>
          row.network_id ? (
            <RouterLink
              to="/network/networks/$networkId"
              params={{ networkId: row.network_id }}
              search={{}}
            >
              {row.network_name ?? row.network_id}
            </RouterLink>
          ) : (
            ""
          ),
        sortValue: (row) => row.network_name ?? "",
      },
      {
        id: "ips",
        label: "Fixed IPs",
        cell: (row) => (
          <code>{row.fixed_ips.map((ip) => ip.ip_address).join(", ")}</code>
        ),
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        hideBelow: "md",
      },
      {
        id: "kind",
        label: "Type",
        cell: (row) => interfaceKindLabel(row.kind),
        sortValue: (row) => row.kind,
        hideBelow: "md",
      },
      {
        id: "admin_state",
        label: "Admin state",
        cell: (row) => adminStateLabel(row.admin_state_up),
        hideBelow: "lg",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="router-interfaces"
        label="Interfaces"
        columns={columns}
        rows={router.interfaces}
        getRowId={(row) => row.id}
        onRefresh={refetch}
        emptyTitle="No interfaces"
        emptyBody={
          <p>
            Add an interface on one of your subnets to route it through this
            router.
          </p>
        }
        toolbarActions={
          <Button variant="primary" size="xs" onPress={() => setAdding(true)}>
            Add interface
          </Button>
        }
        rowActions={(row) => [
          {
            id: "remove",
            label:
              row.kind === "gateway" ? "Clear gateway" : "Delete interface",
            tone: "danger",
            onAction: () => setRemoving(row),
            isDisabled: row.kind === "ha",
            ...(row.kind === "ha"
              ? { disabledReason: "HA interfaces are managed by the cloud" }
              : {}),
          },
        ]}
      />
      {adding && (
        <AddInterfaceDialog
          projectId={projectId}
          router={router}
          onClose={() => setAdding(false)}
        />
      )}
      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={
          removing?.kind === "gateway"
            ? `Clear the gateway of ${router.name}?`
            : `Delete interface ${removing?.fixed_ips.map((ip) => ip.ip_address).join(", ") || removing?.id || ""}?`
        }
        confirmLabel={removing?.kind === "gateway" ? "Clear gateway" : "Delete"}
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(
            { routerId: router.id, portId: removing.id },
            {
              onSuccess: () => {
                notify.success(
                  removing.kind === "gateway"
                    ? `Cleared the gateway of router ${router.name}.`
                    : "Interface deleted.",
                );
                setRemoving(null);
              },
            },
          );
        }}
      >
        <p>
          {removing?.kind === "gateway"
            ? "The router loses its route out and floating IPs behind it stop working."
            : "The subnet loses its route through this router."}
        </p>
      </ConfirmDialog>
    </>
  );
}

function StaticRoutes({
  projectId,
  router,
}: {
  projectId: string;
  router: RouterDetail;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<HostRoute | null>(null);
  const setRoutes = useSetRoutes(projectId);
  const routeId = (route: HostRoute) => `${route.destination}|${route.nexthop}`;
  const columns = useMemo<ColumnDef<HostRoute>[]>(
    () => [
      {
        id: "destination",
        label: "Destination CIDR",
        isRowHeader: true,
        cell: (row) => <code>{row.destination}</code>,
        sortValue: (row) => row.destination,
      },
      {
        id: "nexthop",
        label: "Next hop",
        cell: (row) => <code>{row.nexthop}</code>,
        sortValue: (row) => row.nexthop,
      },
    ],
    [],
  );
  const removeRoutes = (targets: HostRoute[]) => {
    const gone = new Set(targets.map(routeId));
    setRoutes.mutate(
      {
        routerId: router.id,
        routes: router.routes.filter((r) => !gone.has(routeId(r))),
      },
      {
        onSuccess: () => {
          notify.success(
            targets.length === 1
              ? "Static route deleted."
              : `${targets.length} static routes deleted.`,
          );
          setRemoving(null);
        },
      },
    );
  };
  return (
    <>
      <DataTable
        id="router-routes"
        label="Static routes"
        columns={columns}
        rows={router.routes}
        getRowId={routeId}
        emptyTitle="No static routes"
        emptyBody={
          <p>
            Static routes send traffic for a destination through a chosen next
            hop.
          </p>
        }
        toolbarActions={
          <Button variant="primary" size="xs" onPress={() => setAdding(true)}>
            Add static route
          </Button>
        }
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete static route",
            tone: "danger",
            onAction: () => setRemoving(row),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => removeRoutes(selected),
          },
        ]}
      />
      {adding && (
        <AddRouteDialog
          projectId={projectId}
          router={router}
          onClose={() => setAdding(false)}
        />
      )}
      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Delete the route to ${removing?.destination ?? ""}?`}
        confirmLabel="Delete"
        tone="danger"
        isPending={setRoutes.isPending}
        error={setRoutes.error}
        onConfirm={() => removing && removeRoutes([removing])}
      />
    </>
  );
}

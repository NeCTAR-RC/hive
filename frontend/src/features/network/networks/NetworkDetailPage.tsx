import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, TabItem, Tabs } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
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
import type { NetworkDetail, Port, SubnetDetail } from "../../../lib/api/types";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { networkRoute } from "../../../app/router";
import { networkQuery, networkQuotaQuery } from "../api";
import {
  adminStateLabel,
  availableNetworkActions,
  availablePortActions,
  availableSubnetActions,
  portAttachmentLabel,
  quotaLeft,
  statusLabel,
  statusTone,
} from "../status";
import {
  useNetworkActions,
  usePortActions,
  useSubnetActions,
} from "./NetworkActions";
import { PortDialog, SubnetDialog } from "./NetworkDialogs";
import styles from "./NetworkDetailPage.module.scss";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

const TABS = ["overview", "subnets", "ports"] as const;
type Tab = (typeof TABS)[number];

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Networks", href: "/network/networks" },
];

export function NetworkDetailPage() {
  const projectId = useProjectId();
  const { networkId } = networkRoute.useParams();
  const search = networkRoute.useSearch();
  const navigate = useNavigate({ from: networkRoute.fullPath });
  const network = useQuery(networkQuery(projectId, networkId));
  const quota = useQuery(networkQuotaQuery(projectId));
  const toList = () => void navigate({ to: "/network/networks", search: {} });
  const actions = useNetworkActions(projectId, toList);
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

  if (network.isError) {
    const notFound =
      network.error instanceof ApiError && network.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Network not found" : "Network"}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no network <code>{networkId}</code> visible to this
            project.{" "}
            <RouteLink to="/network/networks" search={{}}>
              Back to networks
            </RouteLink>
          </p>
        ) : (
          <ErrorState
            error={network.error}
            onRetry={() => void network.refetch()}
          />
        )}
      </>
    );
  }

  const data = network.data;
  return (
    <>
      <PageHeader
        title={data ? data.name : "Network"}
        crumbs={CRUMBS}
        actions={
          data && (
            <RowActionsMenu
              actions={availableNetworkActions(data, quota.data).map(
                (action) => ({
                  id: action.id,
                  label: action.label,
                  onAction: () => actions.run(data, action.id),
                  isDisabled: action.isDisabled,
                  ...(action.disabledReason
                    ? { disabledReason: action.disabledReason }
                    : {}),
                  ...(action.tone ? { tone: action.tone } : {}),
                }),
              )}
            />
          )
        }
      />
      <Tabs
        selectedKey={tab}
        onSelectionChange={selectTab}
        aria-label="Network details"
      >
        <TabItem id="overview" title="Overview">
          {data ? <Overview network={data} /> : <SkeletonLines lines={8} />}
        </TabItem>
        <TabItem id="subnets" title="Subnets">
          {data && (
            <Subnets
              projectId={projectId}
              network={data}
              canCreate={data.is_project && quotaLeft(quota.data, "subnet")}
              refetch={() => void network.refetch()}
            />
          )}
        </TabItem>
        <TabItem id="ports" title="Ports">
          {data && (
            <Ports
              projectId={projectId}
              network={data}
              canCreate={quotaLeft(quota.data, "port")}
              refetch={() => void network.refetch()}
            />
          )}
        </TabItem>
      </Tabs>
      {actions.dialogs}
    </>
  );
}

function Overview({ network }: { network: NetworkDetail }) {
  return (
    <div className={styles.overview}>
      <KeyValueList
        items={[
          { label: "Name", value: network.name },
          { label: "ID", value: <code>{network.id}</code> },
          { label: "Description", value: network.description || null },
          {
            label: "Status",
            value: (
              <StatusPill tone={statusTone(network.status)}>
                {statusLabel(network.status)}
              </StatusPill>
            ),
          },
          {
            label: "Admin state",
            value: adminStateLabel(network.admin_state_up),
          },
          { label: "Shared", value: network.is_shared ? "Yes" : "No" },
          { label: "External", value: network.is_external ? "Yes" : "No" },
          {
            label: "Owner",
            value: network.is_project
              ? "This project"
              : network.is_classic
                ? "Nectar (classic provider network)"
                : "Another project (shared with you)",
          },
          { label: "MTU", value: network.mtu },
          {
            label: "Port security",
            value:
              network.port_security_enabled === null
                ? null
                : network.port_security_enabled
                  ? "Enabled"
                  : "Disabled",
          },
          {
            label: "Availability zones",
            value: network.availability_zones.join(", ") || null,
          },
          { label: "Tags", value: network.tags.join(", ") || null },
          { label: "Created", value: formatDateTime(network.created_at) },
          { label: "Updated", value: formatDateTime(network.updated_at) },
        ]}
      />
    </div>
  );
}

function Subnets({
  projectId,
  network,
  canCreate,
  refetch,
}: {
  projectId: string;
  network: NetworkDetail;
  canCreate: boolean;
  refetch: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const { run, runDelete, dialogs } = useSubnetActions(projectId, network);
  const columns = useMemo<ColumnDef<SubnetDetail>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/network/subnets/$subnetId"
            params={{ subnetId: row.id }}
          >
            {row.name || row.id}
          </RouteLink>
        ),
        sortValue: (row) => row.name || row.id,
      },
      {
        id: "cidr",
        label: "Network address",
        cell: (row) => <code>{row.cidr}</code>,
        sortValue: (row) => row.cidr ?? "",
      },
      {
        id: "version",
        label: "IP version",
        cell: (row) => (row.ip_version ? `IPv${row.ip_version}` : ""),
        hideBelow: "md",
      },
      {
        id: "gateway",
        label: "Gateway IP",
        cell: (row) => <code>{row.gateway_ip ?? ""}</code>,
        hideBelow: "md",
      },
      {
        id: "dhcp",
        label: "DHCP",
        cell: (row) =>
          row.enable_dhcp === null
            ? ""
            : row.enable_dhcp
              ? "Enabled"
              : "Disabled",
        hideBelow: "lg",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="network-subnets"
        label="Subnets"
        columns={columns}
        rows={network.subnets}
        getRowId={(row) => row.id}
        onRefresh={refetch}
        emptyTitle="No subnets"
        emptyBody={
          <p>Instances need a subnet on the network to get an address.</p>
        }
        toolbarActions={
          network.is_project && (
            <Button
              variant="primary"
              size="xs"
              onPress={() => setCreating(true)}
              isDisabled={!canCreate}
            >
              {canCreate ? "Create subnet" : "Create subnet (quota exceeded)"}
            </Button>
          )
        }
        rowActions={(row) =>
          availableSubnetActions(row, network).map((action) => ({
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
            isDisabled: () => !network.is_project,
          },
        ]}
      />
      {dialogs}
      {creating && (
        <SubnetDialog
          projectId={projectId}
          network={network}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

function Ports({
  projectId,
  network,
  canCreate,
  refetch,
}: {
  projectId: string;
  network: NetworkDetail;
  canCreate: boolean;
  refetch: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const { run, runDelete, dialogs } = usePortActions(projectId, network);
  const columns = useMemo<ColumnDef<Port>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink to="/network/ports/$portId" params={{ portId: row.id }}>
            {row.name || row.id}
          </RouteLink>
        ),
        sortValue: (row) => row.name || row.id,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "ips",
        label: "Fixed IPs",
        cell: (row) => (
          <code>{row.fixed_ips.map((ip) => ip.ip_address).join(", ")}</code>
        ),
        textValue: (row) => row.fixed_ips.map((ip) => ip.ip_address).join(" "),
      },
      {
        id: "mac",
        label: "MAC address",
        cell: (row) => <code>{row.mac_address ?? ""}</code>,
        hideBelow: "lg",
      },
      {
        id: "attached",
        label: "Attached device",
        cell: (row) => portAttachmentLabel(row),
        sortValue: (row) => portAttachmentLabel(row),
        hideBelow: "md",
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
        id="network-ports"
        label="Ports"
        columns={columns}
        rows={network.ports}
        getRowId={(row) => row.id}
        onRefresh={refetch}
        emptyTitle="No ports"
        emptyBody={
          <p>
            Ports appear when instances or routers attach to the network, or
            when you create one to attach later.
          </p>
        }
        toolbarActions={
          <Button
            variant="primary"
            size="xs"
            onPress={() => setCreating(true)}
            isDisabled={!canCreate}
          >
            {canCreate ? "Create port" : "Create port (quota exceeded)"}
          </Button>
        }
        rowActions={(row) =>
          availablePortActions(row).map((action) => ({
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
            isDisabled: (selected) =>
              selected.some(
                (row) =>
                  availablePortActions(row).find((a) => a.id === "delete")
                    ?.isDisabled,
              ),
          },
        ]}
      />
      {dialogs}
      {creating && (
        <PortDialog
          projectId={projectId}
          network={network}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

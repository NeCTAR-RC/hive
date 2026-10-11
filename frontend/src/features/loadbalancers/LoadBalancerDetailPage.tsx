// One load balancer: overview, listeners and pools (octavia-dashboard
// loadbalancer details).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Alert, Button, TabItem, Tabs } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { Listener, LoadBalancerTree, Pool } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { loadBalancerRoute } from "../../app/router";
import {
  loadBalancerTreeQuery,
  useDeleteListener,
  useDeleteLoadBalancer,
  useDeletePool,
  useDisassociateLbFloatingIp,
} from "./api";
import { CreateListenerDialog } from "./ListenerDialogs";
import {
  AssociateFipDialog,
  EditLoadBalancerDialog,
} from "./LoadBalancerDialogs";
import { CreatePoolDialog } from "./PoolDialogs";
import {
  operatingLabel,
  operatingTone,
  provisioningLabel,
  provisioningTone,
} from "./status";
import styles from "./LoadBalancers.module.scss";

type Dialog = "edit" | "associate" | "listener" | "pool" | null;

export function LoadBalancerDetailPage() {
  const projectId = useProjectId();
  const { lbId } = loadBalancerRoute.useParams();
  const search = loadBalancerRoute.useSearch();
  const navigate = useNavigate({ from: loadBalancerRoute.fullPath });
  const tree = useQuery(loadBalancerTreeQuery(projectId, lbId));
  const remove = useDeleteLoadBalancer(projectId);
  const disassociate = useDisassociateLbFloatingIp(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState(false);
  const tab = search.tab ?? "overview";
  const selectTab = (key: React.Key) =>
    void navigate({
      search: key === "overview" ? {} : { tab: String(key) },
      replace: true,
    });
  const lb = tree.data?.load_balancer;

  return (
    <>
      <PageHeader
        title={lb?.name || lb?.id || "Load balancer"}
        crumbs={[
          { label: "Project" },
          { label: "Network" },
          { label: "Load Balancers", href: "/load-balancers" },
        ]}
        actions={
          lb ? (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("edit")}
              >
                Edit
              </Button>
              {lb.floating_ip ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    disassociate.mutate(lb.id, {
                      onSuccess: () =>
                        notify.success("Floating IP disassociated."),
                    })
                  }
                >
                  Disassociate floating IP
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => setDialog("associate")}
                  isDisabled={!lb.vip_port_id}
                >
                  Associate floating IP
                </Button>
              )}
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => setDeleting(true)}
                isDisabled={!lb.can_delete}
              >
                Delete
              </Button>
            </div>
          ) : null
        }
      >
        {lb && (
          <div className={styles.statusRow}>
            <StatusPill tone={provisioningTone(lb.provisioning_status)}>
              {provisioningLabel(lb.provisioning_status)}
            </StatusPill>
            <StatusPill tone={operatingTone(lb.operating_status)}>
              {operatingLabel(lb.operating_status)}
            </StatusPill>
            <span className={styles.muted}>
              {lb.vip_address}
              {lb.floating_ip ? ` (floating ${lb.floating_ip.address})` : ""}
            </span>
          </div>
        )}
      </PageHeader>
      {tree.isError ? (
        <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
      ) : (
        <>
          {tree.data?.chain && <ChainNotice chain={tree.data.chain} />}
          <Tabs
            selectedKey={tab}
            onSelectionChange={selectTab}
            aria-label="Load balancer details"
          >
            <TabItem id="overview" title="Overview">
              {tree.data ? (
                <Overview tree={tree.data} />
              ) : (
                <SkeletonLines lines={8} />
              )}
            </TabItem>
            <TabItem id="listeners" title="Listeners">
              {tree.data ? (
                <Listeners
                  projectId={projectId}
                  tree={tree.data}
                  onCreate={() => setDialog("listener")}
                />
              ) : (
                <SkeletonLines lines={4} />
              )}
            </TabItem>
            <TabItem id="pools" title="Pools">
              {tree.data ? (
                <Pools
                  projectId={projectId}
                  tree={tree.data}
                  onCreate={() => setDialog("pool")}
                />
              ) : (
                <SkeletonLines lines={4} />
              )}
            </TabItem>
          </Tabs>
        </>
      )}
      {dialog === "edit" && lb && (
        <EditLoadBalancerDialog
          projectId={projectId}
          lb={lb}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "associate" && lb && (
        <AssociateFipDialog
          projectId={projectId}
          lb={lb}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "listener" && tree.data && (
        <CreateListenerDialog
          projectId={projectId}
          tree={tree.data}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "pool" && tree.data && (
        <CreatePoolDialog
          projectId={projectId}
          tree={tree.data}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete load balancer ${lb?.name || lbId}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(lbId, {
            onSuccess: () => {
              notify.success("Deleting the load balancer.");
              void navigate({ to: "/load-balancers" });
            },
          })
        }
      >
        <p>
          Its listeners, pools, members, health monitors and policies are
          deleted with it.
        </p>
      </ConfirmDialog>
    </>
  );
}

function ChainNotice({ chain }: { chain: LoadBalancerTree["chain"] }) {
  if (!chain) return null;
  const remaining = chain.steps.length - chain.done.length;
  if (chain.error) {
    return (
      <Alert tone="danger" role="status">
        Creating the rest of the load balancer stopped after {chain.done.length}{" "}
        of {chain.steps.length} steps: {chain.error}. Add the missing listener,
        pool, members or monitor by hand.
      </Alert>
    );
  }
  if (remaining > 0) {
    return (
      <Alert tone="info" role="status">
        Creating {chain.steps[chain.done.length]} ({chain.done.length} of{" "}
        {chain.steps.length} steps done). This page updates on its own.
      </Alert>
    );
  }
  return null;
}

function Overview({ tree }: { tree: LoadBalancerTree }) {
  const lb = tree.load_balancer;
  return (
    <div className={styles.grid}>
      <Panel title="Load balancer" headingLevel={3}>
        <KeyValueList
          items={[
            { label: "ID", value: <code>{lb.id}</code> },
            { label: "Name", value: lb.name || "-" },
            { label: "Description", value: lb.description || "-" },
            { label: "Admin state", value: lb.admin_state_up ? "Up" : "Down" },
            { label: "Provider", value: lb.provider ?? "-" },
            { label: "Flavour", value: lb.flavor_id ?? "Default" },
            { label: "Availability zone", value: lb.availability_zone ?? "-" },
            { label: "Created", value: formatDateTime(lb.created_at) || "-" },
            { label: "Updated", value: formatDateTime(lb.updated_at) || "-" },
          ]}
        />
      </Panel>
      <Panel title="Addresses" headingLevel={3}>
        <KeyValueList
          items={[
            { label: "VIP address", value: lb.vip_address ?? "-" },
            { label: "Floating IP", value: lb.floating_ip?.address ?? "None" },
            { label: "VIP port", value: <code>{lb.vip_port_id ?? "-"}</code> },
            {
              label: "VIP subnet",
              value: lb.vip_subnet_id ? (
                <RouterLink
                  to="/network/subnets/$subnetId"
                  params={{ subnetId: lb.vip_subnet_id }}
                >
                  {lb.vip_subnet_id}
                </RouterLink>
              ) : (
                "-"
              ),
            },
            {
              label: "VIP network",
              value: lb.vip_network_id ? (
                <RouterLink
                  to="/network/networks/$networkId"
                  params={{ networkId: lb.vip_network_id }}
                >
                  {lb.vip_network_id}
                </RouterLink>
              ) : (
                "-"
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function Listeners({
  projectId,
  tree,
  onCreate,
}: {
  projectId: string;
  tree: LoadBalancerTree;
  onCreate: () => void;
}) {
  const remove = useDeleteListener(projectId);
  const [deleting, setDeleting] = useState<Listener | null>(null);
  const lbId = tree.load_balancer.id;
  const columns = useMemo<ColumnDef<Listener>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/load-balancers/$lbId/listeners/$listenerId"
            params={{ lbId, listenerId: row.id }}
            className={styles.nameLink}
          >
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name ?? row.id,
      },
      {
        id: "protocol",
        label: "Protocol",
        cell: (row) => row.protocol,
        sortValue: (row) => row.protocol,
      },
      {
        id: "port",
        label: "Port",
        cell: (row) => row.protocol_port,
        sortValue: (row) => row.protocol_port,
      },
      {
        id: "pool",
        label: "Default pool",
        cell: (row) =>
          tree.pools.find((p) => p.id === row.default_pool_id)?.name ||
          row.default_pool_id ||
          "-",
        hideBelow: "md",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={provisioningTone(row.provisioning_status)}>
            {provisioningLabel(row.provisioning_status)}
          </StatusPill>
        ),
      },
    ],
    [lbId, tree.pools],
  );
  return (
    <>
      <DataTable
        id="lb-listeners"
        label="Listeners"
        columns={columns}
        rows={tree.listeners}
        getRowId={(row) => row.id}
        emptyTitle="No listeners"
        emptyBody={
          <p>A listener accepts traffic on a port and sends it to a pool.</p>
        }
        toolbarActions={
          <Button size="xs" onPress={onCreate}>
            Create listener
          </Button>
        }
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete listener",
            tone: "danger",
            onAction: () => setDeleting(row),
          },
        ]}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete listener ${deleting?.name || deleting?.id}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              notify.success("Deleting the listener.");
              setDeleting(null);
            },
          });
        }}
      >
        <p>
          Its L7 policies are deleted with it. Pools stay on the load balancer.
        </p>
      </ConfirmDialog>
    </>
  );
}

function Pools({
  projectId,
  tree,
  onCreate,
}: {
  projectId: string;
  tree: LoadBalancerTree;
  onCreate: () => void;
}) {
  const remove = useDeletePool(projectId);
  const [deleting, setDeleting] = useState<Pool | null>(null);
  const lbId = tree.load_balancer.id;
  const columns = useMemo<ColumnDef<Pool>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/load-balancers/$lbId/pools/$poolId"
            params={{ lbId, poolId: row.id }}
            className={styles.nameLink}
          >
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name ?? row.id,
      },
      {
        id: "protocol",
        label: "Protocol",
        cell: (row) => row.protocol ?? "",
        sortValue: (row) => row.protocol ?? "",
      },
      {
        id: "algorithm",
        label: "Algorithm",
        cell: (row) => (row.lb_algorithm ?? "").replace(/_/g, " "),
        hideBelow: "md",
      },
      {
        id: "members",
        label: "Members",
        cell: (row) => row.members.length,
        sortValue: (row) => row.members.length,
      },
      {
        id: "monitor",
        label: "Health monitor",
        cell: (row) =>
          row.healthmonitor_id
            ? (tree.monitors.find((m) => m.id === row.healthmonitor_id)?.type ??
              "Yes")
            : "None",
        hideBelow: "md",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={provisioningTone(row.provisioning_status)}>
            {provisioningLabel(row.provisioning_status)}
          </StatusPill>
        ),
      },
    ],
    [lbId, tree.monitors],
  );
  return (
    <>
      <DataTable
        id="lb-pools"
        label="Pools"
        columns={columns}
        rows={tree.pools}
        getRowId={(row) => row.id}
        emptyTitle="No pools"
        emptyBody={
          <p>A pool groups the members that answer a listener's traffic.</p>
        }
        toolbarActions={
          <Button size="xs" onPress={onCreate}>
            Create pool
          </Button>
        }
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete pool",
            tone: "danger",
            onAction: () => setDeleting(row),
          },
        ]}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete pool ${deleting?.name || deleting?.id}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              notify.success("Deleting the pool.");
              setDeleting(null);
            },
          });
        }}
      >
        <p>Its members and health monitor are deleted with it.</p>
      </ConfirmDialog>
    </>
  );
}

// One pool: overview, edit, members and the health monitor.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { DELETE, REMOVE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { toRowActions } from "../../../lib/actions";
import type {
  HealthMonitor,
  LoadBalancerTree,
  Member,
  Pool,
} from "../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import {
  deleteMember,
  deleteMonitor,
  deletePool,
  loadBalancerTreeQuery,
  loadBalancerWriteKeys,
} from "../api";
import { BusyNotice } from "../loadbalancers/BusyNotice";
import {
  availableMemberActions,
  availablePoolActions,
  isChainRunning,
  octaviaLock,
} from "../status";
import { AddMemberDialog } from "./dialogs/AddMemberDialog";
import { EditMemberDialog } from "./dialogs/EditMemberDialog";
import { EditPoolDialog } from "./dialogs/EditPoolDialog";
import { MonitorDialog } from "./dialogs/MonitorDialog";
import { HealthMonitorPanel } from "./HealthMonitorPanel";
import { memberColumns } from "./memberColumns";
import { PoolSummary } from "./PoolSummary";
import styles from "../LoadBalancers.module.scss";

const poolRoute = getRouteApi("/app/load-balancers/$lbId/pools/$poolId");

const idOf = (item: { id: string }) => item.id;
/** A member as the pool lists it: "192.168.1.20:80". */
const memberAddress = (member: Member) =>
  `${member.address}:${member.protocol_port}`;

/** The pool in its balancer's tree, with its health monitor and the tree. */
function findPool(tree: LoadBalancerTree, poolId: string) {
  const pool = tree.pools.find((p) => p.id === poolId);
  if (!pool) return undefined;
  const monitor =
    tree.monitors.find((m) => m.id === pool.healthmonitor_id) ?? null;
  return { tree, pool, monitor };
}

type Dialog =
  | { kind: "edit" }
  | { kind: "member"; member: Member | null }
  | { kind: "monitor" }
  | null;

/**
 * One pool's page, read from its load balancer's tree: its summary, its
 * health monitor, and its members, added, edited and removed here. Every
 * change waits while the load balancer is PENDING_*.
 */
export function PoolDetailPage() {
  const projectId = useProjectId();
  const { lbId, poolId } = poolRoute.useParams();
  const navigate = useNavigate();
  const tree = useQuery(loadBalancerTreeQuery(projectId, lbId));
  const [dialog, setDialog] = useState<Dialog>(null);
  const removePool = useBulkAction<Pool, "delete">({
    noun: { one: "pool", many: "pools" },
    name: (pool) => pool.name || pool.id,
    getId: idOf,
    invalidates: loadBalancerWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (pool) => deletePool(pool.id),
        body: <p>Its members and health monitor are deleted with it.</p>,
        onSucceeded: () =>
          void navigate({
            to: "/load-balancers/$lbId",
            params: { lbId },
            search: { tab: "pools" },
          }),
      },
    },
  });
  const removeMember = useBulkAction<Member, "remove">({
    noun: { one: "member", many: "members" },
    name: memberAddress,
    getId: idOf,
    invalidates: loadBalancerWriteKeys,
    actions: {
      remove: {
        verb: REMOVE,
        request: (member) => deleteMember(poolId, member.id),
      },
    },
  });
  const removeMonitor = useBulkAction<HealthMonitor, "delete">({
    noun: { one: "health monitor", many: "health monitors" },
    name: (monitor) => monitor.name || monitor.type,
    getId: idOf,
    invalidates: loadBalancerWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (monitor) => deleteMonitor(monitor.id),
        title: () => "Delete the health monitor?",
        body: <p>Members will no longer be health checked.</p>,
      },
    },
  });
  const selected = tree.data && findPool(tree.data, poolId);
  const lbName = tree.data?.load_balancer.name || lbId;
  const lbStatus = tree.data?.load_balancer.provisioning_status ?? null;

  return (
    <>
      <DetailPage
        query={tree}
        select={(data) => findPool(data, poolId)}
        noun="pool"
        id={poolId}
        crumbs={[
          { label: "Project" },
          { label: "Network" },
          { label: "Load balancers", href: "/load-balancers" },
          { label: lbName, href: `/load-balancers/${lbId}?tab=pools` },
        ]}
        backTo={{ label: "pools", href: `/load-balancers/${lbId}?tab=pools` }}
        title={({ pool }) => pool.name || pool.id}
        actions={({ pool }) => (
          <RowActionsMenu
            actions={toRowActions(availablePoolActions(pool, lbStatus), (id) =>
              id === "edit"
                ? setDialog({ kind: "edit" })
                : removePool.run("delete", [pool]),
            )}
          />
        )}
      >
        {({ tree: { listeners, load_balancer, chain }, pool, monitor }) => (
          <div className={styles.stack}>
            <BusyNotice
              lb={load_balancer}
              chainRunning={isChainRunning(chain)}
            />
            <div className={styles.grid}>
              <PoolSummary lbId={lbId} pool={pool} listeners={listeners} />
              <HealthMonitorPanel
                monitor={monitor}
                lbStatus={lbStatus}
                onEdit={() => setDialog({ kind: "monitor" })}
                onDelete={(existing) => removeMonitor.run("delete", [existing])}
              />
            </div>
            <DataTable
              id="pool-members"
              label="Members"
              columns={memberColumns}
              rows={pool.member_rows}
              getRowId={idOf}
              {...removeMember.tableProps}
              emptyTitle="No members"
              emptyBody={
                <p>
                  Add the instances or addresses that answer this pool's
                  traffic.
                </p>
              }
              toolbarActions={
                <Button
                  size="xs"
                  onPress={() => setDialog({ kind: "member", member: null })}
                  isDisabled={octaviaLock(lbStatus) !== null}
                >
                  Add member
                </Button>
              }
              rowActions={(row) =>
                toRowActions(availableMemberActions(row, lbStatus), (id) =>
                  id === "edit"
                    ? setDialog({ kind: "member", member: row })
                    : removeMember.run("remove", [row]),
                )
              }
            />
          </div>
        )}
      </DetailPage>
      {dialog?.kind === "edit" && selected && (
        <EditPoolDialog pool={selected.pool} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "member" &&
        selected &&
        (dialog.member ? (
          <EditMemberDialog
            pool={selected.pool}
            member={dialog.member}
            onClose={() => setDialog(null)}
          />
        ) : (
          <AddMemberDialog
            lbId={lbId}
            pool={selected.pool}
            onClose={() => setDialog(null)}
          />
        ))}
      {dialog?.kind === "monitor" && selected && (
        <MonitorDialog
          pool={selected.pool}
          monitor={selected.monitor}
          onClose={() => setDialog(null)}
        />
      )}
      {removePool.dialog}
      {removeMember.dialog}
      {removeMonitor.dialog}
    </>
  );
}

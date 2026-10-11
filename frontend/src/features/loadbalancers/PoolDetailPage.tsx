// One pool: overview, edit, members and the health monitor.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
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
import type { Member } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { poolRoute } from "../../app/router";
import {
  loadBalancerTreeQuery,
  useDeleteMember,
  useDeleteMonitor,
  useDeletePool,
} from "./api";
import {
  AddMemberDialog,
  EditMemberDialog,
  EditPoolDialog,
  MonitorDialog,
} from "./PoolDialogs";
import {
  operatingLabel,
  operatingTone,
  provisioningLabel,
  provisioningTone,
} from "./status";
import styles from "./LoadBalancers.module.scss";

type Dialog =
  | { kind: "edit" }
  | { kind: "member"; member: Member | null }
  | { kind: "monitor" }
  | null;

export function PoolDetailPage() {
  const projectId = useProjectId();
  const { lbId, poolId } = poolRoute.useParams();
  const navigate = useNavigate();
  const tree = useQuery(loadBalancerTreeQuery(projectId, lbId));
  const removePool = useDeletePool(projectId);
  const removeMember = useDeleteMember(projectId);
  const removeMonitor = useDeleteMonitor(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [deletingMonitor, setDeletingMonitor] = useState(false);
  const pool = tree.data?.pools.find((p) => p.id === poolId);
  const monitor =
    tree.data?.monitors.find((m) => m.id === pool?.healthmonitor_id) ?? null;
  const lbName = tree.data?.load_balancer.name || lbId;

  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        id: "address",
        label: "Address",
        isRowHeader: true,
        cell: (row) => `${row.address}:${row.protocol_port}`,
        sortValue: (row) => row.address,
      },
      {
        id: "name",
        label: "Name",
        cell: (row) => row.name || "",
        hideBelow: "md",
      },
      {
        id: "weight",
        label: "Weight",
        cell: (row) => row.weight ?? "",
        sortValue: (row) => row.weight ?? 0,
      },
      {
        id: "backup",
        label: "Backup",
        cell: (row) => (row.backup ? "Yes" : "No"),
        hideBelow: "lg",
      },
      {
        id: "operating",
        label: "Operating status",
        cell: (row) => (
          <StatusPill tone={operatingTone(row.operating_status)}>
            {operatingLabel(row.operating_status)}
          </StatusPill>
        ),
      },
      {
        id: "provisioning",
        label: "Provisioning",
        cell: (row) => (
          <StatusPill tone={provisioningTone(row.provisioning_status)}>
            {provisioningLabel(row.provisioning_status)}
          </StatusPill>
        ),
        hideBelow: "md",
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title={pool ? pool.name || pool.id : "Pool"}
        crumbs={[
          { label: "Project" },
          { label: "Network" },
          { label: "Load Balancers", href: "/load-balancers" },
          { label: lbName, href: `/load-balancers/${lbId}?tab=pools` },
        ]}
        actions={
          pool ? (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog({ kind: "edit" })}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => setDeleting(true)}
              >
                Delete
              </Button>
            </div>
          ) : null
        }
      />
      {tree.isPending ? (
        <SkeletonLines lines={8} />
      ) : tree.isError ? (
        <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
      ) : !pool ? (
        <ErrorState
          error={new Error("pool not found")}
          title="Pool not found"
        />
      ) : (
        <div className={styles.stack}>
          <div className={styles.grid}>
            <Panel title="Pool" headingLevel={2}>
              <KeyValueList
                items={[
                  { label: "ID", value: <code>{pool.id}</code> },
                  { label: "Protocol", value: pool.protocol ?? "-" },
                  {
                    label: "Algorithm",
                    value: (pool.lb_algorithm ?? "-").replace(/_/g, " "),
                  },
                  {
                    label: "Status",
                    value: (
                      <StatusPill
                        tone={provisioningTone(pool.provisioning_status)}
                      >
                        {provisioningLabel(pool.provisioning_status)}
                      </StatusPill>
                    ),
                  },
                  {
                    label: "Admin state",
                    value: pool.admin_state_up ? "Up" : "Down",
                  },
                  { label: "Description", value: pool.description || "-" },
                  {
                    label: "Session persistence",
                    value: pool.session_persistence
                      ? `${pool.session_persistence.type.replace(/_/g, " ")}${pool.session_persistence.cookie_name ? ` (${pool.session_persistence.cookie_name})` : ""}`
                      : "None",
                  },
                  {
                    label: "Listeners",
                    value: pool.listeners.length
                      ? pool.listeners
                          .map(
                            (id) =>
                              tree.data.listeners.find((l) => l.id === id)
                                ?.name || id,
                          )
                          .join(", ")
                      : "None",
                  },
                ]}
              />
            </Panel>
            <Panel
              title="Health monitor"
              headingLevel={2}
              actions={
                monitor ? (
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      size="xs"
                      onPress={() => setDialog({ kind: "monitor" })}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      tone="danger"
                      size="xs"
                      onPress={() => setDeletingMonitor(true)}
                    >
                      Delete
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="xs"
                    onPress={() => setDialog({ kind: "monitor" })}
                  >
                    Create health monitor
                  </Button>
                )
              }
            >
              {monitor ? (
                <KeyValueList
                  items={[
                    { label: "Type", value: monitor.type },
                    { label: "Delay", value: `${monitor.delay ?? "-"} s` },
                    { label: "Timeout", value: `${monitor.timeout ?? "-"} s` },
                    {
                      label: "Retries up / down",
                      value: `${monitor.max_retries ?? "-"} / ${monitor.max_retries_down ?? "-"}`,
                    },
                    ...(["HTTP", "HTTPS"].includes(monitor.type)
                      ? [
                          {
                            label: "Check",
                            value: `${monitor.http_method ?? "GET"} ${monitor.url_path ?? "/"}`,
                          },
                          {
                            label: "Expected codes",
                            value: monitor.expected_codes ?? "200",
                          },
                        ]
                      : []),
                    {
                      label: "Status",
                      value: (
                        <StatusPill
                          tone={provisioningTone(monitor.provisioning_status)}
                        >
                          {provisioningLabel(monitor.provisioning_status)}
                        </StatusPill>
                      ),
                    },
                  ]}
                />
              ) : (
                <p className={styles.muted}>
                  No health monitor. Members are assumed healthy.
                </p>
              )}
            </Panel>
          </div>
          <DataTable
            id="pool-members"
            label="Members"
            columns={columns}
            rows={pool.member_rows ?? []}
            getRowId={(row) => row.id}
            emptyTitle="No members"
            emptyBody={
              <p>
                Add the instances or addresses that answer this pool's traffic.
              </p>
            }
            toolbarActions={
              <Button
                size="xs"
                onPress={() => setDialog({ kind: "member", member: null })}
              >
                Add member
              </Button>
            }
            rowActions={(row) => [
              {
                id: "edit",
                label: "Edit member",
                onAction: () => setDialog({ kind: "member", member: row }),
              },
              {
                id: "delete",
                label: "Remove member",
                tone: "danger",
                onAction: () => setDeletingMember(row),
              },
            ]}
          />
        </div>
      )}
      {dialog?.kind === "edit" && pool && (
        <EditPoolDialog
          projectId={projectId}
          pool={pool}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "member" &&
        pool &&
        (dialog.member ? (
          <EditMemberDialog
            projectId={projectId}
            pool={pool}
            member={dialog.member}
            onClose={() => setDialog(null)}
          />
        ) : (
          <AddMemberDialog
            projectId={projectId}
            lbId={lbId}
            pool={pool}
            onClose={() => setDialog(null)}
          />
        ))}
      {dialog?.kind === "monitor" && pool && (
        <MonitorDialog
          projectId={projectId}
          pool={pool}
          monitor={monitor}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete pool ${pool?.name || poolId}?`}
        confirmLabel="Delete"
        isPending={removePool.isPending}
        error={removePool.error}
        onConfirm={() =>
          removePool.mutate(poolId, {
            onSuccess: () => {
              notify.success("Deleting the pool.");
              void navigate({
                to: "/load-balancers/$lbId",
                params: { lbId },
                search: { tab: "pools" },
              });
            },
          })
        }
      >
        <p>Its members and health monitor are deleted with it.</p>
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={deletingMember !== null}
        onOpenChange={(open) => !open && setDeletingMember(null)}
        title={`Remove member ${deletingMember?.address}:${deletingMember?.protocol_port}?`}
        confirmLabel="Remove"
        isPending={removeMember.isPending}
        error={removeMember.error}
        onConfirm={() => {
          if (!deletingMember || !pool) return;
          removeMember.mutate(
            { poolId: pool.id, memberId: deletingMember.id },
            {
              onSuccess: () => {
                notify.success("Removing the member.");
                setDeletingMember(null);
              },
            },
          );
        }}
      />
      <ConfirmDialog
        isOpen={deletingMonitor}
        onOpenChange={setDeletingMonitor}
        title="Delete the health monitor?"
        confirmLabel="Delete"
        isPending={removeMonitor.isPending}
        error={removeMonitor.error}
        onConfirm={() => {
          if (!monitor) return;
          removeMonitor.mutate(monitor.id, {
            onSuccess: () => {
              notify.success("Deleting the health monitor.");
              setDeletingMonitor(false);
            },
          });
        }}
      >
        <p>Members will no longer be health checked.</p>
      </ConfirmDialog>
    </>
  );
}

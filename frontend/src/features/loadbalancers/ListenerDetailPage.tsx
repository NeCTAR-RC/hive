// One listener: overview, edit, and its L7 policies with their rules.
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { L7Policy, L7Rule } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { listenerRoute } from "../../app/router";
import {
  l7PolicyQuery,
  loadBalancerTreeQuery,
  useDeleteL7Policy,
  useDeleteL7Rule,
  useDeleteListener,
} from "./api";
import { L7PolicyDialog, L7RuleDialog } from "./L7Dialogs";
import { EditListenerDialog } from "./ListenerDialogs";
import { provisioningLabel, provisioningTone } from "./status";
import styles from "./LoadBalancers.module.scss";

type Dialog =
  { kind: "edit" } | { kind: "policy"; policy: L7Policy | null } | null;

export function ListenerDetailPage() {
  const projectId = useProjectId();
  const { lbId, listenerId } = listenerRoute.useParams();
  const navigate = useNavigate();
  const tree = useQuery(loadBalancerTreeQuery(projectId, lbId));
  const removeListener = useDeleteListener(projectId);
  const removePolicy = useDeleteL7Policy(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingPolicy, setDeletingPolicy] = useState<L7Policy | null>(null);
  const [rulesOf, setRulesOf] = useState<string | null>(null);
  const listener = tree.data?.listeners.find((l) => l.id === listenerId);
  const policies = useMemo(
    () =>
      (tree.data?.l7policies ?? []).filter((p) => p.listener_id === listenerId),
    [tree.data, listenerId],
  );
  const lbName = tree.data?.load_balancer.name || lbId;
  const rulesPolicy = policies.find((p) => p.id === rulesOf) ?? null;

  const columns = useMemo<ColumnDef<L7Policy>[]>(
    () => [
      {
        id: "position",
        label: "Position",
        cell: (row) => row.position ?? "",
        sortValue: (row) => row.position ?? 0,
      },
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => row.name || row.id,
        sortValue: (row) => row.name ?? row.id,
      },
      {
        id: "action",
        label: "Action",
        cell: (row) => row.action.replace(/_/g, " "),
      },
      {
        id: "target",
        label: "Target",
        cell: (row) =>
          row.redirect_url ??
          row.redirect_prefix ??
          (row.redirect_pool_id
            ? tree.data?.pools.find((p) => p.id === row.redirect_pool_id)
                ?.name || row.redirect_pool_id
            : ""),
        hideBelow: "md",
      },
      { id: "rules", label: "Rules", cell: (row) => row.rules.length },
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
    [tree.data],
  );

  return (
    <>
      <PageHeader
        title={listener ? listener.name || listener.id : "Listener"}
        crumbs={[
          { label: "Project" },
          { label: "Network" },
          { label: "Load Balancers", href: "/load-balancers" },
          { label: lbName, href: `/load-balancers/${lbId}?tab=listeners` },
        ]}
        actions={
          listener ? (
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
      ) : !listener ? (
        <ErrorState
          error={new Error("listener not found")}
          title="Listener not found"
        />
      ) : (
        <div className={styles.stack}>
          <div className={styles.grid}>
            <Panel title="Listener" headingLevel={2}>
              <KeyValueList
                items={[
                  { label: "ID", value: <code>{listener.id}</code> },
                  {
                    label: "Protocol",
                    value: `${listener.protocol} on port ${listener.protocol_port}`,
                  },
                  {
                    label: "Status",
                    value: (
                      <StatusPill
                        tone={provisioningTone(listener.provisioning_status)}
                      >
                        {provisioningLabel(listener.provisioning_status)}
                      </StatusPill>
                    ),
                  },
                  {
                    label: "Admin state",
                    value: listener.admin_state_up ? "Up" : "Down",
                  },
                  { label: "Description", value: listener.description || "-" },
                  {
                    label: "Default pool",
                    value:
                      tree.data.pools.find(
                        (p) => p.id === listener.default_pool_id,
                      )?.name ||
                      listener.default_pool_id ||
                      "None",
                  },
                  {
                    label: "Connection limit",
                    value:
                      listener.connection_limit === -1
                        ? "Unlimited"
                        : (listener.connection_limit ?? "-"),
                  },
                  {
                    label: "Allowed CIDRs",
                    value: listener.allowed_cidrs.length
                      ? listener.allowed_cidrs.join(", ")
                      : "All",
                  },
                  {
                    label: "Inserted headers",
                    value:
                      Object.keys(listener.insert_headers)
                        .filter((k) => listener.insert_headers[k] === "true")
                        .join(", ") || "None",
                  },
                  ...(listener.default_tls_container_ref
                    ? [
                        {
                          label: "TLS certificate",
                          value: (
                            <code>{listener.default_tls_container_ref}</code>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </Panel>
            <Panel title="Timeouts" headingLevel={2}>
              <KeyValueList
                items={[
                  {
                    label: "Client data",
                    value: `${listener.timeout_client_data ?? "-"} ms`,
                  },
                  {
                    label: "Member connect",
                    value: `${listener.timeout_member_connect ?? "-"} ms`,
                  },
                  {
                    label: "Member data",
                    value: `${listener.timeout_member_data ?? "-"} ms`,
                  },
                  {
                    label: "TCP inspect",
                    value: `${listener.timeout_tcp_inspect ?? "-"} ms`,
                  },
                ]}
              />
            </Panel>
          </div>
          <DataTable
            id="l7policies"
            label="L7 policies"
            columns={columns}
            rows={policies}
            getRowId={(row) => row.id}
            emptyTitle="No L7 policies"
            emptyBody={
              <p>
                Policies route or reject requests by host, path, header or
                cookie.
              </p>
            }
            defaultSort={{ column: "position", direction: "ascending" }}
            toolbarActions={
              <Button
                size="xs"
                onPress={() => setDialog({ kind: "policy", policy: null })}
              >
                Create policy
              </Button>
            }
            rowActions={(row) => [
              {
                id: "rules",
                label: "Manage rules",
                onAction: () => setRulesOf(row.id),
              },
              {
                id: "edit",
                label: "Edit policy",
                onAction: () => setDialog({ kind: "policy", policy: row }),
              },
              {
                id: "delete",
                label: "Delete policy",
                tone: "danger",
                onAction: () => setDeletingPolicy(row),
              },
            ]}
          />
          {rulesPolicy && (
            <RulesPanel
              key={rulesPolicy.id}
              projectId={projectId}
              policy={rulesPolicy}
              onClose={() => setRulesOf(null)}
            />
          )}
        </div>
      )}
      {dialog?.kind === "edit" && listener && tree.data && (
        <EditListenerDialog
          projectId={projectId}
          tree={tree.data}
          listener={listener}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "policy" && tree.data && (
        <L7PolicyDialog
          projectId={projectId}
          tree={tree.data}
          listenerId={listenerId}
          policy={dialog.policy}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete listener ${listener?.name || listenerId}?`}
        confirmLabel="Delete"
        isPending={removeListener.isPending}
        error={removeListener.error}
        onConfirm={() =>
          removeListener.mutate(listenerId, {
            onSuccess: () => {
              notify.success("Deleting the listener.");
              void navigate({
                to: "/load-balancers/$lbId",
                params: { lbId },
                search: { tab: "listeners" },
              });
            },
          })
        }
      >
        <p>Its L7 policies are deleted with it.</p>
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={deletingPolicy !== null}
        onOpenChange={(open) => !open && setDeletingPolicy(null)}
        title={`Delete policy ${deletingPolicy?.name || deletingPolicy?.id}?`}
        confirmLabel="Delete"
        isPending={removePolicy.isPending}
        error={removePolicy.error}
        onConfirm={() => {
          if (!deletingPolicy) return;
          removePolicy.mutate(deletingPolicy.id, {
            onSuccess: () => {
              notify.success("Deleting the policy.");
              setDeletingPolicy(null);
            },
          });
        }}
      >
        <p>Its rules are deleted with it.</p>
      </ConfirmDialog>
    </>
  );
}

/**
 * One policy's rules, in a panel on the listener page (not a dialog), so
 * adding a rule opens a single modal and focus comes back to the panel's
 * own Add rule button when it closes.
 */
function RulesPanel({
  projectId,
  policy,
  onClose,
}: {
  projectId: string;
  policy: L7Policy;
  onClose: () => void;
}) {
  const detail = useQuery(l7PolicyQuery(projectId, policy.id));
  const remove = useDeleteL7Rule(projectId);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<L7Rule | null>(null);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    region.current?.focus();
  }, [policy.id]);
  const columns = useMemo<ColumnDef<L7Rule>[]>(
    () => [
      {
        id: "type",
        label: "Type",
        isRowHeader: true,
        cell: (row) => row.type.replace(/_/g, " "),
      },
      {
        id: "compare",
        label: "Comparison",
        cell: (row) => row.compare_type.replace(/_/g, " "),
      },
      { id: "key", label: "Key", cell: (row) => row.key ?? "" },
      { id: "value", label: "Value", cell: (row) => <code>{row.value}</code> },
      {
        id: "invert",
        label: "Inverted",
        cell: (row) => (row.invert ? "Yes" : "No"),
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
    [],
  );
  const title = `Rules of ${policy.name || policy.id}`;
  return (
    <div ref={region} tabIndex={-1} className={styles.rulesPanel}>
      <Panel
        title={title}
        headingLevel={2}
        actions={
          <div className={styles.actions}>
            <Button size="xs" onPress={() => setAdding(true)}>
              Add rule
            </Button>
            <Button variant="secondary" size="xs" onPress={onClose}>
              Close rules
            </Button>
          </div>
        }
      >
        <DataTable
          id="l7rules"
          label={title}
          columns={columns}
          rows={detail.data?.rule_rows ?? []}
          getRowId={(row) => row.id}
          isLoading={detail.isPending}
          isFetching={detail.isFetching}
          error={detail.error}
          onRetry={() => void detail.refetch()}
          onRefresh={() => void detail.refetch()}
          emptyTitle="No rules yet"
          emptyBody={<p>A policy with no rules matches no requests.</p>}
          rowActions={(row) => [
            {
              id: "delete",
              label: "Delete rule",
              tone: "danger",
              onAction: () => setDeleting(row),
            },
          ]}
        />
      </Panel>
      {adding && (
        <L7RuleDialog
          projectId={projectId}
          policy={policy}
          onClose={() => setAdding(false)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this rule?"
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(
            { policyId: policy.id, ruleId: deleting.id },
            {
              onSuccess: () => {
                notify.success("Deleting the rule.");
                setDeleting(null);
              },
            },
          );
        }}
      />
    </div>
  );
}

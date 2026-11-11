// One listener: overview, edit, and its L7 policies with their rules.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { toRowActions } from "../../../lib/actions";
import type {
  L7Policy,
  Listener,
  LoadBalancerTree,
} from "../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import {
  deleteL7Policy,
  deleteListener,
  loadBalancerTreeQuery,
  loadBalancerWriteKeys,
} from "../api";
import { L7PolicyDialog } from "../l7/dialogs/L7PolicyDialog";
import { PolicyRulesDialog } from "../l7/dialogs/PolicyRulesDialog";
import { availableListenerActions, availablePolicyActions } from "../status";
import { EditListenerDialog } from "./dialogs/EditListenerDialog";
import { ListenerSummary } from "./ListenerSummary";
import { useL7PolicyColumns } from "./useL7PolicyColumns";
import styles from "../LoadBalancers.module.scss";

const listenerRoute = getRouteApi(
  "/app/load-balancers/$lbId/listeners/$listenerId",
);

/** A listener's or policy's id, and its name or id. */
const idOf = (item: { id: string }) => item.id;
const nameOf = (item: { name: string | null; id: string }) =>
  item.name || item.id;

/** The listener in its load balancer's tree, with the tree its page reads. */
function findListener(tree: LoadBalancerTree, listenerId: string) {
  const listener = tree.listeners.find((l) => l.id === listenerId);
  return listener && { tree, listener };
}

type Dialog =
  | { kind: "edit" }
  | { kind: "policy"; policy: L7Policy | null }
  | { kind: "rules"; policy: L7Policy }
  | null;

/**
 * One listener's page, read from its load balancer's tree: its summary,
 * and its L7 policies, created, edited, deleted and given rules here.
 * Every change waits while the load balancer is PENDING_*.
 */
export function ListenerDetailPage() {
  const projectId = useProjectId();
  const { lbId, listenerId } = listenerRoute.useParams();
  const navigate = useNavigate();
  const tree = useQuery(loadBalancerTreeQuery(projectId, lbId));
  const [dialog, setDialog] = useState<Dialog>(null);
  const removeListener = useBulkAction<Listener, "delete">({
    noun: { one: "listener", many: "listeners" },
    name: nameOf,
    getId: idOf,
    invalidates: loadBalancerWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (listener) => deleteListener(listener.id),
        body: <p>Its L7 policies are deleted with it.</p>,
        onSucceeded: () =>
          void navigate({
            to: "/load-balancers/$lbId",
            params: { lbId },
            search: { tab: "listeners" },
          }),
      },
    },
  });
  const removePolicy = useBulkAction<L7Policy, "delete">({
    noun: { one: "policy", many: "policies" },
    name: nameOf,
    getId: idOf,
    invalidates: loadBalancerWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (policy) => deleteL7Policy(policy.id),
        body: <p>Its rules are deleted with it.</p>,
      },
    },
  });
  const selected = tree.data && findListener(tree.data, listenerId);
  const policies = useMemo(
    () =>
      (tree.data?.l7policies ?? []).filter((p) => p.listener_id === listenerId),
    [tree.data, listenerId],
  );
  const lbName = tree.data?.load_balancer.name || lbId;
  const lbStatus = tree.data?.load_balancer.provisioning_status ?? null;
  const columns = useL7PolicyColumns(tree.data?.pools);

  return (
    <>
      <DetailPage
        query={tree}
        select={(data) => findListener(data, listenerId)}
        noun="listener"
        id={listenerId}
        crumbs={[
          { label: "Project" },
          { label: "Network" },
          { label: "Load balancers", href: "/load-balancers" },
          { label: lbName, href: `/load-balancers/${lbId}?tab=listeners` },
        ]}
        backTo={{
          label: "listeners",
          href: `/load-balancers/${lbId}?tab=listeners`,
        }}
        title={({ listener }) => listener.name || listener.id}
        actions={({ listener }) => (
          <RowActionsMenu
            actions={toRowActions(
              availableListenerActions(listener, lbStatus),
              (id) =>
                id === "edit"
                  ? setDialog({ kind: "edit" })
                  : removeListener.run("delete", [listener]),
            )}
          />
        )}
      >
        {({ tree: { pools }, listener }) => (
          <div className={styles.stack}>
            <ListenerSummary listener={listener} pools={pools} />
            <DataTable
              id="l7policies"
              label="L7 policies"
              columns={columns}
              rows={policies}
              getRowId={idOf}
              {...removePolicy.tableProps}
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
              rowActions={(row) =>
                toRowActions(availablePolicyActions(row, lbStatus), (id) => {
                  if (id === "rules") setDialog({ kind: "rules", policy: row });
                  else if (id === "edit")
                    setDialog({ kind: "policy", policy: row });
                  else removePolicy.run("delete", [row]);
                })
              }
            />
          </div>
        )}
      </DetailPage>
      {dialog?.kind === "edit" && selected && (
        <EditListenerDialog
          tree={selected.tree}
          listener={selected.listener}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "policy" && tree.data && (
        <L7PolicyDialog
          tree={tree.data}
          listenerId={listenerId}
          policy={dialog.policy}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rules" && (
        <PolicyRulesDialog
          policy={dialog.policy}
          lbStatus={lbStatus}
          onClose={() => setDialog(null)}
        />
      )}
      {removeListener.dialog}
      {removePolicy.dialog}
    </>
  );
}

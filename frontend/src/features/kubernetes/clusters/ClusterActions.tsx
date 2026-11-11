// Every cluster action behind one hook, shared by the clusters list and the
// cluster page: `run(action, clusters)` deletes the batch after asking, or
// downloads, navigates or opens a dialog for the first cluster. The hook
// returns the dialogs to render.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { Cluster } from "../../../lib/api/types/kubernetes";
import { downloadText } from "../../../lib/download";
import { notify } from "../../../lib/notify";
import {
  deleteCluster,
  fetchClusterCa,
  fetchClusterConfig,
  kubernetesWriteKeys,
} from "../api";
import { availableClusterActions, type ClusterActionId } from "../status";
import { SignCertificateDialog } from "./dialogs/SignCertificateDialog";
import { UpgradeClusterDialog } from "./dialogs/UpgradeClusterDialog";

type Dialog = { kind: "upgrade" | "sign"; cluster: Cluster } | null;

const getId = (cluster: Cluster) => cluster.id;
const getName = (cluster: Cluster) => cluster.name;

/**
 * The cluster actions. `onDeleted` runs once a delete has removed at least
 * one cluster, so the cluster page can go back to the list.
 */
export function useClusterActions(onDeleted?: () => void) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const bulk = useBulkAction<Cluster, "delete">({
    noun: { one: "cluster", many: "clusters" },
    name: getName,
    getId,
    invalidates: kubernetesWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (cluster) => deleteCluster(cluster.id),
        body: (clusters) => (
          <>
            {clusters.some((c) => c.status === "CREATE_IN_PROGRESS") && (
              <p>
                A cluster still being created stops building, and what it has
                built so far is removed.
              </p>
            )}
            <p>
              Every node, volume and load balancer the cluster created is
              removed. This cannot be undone.
            </p>
          </>
        ),
        eligible: (cluster) =>
          allows(availableClusterActions(cluster), "delete"),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: ClusterActionId, clusters: Cluster[]) => {
    if (action === "delete") {
      bulk.run(action, clusters);
      return;
    }
    const [cluster] = clusters;
    if (!cluster) return;
    switch (action) {
      case "config":
        void downloadConfig(cluster);
        break;
      case "certificate":
        void downloadCa(cluster);
        break;
      case "sign":
      case "upgrade":
        setDialog({ kind: action, cluster });
        break;
      case "nodegroups":
        void navigate({
          to: "/kubernetes/clusters/$clusterId",
          params: { clusterId: cluster.id },
          search: { tab: "nodegroups" },
        });
        break;
    }
  };

  const dialogs: ReactNode = (
    <>
      {dialog?.kind === "upgrade" && (
        <UpgradeClusterDialog
          cluster={dialog.cluster}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "sign" && (
        <SignCertificateDialog
          cluster={dialog.cluster}
          onClose={() => setDialog(null)}
        />
      )}
      {bulk.dialog}
    </>
  );
  return { run, dialogs, tableProps: bulk.tableProps };
}

async function downloadConfig(cluster: Cluster): Promise<void> {
  try {
    const config = await fetchClusterConfig(cluster.id);
    downloadText(
      `${cluster.name}_config`,
      config.kubeconfig,
      "application/x-yaml",
    );
    notify.success(
      `Downloaded the kubeconfig for ${cluster.name}. It embeds a client certificate signed for this download; keep it safe.`,
    );
  } catch (error) {
    notify.danger(
      `Could not build the cluster config: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Saves the cluster's CA certificate, fetched through the API client so a
 * failure (no CA yet, the service down) reaches a toast.
 */
async function downloadCa(cluster: Cluster): Promise<void> {
  try {
    const pem = await fetchClusterCa(cluster.id);
    downloadText(`${cluster.name}_ca.pem`, pem, "application/x-pem-file");
  } catch (error) {
    notify.danger(
      `Could not download the CA certificate of ${cluster.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// The cluster row actions that need a dialog or a download, shared by the
// list and the detail page.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Cluster } from "../../lib/api/types";
import { downloadText, downloadUrl } from "../../lib/download";
import { notify } from "../../lib/notify";
import { fetchClusterConfig } from "./api";
import { SignCertificateDialog, UpgradeClusterDialog } from "./ClusterDialogs";

export type ClusterActionId =
  "config" | "certificate" | "sign" | "upgrade" | "nodegroups";

type Dialog = { kind: "upgrade" | "sign"; cluster: Cluster } | null;

export function useClusterActions(projectId: string): {
  run: (action: ClusterActionId, cluster: Cluster) => void;
  dialogs: ReactNode;
} {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);

  const run = (action: ClusterActionId, cluster: Cluster) => {
    switch (action) {
      case "config":
        void downloadConfig(cluster);
        break;
      case "certificate":
        downloadUrl(
          `/api/kubernetes/clusters/${cluster.id}/ca.pem`,
          `${cluster.name}_ca.pem`,
        );
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

  const dialogs = (
    <>
      {dialog?.kind === "upgrade" && (
        <UpgradeClusterDialog
          projectId={projectId}
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
    </>
  );
  return { run, dialogs };
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

// The overview tab of a cluster: status and health, nodes and the
// configuration it was created with.
import { Alert } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import type { Cluster } from "../../../../lib/api/types/kubernetes";
import { formatDateTime } from "../../../../lib/format";
import {
  healthLabel,
  healthReason,
  healthTone,
  statusLabel,
  statusTone,
} from "../../status";
import styles from "../../Kubernetes.module.scss";

/**
 * A cluster's status, health, nodes and configuration, with the failure
 * reason on top when the last operation failed; its template and key pair
 * link to their pages.
 */
export function OverviewTab({ cluster }: { cluster: Cluster }) {
  const reason = healthReason(cluster);
  return (
    <div className={styles.grid}>
      {cluster.status_reason && cluster.status?.endsWith("_FAILED") && (
        <Alert tone="danger" role="status">
          {cluster.status_reason}
        </Alert>
      )}
      <Panel title="Status">
        <KeyValueList
          items={[
            {
              label: "Status",
              value: (
                <StatusPill tone={statusTone(cluster.status)}>
                  {statusLabel(cluster.status)}
                </StatusPill>
              ),
            },
            {
              label: "Health",
              value: (
                <StatusPill tone={healthTone(cluster.health_status)}>
                  {healthLabel(cluster.health_status)}
                </StatusPill>
              ),
            },
            ...(reason ? [{ label: "Health detail", value: reason }] : []),
            {
              label: "Created",
              value: formatDateTime(cluster.created_at),
            },
            {
              label: "Updated",
              value: formatDateTime(cluster.updated_at),
            },
            { label: "ID", value: <code>{cluster.id}</code> },
          ]}
        />
      </Panel>
      <Panel title="Nodes">
        <KeyValueList
          items={[
            {
              label: "Control plane nodes",
              value: cluster.master_count,
            },
            { label: "Worker nodes", value: cluster.node_count },
            {
              label: "Kubernetes API",
              value: cluster.api_address ? (
                <code>{cluster.api_address}</code>
              ) : (
                "Not ready"
              ),
            },
            {
              label: "Control plane addresses",
              value: cluster.master_addresses.join(", "),
            },
            {
              label: "Node addresses",
              value: cluster.node_addresses.join(", "),
            },
          ]}
        />
      </Panel>
      <Panel title="Configuration">
        <KeyValueList
          items={[
            {
              label: "Kubernetes version",
              value: cluster.kubernetes_version,
            },
            {
              label: "Template",
              value: cluster.cluster_template_id ? (
                <AppLink
                  to="/kubernetes/cluster-templates/$templateId"
                  params={{ templateId: cluster.cluster_template_id }}
                >
                  {cluster.template_name ?? cluster.cluster_template_id}
                </AppLink>
              ) : null,
            },
            {
              label: "Availability zone",
              value: cluster.availability_zone,
            },
            { label: "Network driver", value: cluster.network_driver },
            {
              label: "Control plane flavour",
              value: cluster.master_flavor_id,
            },
            { label: "Worker flavour", value: cluster.flavor_id },
            {
              label: "Key pair",
              value: cluster.keypair ? (
                <AppLink
                  to="/compute/key-pairs/$name"
                  params={{ name: cluster.keypair }}
                >
                  {cluster.keypair}
                </AppLink>
              ) : null,
            },
            {
              label: "Create timeout",
              value: cluster.create_timeout
                ? `${cluster.create_timeout} minutes`
                : "Infinite",
            },
          ]}
        />
      </Panel>
    </div>
  );
}

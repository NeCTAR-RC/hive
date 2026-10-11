// One cluster template (magnum-ui cluster template overview).
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { formatDateTime } from "../../lib/format";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { templateRoute } from "../../app/router";
import { templateQuery } from "./api";
import styles from "./Kubernetes.module.scss";

function yesNo(value: boolean | null | undefined) {
  return value === null || value === undefined ? "-" : value ? "Yes" : "No";
}

export function ClusterTemplateDetailPage() {
  const projectId = useProjectId();
  const { templateId } = templateRoute.useParams();
  const template = useQuery(templateQuery(projectId, templateId));
  const data = template.data;
  return (
    <>
      <PageHeader
        title={data?.name ?? "Cluster template"}
        crumbs={[
          { label: "Project" },
          { label: "Container Infra" },
          { label: "Cluster Templates", href: "/kubernetes/cluster-templates" },
        ]}
      />
      {template.isPending ? (
        <SkeletonLines lines={10} />
      ) : template.isError ? (
        <ErrorState error={template.error} onRetry={() => template.refetch()} />
      ) : (
        <div className={styles.grid}>
          <Panel title="Cluster type" headingLevel={2}>
            <KeyValueList
              items={[
                { label: "ID", value: <code>{data!.id}</code> },
                {
                  label: "Kubernetes version",
                  value: data!.kubernetes_version ?? "-",
                },
                {
                  label: "Availability zone",
                  value: data!.availability_zone ?? "-",
                },
                { label: "COE", value: data!.coe ?? "-" },
                { label: "Distro", value: data!.cluster_distro ?? "-" },
                { label: "Server type", value: data!.server_type ?? "-" },
                { label: "Public", value: yesNo(data!.public) },
                { label: "TLS disabled", value: yesNo(data!.tls_disabled) },
                {
                  label: "Registry enabled",
                  value: yesNo(data!.registry_enabled),
                },
              ]}
            />
          </Panel>
          <Panel title="Node specification" headingLevel={2}>
            <KeyValueList
              items={[
                { label: "Image", value: <code>{data!.image_id ?? "-"}</code> },
                { label: "Key pair", value: data!.keypair_id ?? "-" },
                { label: "Flavour", value: data!.flavor_id ?? "-" },
                {
                  label: "Control plane flavour",
                  value: data!.master_flavor_id ?? "-",
                },
                { label: "Volume driver", value: data!.volume_driver ?? "-" },
                {
                  label: "Docker storage driver",
                  value: data!.docker_storage_driver ?? "-",
                },
                {
                  label: "Docker volume size",
                  value: data!.docker_volume_size ?? "-",
                },
              ]}
            />
          </Panel>
          <Panel title="Network" headingLevel={2}>
            <KeyValueList
              items={[
                { label: "Network driver", value: data!.network_driver ?? "-" },
                {
                  label: "External network",
                  value: data!.external_network_id ?? "-",
                },
                { label: "Fixed network", value: data!.fixed_network ?? "-" },
                { label: "Fixed subnet", value: data!.fixed_subnet ?? "-" },
                { label: "DNS", value: data!.dns_nameserver ?? "-" },
                {
                  label: "Control plane load balancer",
                  value: yesNo(data!.master_lb_enabled),
                },
                {
                  label: "Floating IP",
                  value: yesNo(data!.floating_ip_enabled),
                },
              ]}
            />
          </Panel>
          <Panel title="Labels" headingLevel={2}>
            {Object.keys(data!.labels).length === 0 ? (
              <p>None</p>
            ) : (
              <KeyValueList
                items={Object.entries(data!.labels).map(([key, value]) => ({
                  label: key,
                  value: <code>{value}</code>,
                }))}
              />
            )}
          </Panel>
          <Panel title="Record" headingLevel={2}>
            <KeyValueList
              items={[
                {
                  label: "Created",
                  value: formatDateTime(data!.created_at) || "-",
                },
                {
                  label: "Updated",
                  value: formatDateTime(data!.updated_at) || "-",
                },
                {
                  label: "Upgrade targets",
                  value: data!.upgrade_targets.length
                    ? data!.upgrade_targets.join(", ")
                    : "None",
                },
              ]}
            />
          </Panel>
        </div>
      )}
    </>
  );
}

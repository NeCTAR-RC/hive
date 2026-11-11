// One cluster template (magnum-ui cluster template overview).
import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { imageQuery } from "../../compute/api";
import { templateQuery, templatesQuery } from "../api";
import { createFromTemplateSearch } from "../status";
import styles from "../Kubernetes.module.scss";

const templateRoute = getRouteApi(
  "/app/kubernetes/cluster-templates/$templateId",
);

/** "Yes" or "No", or empty when the template does not say (`KeyValueList` shows its dash). */
function yesNo(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  return value ? "Yes" : "No";
}

/**
 * One template's page: its settings, its image and upgrade targets linked
 * by name, and "Create cluster", which pre-fills the create form with its
 * version, zone and driver. Public templates belong to no project, so not
 * found says "visible to this project".
 */
export function ClusterTemplateDetailPage() {
  const projectId = useProjectId();
  const { templateId } = templateRoute.useParams();
  const template = useQuery(templateQuery(projectId, templateId));
  const templates = useQuery(templatesQuery(projectId));
  const imageId = template.data?.image_id ?? "";
  const image = useQuery({
    ...imageQuery(projectId, imageId),
    enabled: imageId !== "",
  });
  const templateName = (id: string) =>
    templates.data?.items.find((t) => t.id === id)?.name ?? id;
  return (
    <DetailPage
      query={template}
      noun="cluster template"
      id={templateId}
      scope="visible"
      crumbs={[
        { label: "Project" },
        { label: "Container infra" },
        { label: "Cluster templates", href: "/kubernetes/cluster-templates" },
      ]}
      backTo={{
        label: "cluster templates",
        href: "/kubernetes/cluster-templates",
      }}
      title={(data) => data.name}
      actions={(data) => (
        <AppLink
          variant="primary"
          size="sm"
          to="/kubernetes/clusters/new"
          search={createFromTemplateSearch(data)}
        >
          Create cluster
        </AppLink>
      )}
    >
      {(data) => (
        <div className={styles.grid}>
          <Panel title="Cluster type" headingLevel={2}>
            <KeyValueList
              items={[
                { label: "ID", value: <code>{data.id}</code> },
                {
                  label: "Kubernetes version",
                  value: data.kubernetes_version,
                },
                {
                  label: "Availability zone",
                  value: data.availability_zone,
                },
                { label: "COE", value: data.coe },
                { label: "Distro", value: data.cluster_distro },
                { label: "Server type", value: data.server_type },
                { label: "Public", value: yesNo(data.public) },
                { label: "TLS disabled", value: yesNo(data.tls_disabled) },
                {
                  label: "Registry enabled",
                  value: yesNo(data.registry_enabled),
                },
              ]}
            />
          </Panel>
          <Panel title="Node specification" headingLevel={2}>
            <KeyValueList
              items={[
                {
                  label: "Image",
                  value: data.image_id ? (
                    <AppLink
                      to="/compute/images/$imageId"
                      params={{ imageId: data.image_id }}
                    >
                      {image.data?.name ?? data.image_id}
                    </AppLink>
                  ) : null,
                },
                { label: "Key pair", value: data.keypair_id },
                { label: "Flavour", value: data.flavor_id },
                {
                  label: "Control plane flavour",
                  value: data.master_flavor_id,
                },
                { label: "Volume driver", value: data.volume_driver },
                {
                  label: "Docker storage driver",
                  value: data.docker_storage_driver,
                },
                {
                  label: "Docker volume size",
                  value: data.docker_volume_size,
                },
              ]}
            />
          </Panel>
          <Panel title="Network" headingLevel={2}>
            <KeyValueList
              items={[
                { label: "Network driver", value: data.network_driver },
                {
                  label: "External network",
                  value: data.external_network_id,
                },
                { label: "Fixed network", value: data.fixed_network },
                { label: "Fixed subnet", value: data.fixed_subnet },
                { label: "DNS", value: data.dns_nameserver },
                {
                  label: "Control plane load balancer",
                  value: yesNo(data.master_lb_enabled),
                },
                {
                  label: "Floating IP",
                  value: yesNo(data.floating_ip_enabled),
                },
              ]}
            />
          </Panel>
          <Panel title="Labels" headingLevel={2}>
            {Object.keys(data.labels).length === 0 ? (
              <p>None</p>
            ) : (
              <KeyValueList
                items={Object.entries(data.labels).map(([key, value]) => ({
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
                  value: formatDateTime(data.created_at),
                },
                {
                  label: "Updated",
                  value: formatDateTime(data.updated_at),
                },
                {
                  label: "Upgrade targets",
                  value: data.upgrade_targets.length
                    ? data.upgrade_targets.map((id, index) => (
                        <Fragment key={id}>
                          {index > 0 && ", "}
                          <AppLink
                            to="/kubernetes/cluster-templates/$templateId"
                            params={{ templateId: id }}
                          >
                            {templateName(id)}
                          </AppLink>
                        </Fragment>
                      ))
                    : "None",
                },
              ]}
            />
          </Panel>
        </div>
      )}
    </DetailPage>
  );
}

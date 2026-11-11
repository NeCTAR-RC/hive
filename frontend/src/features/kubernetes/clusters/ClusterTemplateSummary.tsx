// The create cluster page's side panel: the template the pickers chose.
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import type { ClusterTemplate } from "../../../lib/api/types/kubernetes";
import styles from "../Kubernetes.module.scss";

/**
 * The template a new cluster will be built from, or a hint to finish the
 * version, zone and driver pickers while none is chosen.
 */
export function ClusterTemplateSummary({
  template,
}: {
  template: ClusterTemplate | undefined;
}) {
  return (
    <aside className={styles.summary} aria-label="Template">
      <Panel title="Template" headingLevel={2}>
        {template ? (
          <KeyValueList
            items={[
              { label: "Template", value: template.name },
              {
                label: "Kubernetes",
                value: template.kubernetes_version,
              },
              { label: "Zone", value: template.availability_zone },
              {
                label: "Network driver",
                value: template.network_driver,
              },
              {
                label: "Image",
                value: template.image_id ? (
                  <code>{template.image_id}</code>
                ) : null,
              },
              {
                label: "Control plane load balancer",
                value: template.master_lb_enabled ? "Yes" : "No",
              },
            ]}
          />
        ) : (
          <p>
            Choose a Kubernetes version, availability zone and network driver to
            see the template that will be used.
          </p>
        )}
      </Panel>
    </aside>
  );
}

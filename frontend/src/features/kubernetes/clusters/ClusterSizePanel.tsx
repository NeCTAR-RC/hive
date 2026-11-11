// The create cluster form's size section: control plane and worker counts
// and flavours, and the workers' autoscaling.
import { useWatch } from "react-hook-form";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../components/Form/fields";
import { Panel } from "../../../components/Panel/Panel";
import type { ClusterFlavor } from "../../../lib/api/types/kubernetes";
import { formatMb } from "../../../lib/format";
import type { ClusterFormValues } from "./request";
import styles from "../Kubernetes.module.scss";

/**
 * The control plane and worker sizes, read from the form in context. A
 * single master template allows one control plane node only, and says so.
 * `quotaLeft` says what the project's compute quota has left, under the
 * worker count. Autoscaling, once on, asks for the fewest and most
 * workers the cluster autoscaler may run.
 */
export function ClusterSizePanel({
  flavors,
  controlPlaneSizes,
  singleMaster,
  quotaLeft,
}: {
  flavors: readonly ClusterFlavor[];
  controlPlaneSizes: readonly number[];
  singleMaster: boolean;
  quotaLeft: string | undefined;
}) {
  const { NumberInput, SelectInput, SwitchInput } =
    fieldsFor<ClusterFormValues>();
  const autoscaling = useWatch<ClusterFormValues, "autoscaling">({
    name: "autoscaling",
  });
  const flavorOptions = flavors.map((f) => ({
    id: f.name ?? "",
    label: `${f.name} (${f.vcpus ?? "?"} vCPU, ${formatMb(f.ram_mb) || "?"})`,
  }));
  return (
    <Panel title="Size" headingLevel={2}>
      <div className={styles.fields}>
        {singleMaster && (
          <Alert tone="info" role="status">
            This template runs a single control plane node.
          </Alert>
        )}
        <SelectInput
          name="master_count"
          label="Control plane nodes"
          description="Supported control plane sizes are 1, 3, 5 or 7."
          options={controlPlaneSizes.map((n) => ({
            id: String(n),
            label: String(n),
            isDisabled: singleMaster && n !== 1,
          }))}
          isRequired
        />
        <SelectInput
          name="master_flavor_id"
          label="Control plane flavour"
          options={flavorOptions}
          isRequired
        />
        <NumberInput
          name="node_count"
          label="Worker nodes"
          minValue={0}
          isRequired
          {...(quotaLeft ? { description: quotaLeft } : {})}
        />
        <SelectInput
          name="flavor_id"
          label="Worker flavour"
          options={flavorOptions}
          isRequired
        />
        <SwitchInput name="autoscaling" label="Autoscale the workers" />
        {autoscaling && (
          <>
            <NumberInput
              name="min_node_count"
              label="Fewest workers"
              minValue={0}
              isRequired
            />
            <NumberInput
              name="max_node_count"
              label="Most workers"
              description="The cluster autoscaler adds and removes workers within these bounds."
              minValue={1}
              isRequired
            />
          </>
        )}
      </div>
    </Panel>
  );
}

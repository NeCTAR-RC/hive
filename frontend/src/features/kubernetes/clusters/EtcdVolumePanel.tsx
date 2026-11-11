// The create cluster form's advanced section: an optional etcd volume.
import { useWatch } from "react-hook-form";
import { fieldsFor } from "../../../components/Form/fields";
import { Panel } from "../../../components/Panel/Panel";
import type { ClusterFormValues } from "./request";
import styles from "../Kubernetes.module.scss";

/**
 * The switch that stores etcd on its own volume, with the volume's size and
 * type shown while it is on. Reads the form from context.
 */
export function EtcdVolumePanel() {
  const { NumberInput, SwitchInput, TextInput } =
    fieldsFor<ClusterFormValues>();
  const etcd = useWatch<ClusterFormValues, "etcd_volume">({
    name: "etcd_volume",
  });
  return (
    <Panel title="Advanced" headingLevel={2}>
      <div className={styles.fields}>
        <SwitchInput
          name="etcd_volume"
          label="Store etcd on a separate volume"
        />
        {etcd && (
          <>
            <NumberInput
              name="etcd_volume_size"
              label="etcd volume size"
              addon="GB"
              minValue={1}
              isRequired
            />
            <TextInput
              name="etcd_volume_type"
              label="etcd volume type"
              description="Leave blank for the default type."
            />
          </>
        )}
      </div>
    </Panel>
  );
}

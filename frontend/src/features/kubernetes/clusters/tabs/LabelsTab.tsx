// The labels tab of a cluster: the Magnum labels it was created with.
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import type { Cluster } from "../../../../lib/api/types/kubernetes";

/** A cluster's labels as key and value pairs, or "None" when it has none. */
export function LabelsTab({ cluster }: { cluster: Cluster }) {
  return (
    <Panel title="Labels">
      {Object.keys(cluster.labels).length === 0 ? (
        <p>None</p>
      ) : (
        <KeyValueList
          items={Object.entries(cluster.labels).map(([key, value]) => ({
            label: key,
            value: <code>{value}</code>,
          }))}
        />
      )}
    </Panel>
  );
}

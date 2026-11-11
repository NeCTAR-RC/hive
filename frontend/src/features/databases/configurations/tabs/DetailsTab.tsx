// The Details tab of a configuration group.
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import type { DbConfigurationDetail } from "../../../../lib/api/types/databases";
import { formatDateTime } from "../../../../lib/format";
import { datastoreLabel } from "../../status";

/** The group's name, description, datastore, dates and id. */
export function DetailsTab({
  configuration,
}: {
  configuration: DbConfigurationDetail;
}) {
  return (
    <Panel title="Details">
      <KeyValueList
        items={[
          { label: "Name", value: configuration.name },
          { label: "Description", value: configuration.description },
          { label: "Datastore", value: datastoreLabel(configuration) },
          {
            label: "Created",
            value: formatDateTime(configuration.created),
          },
          {
            label: "Updated",
            value: formatDateTime(configuration.updated),
          },
          { label: "ID", value: <code>{configuration.id}</code> },
        ]}
      />
    </Panel>
  );
}

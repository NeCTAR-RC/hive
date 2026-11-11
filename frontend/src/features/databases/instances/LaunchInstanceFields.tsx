// The fields of the database launch page in their four panels: details,
// networking and access, initial databases and user, and the advanced
// configuration group and restore-from-backup options.
import { useFormContext, useWatch } from "react-hook-form";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../components/Form/fields";
import { Panel } from "../../../components/Panel/Panel";
import type {
  DatastoreOption,
  DbConfiguration,
  DbFlavor,
  DbOptions,
} from "../../../lib/api/types/databases";
import { CIDR_WARNING, flavorLabel, hasOpenCidr, splitCidrs } from "../status";
import { datastoreKey, type LaunchValues } from "./launch";
import styles from "../Databases.module.scss";

/**
 * The launch form's fields, read from the page's form. The page works out
 * which datastores, flavours and configuration groups to offer; the
 * flavour and group pickers wait for a datastore.
 */
export function LaunchInstanceFields({
  options,
  datastores,
  flavors,
  configurations,
}: {
  options: DbOptions | undefined;
  datastores: DatastoreOption[];
  flavors: DbFlavor[];
  configurations: DbConfiguration[];
}) {
  const { NumberInput, SelectInput, TextAreaInput, TextInput } =
    fieldsFor<LaunchValues>();
  const { control } = useFormContext<LaunchValues>();
  const [datastore, cidrs, backupId] = useWatch({
    control,
    name: ["datastore", "allowed_cidrs", "backup_id"],
  });
  return (
    <>
      <Panel title="Details" headingLevel={2}>
        <div className={styles.fields}>
          <TextInput name="name" label="Instance name" isRequired />
          <SelectInput
            name="availability_zone"
            label="Availability zone"
            options={(options?.availability_zones ?? []).map((z) => ({
              id: z,
              label: z,
            }))}
          />
          <SelectInput
            name="datastore"
            label="Datastore"
            options={datastores.map((d) => ({
              id: datastoreKey(d),
              label: d.label,
            }))}
            isRequired
          />
          <SelectInput
            name="flavor"
            label="Flavour"
            options={flavors.map((f) => ({
              id: f.id ?? "",
              label: flavorLabel(f),
            }))}
            isRequired
            isDisabled={!datastore}
          />
          <NumberInput
            name="volume"
            label="Volume size"
            addon="GB"
            minValue={1}
            isRequired
          />
        </div>
      </Panel>
      <Panel title="Networking and access" headingLevel={2}>
        <div className={styles.fields}>
          <SelectInput
            name="network_id"
            label="Network"
            options={(options?.networks ?? []).map((n) => ({
              id: n.id,
              label: n.name || n.id,
            }))}
            isRequired
          />
          <TextAreaInput
            name="allowed_cidrs"
            label="Allowed CIDRs"
            description="One network per line, such as 203.0.113.0/24. Only these networks can reach the database; 0.0.0.0/0 lets any address try."
            isRequired
          />
          {hasOpenCidr(splitCidrs(cidrs ?? "")) && (
            <Alert tone="warning" role="status">
              {CIDR_WARNING}
            </Alert>
          )}
        </div>
      </Panel>
      <Panel title="Initialise databases" headingLevel={2}>
        <div className={styles.fields}>
          <TextInput
            name="databases"
            label="Initial databases"
            description="Comma separated names to create on launch."
          />
          <TextInput
            name="user"
            label="Initial admin user"
            autoComplete="off"
          />
          <TextInput
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
          />
          <TextInput
            name="host"
            label="Allowed host"
            description="Leave blank to allow the user from any host."
          />
        </div>
      </Panel>
      <Panel title="Advanced" headingLevel={2}>
        <div className={styles.fields}>
          <SelectInput
            name="configuration"
            label="Configuration group"
            options={[
              { id: "", label: "None" },
              ...configurations.map((c) => ({
                id: c.id,
                label: c.name || c.id,
              })),
            ]}
            isDisabled={!datastore}
          />
          <SelectInput
            name="backup_id"
            label="Restore from backup"
            options={[
              { id: "", label: "None" },
              ...(options?.backups ?? []).map((b) => ({
                id: b.id,
                label: `${b.name || b.id} (${b.datastore} ${b.datastore_version})`,
              })),
            ]}
          />
          {backupId && (
            <p className={styles.muted}>
              The datastore and version must match the backup.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}

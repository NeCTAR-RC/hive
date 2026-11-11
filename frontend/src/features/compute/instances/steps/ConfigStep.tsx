// The launch wizard's configuration step: user data, configuration drive,
// server group and metadata.
import { useId, useState } from "react";
import { useFormContext } from "react-hook-form";
import { FileInput } from "../../../../components/Form/FileInput";
import { fieldsFor } from "../../../../components/Form/fields";
import { KeyValueFields } from "../../../../components/Form/KeyValueFields";
import type { LaunchOptions } from "../../../../lib/api/types/compute";
import { NONE, type LaunchForm } from "../launchForm";
import styles from "../LaunchPage.module.scss";

const { SelectInput, SwitchInput, TextAreaInput } = fieldsFor<LaunchForm>();

/**
 * The customisation script run on first boot, typed or loaded from a file
 * (Horizon's "Load from file"), the configuration drive, the server group
 * the instance joins (or none) and its metadata rows, labelled as one
 * group. Horizon's disk partition and scheduler hints are left out.
 */
export function ConfigStep({ data }: { data: LaunchOptions }) {
  const metadataLabelId = useId();
  const form = useFormContext<LaunchForm>();
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const loadScript = (file: File | null) => {
    setScriptFile(file);
    if (!file) return;
    void file.text().then((text) => {
      form.setValue("user_data", text, {
        shouldValidate: true,
        shouldDirty: true,
      });
    });
  };
  const groups = [
    { id: NONE, label: "No server group" },
    ...(data.server_groups ?? []).map((group) => ({
      id: group.id,
      label: `${group.name} (${group.policy})`,
    })),
  ];
  return (
    <div className={styles.fields}>
      <FileInput
        label="Load script from file"
        value={scriptFile}
        onChange={loadScript}
        description="Its contents are loaded into the script below, where you can still edit them."
      />
      <TextAreaInput
        name="user_data"
        label="Customisation script (user data)"
        description="A cloud-init script or configuration run on first boot."
      />
      <div className={styles.volumeChoice}>
        <SwitchInput name="config_drive" label="Configuration drive" />
        <p className={styles.hint}>
          Also gives the instance its configuration on a read-only disk, for
          images that cannot reach the metadata service.
        </p>
      </div>
      <SelectInput
        name="server_group_id"
        label="Server group"
        description="Keeps instances together (affinity) or apart (anti-affinity)."
        options={groups}
        placeholder="No server group"
      />
      <div
        className={styles.metadata}
        role="group"
        aria-labelledby={metadataLabelId}
      >
        <div className={styles.groupHead}>
          <p id={metadataLabelId} className={styles.groupLabel}>
            Metadata
          </p>
          <p className={styles.hint}>
            Key and value pairs stored with the instance.
          </p>
        </div>
        <KeyValueFields name="metadata" addLabel="Add metadata" />
      </div>
    </div>
  );
}

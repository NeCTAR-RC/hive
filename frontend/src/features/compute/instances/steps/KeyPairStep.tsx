// The launch wizard's key pair step.
import { Button } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { NONE, type LaunchForm } from "../launchForm";
import styles from "../LaunchPage.module.scss";
import type { LaunchStepProps } from "./props";

const { SelectInput } = fieldsFor<LaunchForm>();

/**
 * The key pair installed on the instance, or none, with buttons that open
 * the create and import key pair dialogs over the wizard.
 */
export function KeyPairStep({ data, onOpenKeyPairDialog }: LaunchStepProps) {
  const options = [
    { id: NONE, label: "No key pair" },
    ...(data.key_pairs ?? []).map((keyPair) => ({
      id: keyPair.name,
      label: `${keyPair.name}${keyPair.fingerprint ? ` (${keyPair.fingerprint})` : ""}`,
    })),
  ];
  return (
    <div className={styles.fields}>
      <SelectInput
        name="key_name"
        label="Key pair"
        description="The public key is installed on the instance so you can log in with SSH."
        options={options}
        placeholder="Choose a key pair"
      />
      <div className={styles.inlineButtons}>
        <Button
          variant="secondary"
          size="xs"
          onPress={() => onOpenKeyPairDialog("create")}
        >
          Create key pair
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onPress={() => onOpenKeyPairDialog("import")}
        >
          Import public key
        </Button>
      </div>
    </div>
  );
}

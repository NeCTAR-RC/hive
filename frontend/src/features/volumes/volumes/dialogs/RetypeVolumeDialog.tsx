// The change volume type dialog (Horizon volumes/forms.py RetypeForm): a
// new type for the volume's zone and whether Cinder may move the data.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { OptionErrors } from "../../../../components/OptionErrors/OptionErrors";
import type { Volume } from "../../../../lib/api/types/volumes";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { useRetypeVolume, volumeOptionsQuery } from "../../api";
import { retypeChoices } from "../rules";
import {
  MIGRATION_POLICIES,
  retypeVolumeSchema,
  type RetypeVolumeValues,
} from "./schema";

const { SelectInput } = fieldsFor<RetypeVolumeValues>();

/**
 * Changes a volume's type. Only the other types that serve the volume's
 * zone are offered; the migration policy says whether Cinder may copy the
 * volume to other storage when the new type needs it.
 */
export function RetypeVolumeDialog({
  volume,
  onClose,
}: {
  volume: Volume;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(volumeOptionsQuery(projectId));
  const choices = useMemo(
    () => retypeChoices(options.data, volume),
    [options.data, volume],
  );
  const name = volume.name || volume.id;
  const { dialog } = useMutationForm({
    schema: retypeVolumeSchema,
    defaultValues: { volume_type: "", migration_policy: "never" },
    mutation: useRetypeVolume(),
    toVariables: (values) => ({
      volumeId: volume.id,
      volume_type: values.volume_type,
      migration_policy: values.migration_policy,
    }),
    successMessage: (_result, values) =>
      `Changing the type of volume ${name} to ${values.volume_type}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title={`Change volume type of ${name}`}
      submitLabel="Change volume type"
    >
      <OptionErrors errors={options.data?.errors} />
      <p>
        Current type: <strong>{volume.volume_type ?? "none"}</strong>.
      </p>
      <SelectInput
        name="volume_type"
        label="New volume type"
        options={choices}
        isRequired
        isDisabled={options.isPending || choices.length === 0}
        placeholder={
          options.isPending
            ? "Loading..."
            : choices.length === 0
              ? "No other volume types available"
              : "Choose a volume type"
        }
        description={
          options.data?.has_zoned_types && volume.availability_zone
            ? `Showing the types available in ${volume.availability_zone}, the volume's zone.`
            : undefined
        }
      />
      <SelectInput
        name="migration_policy"
        label="Migration policy"
        options={MIGRATION_POLICIES}
        isRequired
        description="Whether the volume may be copied to other storage when the new type needs it. Copying a large volume can take a long time."
      />
    </FormDialog>
  );
}

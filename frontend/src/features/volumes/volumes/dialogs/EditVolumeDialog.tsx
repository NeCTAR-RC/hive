// The edit volume dialog: name, description and the bootable flag.
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Volume } from "../../../../lib/api/types/volumes";
import { useUpdateVolume } from "../../api";
import { volumeUpdateRequest } from "./request";
import { editVolumeSchema, type EditVolumeValues } from "./schema";

/**
 * Edits a volume's name, description and bootable flag. Only the changed
 * fields are sent; with nothing changed the dialog closes without a request.
 */
export function EditVolumeDialog({
  volume,
  onClose,
}: {
  volume: Volume;
  onClose: () => void;
}) {
  const { SwitchInput, TextAreaInput, TextInput } =
    fieldsFor<EditVolumeValues>();
  const { dialog } = useMutationForm({
    schema: editVolumeSchema,
    defaultValues: {
      name: volume.name,
      description: volume.description ?? "",
      bootable: volume.bootable,
    },
    mutation: useUpdateVolume(),
    toVariables: (values) => {
      const body = volumeUpdateRequest(volume, values);
      return body && { volumeId: volume.id, ...body };
    },
    successMessage: (updated) =>
      `Volume ${updated.name || updated.id} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit volume ${volume.name || volume.id}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Volume name" />
      <TextAreaInput name="description" label="Description" />
      <SwitchInput
        name="bootable"
        label="Bootable (can be launched as an instance)"
      />
    </FormDialog>
  );
}

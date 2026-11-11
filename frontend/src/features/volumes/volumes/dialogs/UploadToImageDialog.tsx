// The upload to image dialog: copies a volume into a new image.
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Volume } from "../../../../lib/api/types/volumes";
import { useUploadToImage } from "../../api";
import {
  DISK_FORMATS,
  uploadToImageSchema,
  type UploadToImageValues,
} from "./schema";

/**
 * Uploads a volume to a new image in the chosen disk format. An attached
 * volume offers a force switch, which warns that the image may miss data
 * the instance has not written yet.
 */
export function UploadToImageDialog({
  volume,
  onClose,
}: {
  volume: Volume;
  onClose: () => void;
}) {
  const { SelectInput, SwitchInput, TextInput } =
    fieldsFor<UploadToImageValues>();
  const { dialog } = useMutationForm({
    schema: uploadToImageSchema,
    defaultValues: { image_name: "", disk_format: "raw", force: false },
    mutation: useUploadToImage(),
    toVariables: (values) => ({ volumeId: volume.id, ...values }),
    successMessage: (_result, values) =>
      `Uploading volume ${volume.name || volume.id} to image ${values.image_name}. It appears under Images once the copy finishes.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Upload ${volume.name || volume.id} to an image`}
      submitLabel="Upload to image"
    >
      <TextInput name="image_name" label="Image name" isRequired />
      <SelectInput
        name="disk_format"
        label="Disk format"
        options={DISK_FORMATS.map((format) => ({
          id: format,
          label: format.toUpperCase(),
        }))}
      />
      {volume.status === "in-use" && (
        <SwitchInput
          name="force"
          label="Upload while attached (the image may miss data the instance has not written yet)"
        />
      )}
    </FormDialog>
  );
}

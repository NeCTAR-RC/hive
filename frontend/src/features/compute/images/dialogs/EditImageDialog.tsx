// The edit image dialog.
import { useId } from "react";
import { z } from "zod";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import { KeyValueFields } from "../../../../components/Form/KeyValueFields";
import { keyValueSchema } from "../../../../components/Form/keyValue";
import type { Image } from "../../../../lib/api/types/compute";
import { maxLength } from "../../../../lib/validation";
import { useUpdateImage } from "../../api";
import styles from "../ImageDialogs.module.scss";
import {
  DESCRIPTION,
  imageDescription,
  propertyRows,
  updateImageRequest,
} from "./request";
import { VISIBILITIES } from "./visibilities";

const editSchema = z.object({
  name: maxLength(255).min(1, "Enter a name"),
  description: maxLength(255, { trim: false }),
  visibility: z.enum(["private", "community", "shared", "public"]),
  min_disk: z.number().int().min(0, "Cannot be negative"),
  min_ram: z.number().int().min(0, "Cannot be negative"),
  protected: z.boolean(),
  properties: keyValueSchema.refine(
    (rows) => rows.every((row) => row.key.trim() !== DESCRIPTION),
    { message: "Set the description in its own field" },
  ),
});

/**
 * Edits an image's name, description, visibility, minimums, protection
 * and custom properties (Horizon's Edit Image and Update Metadata),
 * sending only what changed. A visibility the dialog does not offer
 * (shared, public) stays listed while the image has it.
 */
export function EditImageDialog({
  image,
  onClose,
}: {
  image: Image;
  onClose: () => void;
}) {
  const propertiesLabelId = useId();
  const update = useUpdateImage();
  const { NumberInput, SelectInput, SwitchInput, TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof editSchema>>();
  const { dialog } = useMutationForm({
    schema: editSchema,
    defaultValues: {
      name: image.name ?? "",
      description: imageDescription(image),
      visibility: image.visibility,
      min_disk: image.min_disk ?? 0,
      min_ram: image.min_ram ?? 0,
      protected: image.protected,
      properties: propertyRows(image),
    },
    mutation: update,
    toVariables: (values) => updateImageRequest(image, values),
    successMessage: (updated) => `Image ${updated.name} updated.`,
    onDone: onClose,
  });
  const visibilities = VISIBILITIES.some((v) => v.id === image.visibility)
    ? VISIBILITIES
    : [{ id: image.visibility, label: image.visibility }, ...VISIBILITIES];
  return (
    <FormDialog
      {...dialog}
      title={`Edit image ${image.name ?? ""}`}
      submitLabel="Save"
      size="lg"
    >
      <TextInput name="name" label="Image name" isRequired />
      <TextAreaInput name="description" label="Description" />
      <SelectInput
        name="visibility"
        label="Visibility"
        options={visibilities}
      />
      <NumberInput
        name="min_disk"
        label="Minimum disk"
        addon="GB"
        minValue={0}
      />
      <NumberInput name="min_ram" label="Minimum RAM" addon="MB" minValue={0} />
      <SwitchInput name="protected" label="Protected (cannot be deleted)" />
      <div
        className={styles.properties}
        role="group"
        aria-labelledby={propertiesLabelId}
      >
        <div className={styles.groupHead}>
          <p id={propertiesLabelId} className={styles.groupLabel}>
            Properties
          </p>
          <p className={styles.hint}>
            Key and value pairs such as os_distro or hw_rng_model. Removing a
            row removes the property from the image.
          </p>
        </div>
        <KeyValueFields
          name="properties"
          addLabel="Add property"
          emptyText="No custom properties."
        />
      </div>
    </FormDialog>
  );
}

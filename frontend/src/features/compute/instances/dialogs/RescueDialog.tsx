// Rescue an instance from a chosen image: Horizon's RescueInstanceForm
// (project/instances/forms.py).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { launchOptionsQuery, useInstanceAction } from "../../api";
import { imageChoices } from "./imageChoices";
import type { InstanceDialogProps } from "./props";

const rescueSchema = z.object({
  image_id: z.string().min(1, "Choose a rescue image"),
});

/**
 * Boots the instance from a rescue image with its own disk attached, so
 * the user can repair it. The instance's own image is chosen to start
 * with when it is still offered.
 */
export function RescueDialog({ instance, onClose }: InstanceDialogProps) {
  const projectId = useProjectId();
  const options = useQuery(launchOptionsQuery(projectId));
  const images = imageChoices(options.data, instance.image?.id);
  const ownId = images.some((image) => image.id === instance.image?.id)
    ? instance.image?.id
    : undefined;
  const initial = useMemo(() => ({ image_id: ownId ?? "" }), [ownId]);
  const { SelectInput } = fieldsFor<z.infer<typeof rescueSchema>>();
  const { dialog } = useMutationForm({
    schema: rescueSchema,
    values: initial,
    mutation: useInstanceAction(),
    toVariables: (values) => ({
      instanceId: instance.id,
      body: { action: "rescue", rescue_image_id: values.image_id } as const,
    }),
    successMessage: `Rescuing ${instance.name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title={`Rescue ${instance.name}`}
      submitLabel="Rescue"
    >
      <p>
        Rescue boots the instance from a rescue image with its own disk attached
        as a second disk, so you can repair it. Unrescue returns it to normal.
      </p>
      <SelectInput
        name="image_id"
        label="Rescue image"
        options={images}
        isRequired
        isDisabled={options.isPending}
        placeholder={
          options.isPending ? "Loading images..." : "Choose a rescue image"
        }
      />
    </FormDialog>
  );
}

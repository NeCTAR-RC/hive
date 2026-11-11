// Resize volume (trove-dashboard databases/forms.py with the Nectar patches): a new
// size, larger than the current one.
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { DbInstance } from "../../../../lib/api/types/databases";
import { useResizeVolume } from "../../api";

const volumeSchema = z.object({
  size: z.number().int().min(1, "At least 1 GB"),
});

/** Grows the instance's volume; a volume can only grow. */
export function ResizeVolumeDialog({
  instance,
  onClose,
}: {
  instance: DbInstance;
  onClose: () => void;
}) {
  const current = instance.volume_size ?? 0;
  const { NumberInput } = fieldsFor<z.infer<typeof volumeSchema>>();
  const { dialog } = useMutationForm({
    schema: volumeSchema.refine((v) => v.size > current, {
      path: ["size"],
      message: `The new size must be greater than ${current} GB`,
    }),
    defaultValues: { size: current + 1 },
    mutation: useResizeVolume(),
    toVariables: (values) => ({ id: instance.id, size: values.size }),
    successMessage: (_result, values) =>
      `Resizing the volume of ${instance.name || instance.id} to ${values.size} GB.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Resize volume of ${instance.name || instance.id}`}
      submitLabel="Resize volume"
    >
      <p>The volume is currently {current} GB. Volumes can only grow.</p>
      <NumberInput
        name="size"
        label="New size"
        addon="GB"
        minValue={current + 1}
        isRequired
      />
    </FormDialog>
  );
}

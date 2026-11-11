// The resize share dialog (manila-ui shares/forms.py).
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Share } from "../../../../lib/api/types/shares";
import { useResizeShare } from "../../api";

const resizeSchema = z.object({
  size: z.number().int().min(1, "At least 1 GiB"),
});

/** Extends or shrinks a share to a new size in GiB. */
export function ResizeShareDialog({
  share,
  onClose,
}: {
  share: Share;
  onClose: () => void;
}) {
  const { NumberInput } = fieldsFor<z.infer<typeof resizeSchema>>();
  const { dialog } = useMutationForm({
    schema: resizeSchema,
    defaultValues: { size: share.size ?? 1 },
    mutation: useResizeShare(),
    toVariables: (values) => ({ id: share.id, size: values.size }),
    successMessage: (_result, values) =>
      `Share ${share.name || share.id} is being ${values.size > (share.size ?? 0) ? "extended" : "shrunk"} to ${values.size} GiB.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Resize ${share.name || share.id}`}
      submitLabel="Resize"
    >
      <p>The share is currently {share.size} GiB.</p>
      <NumberInput
        name="size"
        label="New size"
        addon="GiB"
        minValue={1}
        isRequired
        description="Shrinking a share below its used space can lose data."
      />
    </FormDialog>
  );
}

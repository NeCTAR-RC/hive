// The create instance snapshot dialog.
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { maxLength } from "../../../../lib/validation";
import { useInstanceAction, type InstanceActionVariables } from "../../api";
import type { InstanceDialogProps } from "./props";

const snapshotSchema = z.object({
  name: maxLength(255).min(1, "Enter a name for the snapshot"),
});

/**
 * Snapshots the instance's disk to a new image, then shows the snapshots
 * on the images page, where the new one appears once uploaded.
 */
export function SnapshotDialog({ instance, onClose }: InstanceDialogProps) {
  const navigate = useNavigate();
  const { TextInput } = fieldsFor<z.infer<typeof snapshotSchema>>();
  const { dialog } = useMutationForm({
    schema: snapshotSchema,
    defaultValues: { name: `${instance.name}-snapshot` },
    mutation: useInstanceAction(),
    toVariables: (values): InstanceActionVariables => ({
      instanceId: instance.id,
      body: { action: "snapshot", name: values.name },
    }),
    successMessage: (_result, values) =>
      `Snapshot ${values.name} is being created.`,
    onSuccess: () =>
      void navigate({ to: "/compute/images", search: { snapshots: true } }),
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Create snapshot of ${instance.name}`}
      submitLabel="Create snapshot"
    >
      <p>
        A snapshot is an image of the instance's disk you can launch new
        instances from. It appears under Images once it has been uploaded.
      </p>
      <TextInput name="name" label="Snapshot name" isRequired />
    </FormDialog>
  );
}

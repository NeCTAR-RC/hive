// The rebuild instance dialog.
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import { launchOptionsQuery, useInstanceAction } from "../../api";
import { imageChoices } from "./imageChoices";
import type { InstanceDialogProps } from "./props";
import { rebuildBody } from "./requests";

const rebuildSchema = z.object({
  image_id: z.string().min(1, "Choose an image"),
  name: maxLength(255),
  password: maxLength(255, { trim: false }),
});

/**
 * Replaces the instance's disk with a fresh copy of an image or snapshot,
 * optionally renaming it and setting an admin password. Community images
 * are left out of the choice unless the instance already runs one.
 */
export function RebuildDialog({ instance, onClose }: InstanceDialogProps) {
  const projectId = useProjectId();
  const options = useQuery(launchOptionsQuery(projectId));
  const { SelectInput, TextInput } = fieldsFor<z.infer<typeof rebuildSchema>>();
  const { dialog } = useMutationForm({
    schema: rebuildSchema,
    defaultValues: { image_id: "", name: "", password: "" },
    mutation: useInstanceAction(),
    toVariables: (values) => ({
      instanceId: instance.id,
      body: rebuildBody(values),
    }),
    successMessage: `Rebuild of ${instance.name} started.`,
    onDone: onClose,
  });
  const images = imageChoices(options.data, instance.image?.id);
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title={`Rebuild ${instance.name}`}
      submitLabel="Rebuild"
      submitTone="danger"
    >
      <Alert tone="warning" role="status">
        Rebuilding replaces the instance's disk with a fresh copy of the chosen
        image. Everything stored on the instance is lost.
      </Alert>
      <SelectInput
        name="image_id"
        label="Image"
        options={images}
        isRequired
        isDisabled={options.isPending}
        placeholder={
          options.isPending ? "Loading images..." : "Choose an image"
        }
      />
      <TextInput
        name="name"
        label="New name"
        description="Leave blank to keep the current name."
      />
      <TextInput
        name="password"
        label="Admin password"
        type="password"
        autoComplete="new-password"
        description="Optional; only images that support password injection use it."
      />
    </FormDialog>
  );
}

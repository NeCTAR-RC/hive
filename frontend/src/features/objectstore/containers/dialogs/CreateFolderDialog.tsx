// Create a folder in the current folder of a container.
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useCreateFolder } from "../../api";
import { maxLength } from "../../../../lib/validation";
import { DOT_SEGMENT_MESSAGE, hasNoDotSegments } from "../../names";

const folderSchema = z.object({
  name: maxLength(255)
    .min(1, "Enter a folder name")
    .regex(/^[^/](.*[^/])?$/, "The name cannot start or end with a slash")
    .refine(hasNoDotSegments, DOT_SEGMENT_MESSAGE),
});

/**
 * Creates a folder under `prefix`; slashes inside the name create nested
 * folders.
 */
export function CreateFolderDialog({
  container,
  prefix,
  onClose,
}: {
  container: string;
  prefix: string;
  onClose: () => void;
}) {
  const { TextInput } = fieldsFor<z.infer<typeof folderSchema>>();
  const { dialog } = useMutationForm({
    schema: folderSchema,
    defaultValues: { name: "" },
    mutation: useCreateFolder(),
    toVariables: (values) => ({ container, path: `${prefix}${values.name}` }),
    successMessage: (_folder, values) => `Folder ${values.name} created.`,
    onDone: onClose,
  });
  return (
    <FormDialog {...dialog} title="Create folder" submitLabel="Create folder">
      <TextInput
        name="name"
        label="Folder name"
        description="Slashes create nested folders."
        isRequired
      />
    </FormDialog>
  );
}

// Create a container, with its storage policy and public access.
import { useMemo } from "react";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { StorePolicy } from "../../../../lib/api/types/objectstore";
import { useCreateContainer } from "../../api";
import { maxLength } from "../../../../lib/validation";
import { DOT_SEGMENT_MESSAGE, hasNoDotSegments } from "../../names";

const containerSchema = z.object({
  name: maxLength(255)
    .min(1, "Enter a container name")
    .regex(/^[^/]+$/, "Container names cannot contain a slash")
    .refine(hasNoDotSegments, DOT_SEGMENT_MESSAGE),
  is_public: z.boolean(),
  storage_policy: z.string(),
});

type ContainerForm = z.infer<typeof containerSchema>;

/**
 * Creates a container. The storage policy picker shows only when the store
 * offers more than one policy, starting on the default one.
 */
export function CreateContainerDialog({
  policies,
  onClose,
}: {
  policies: StorePolicy[];
  onClose: () => void;
}) {
  const defaultPolicy =
    policies.find((p) => p.default)?.name ?? policies[0]?.name ?? "";
  // The default policy is preselected once the policies load.
  const preselected = useMemo(
    () => ({ name: "", is_public: false, storage_policy: defaultPolicy }),
    [defaultPolicy],
  );
  const { SelectInput, SwitchInput, TextInput } = fieldsFor<ContainerForm>();
  const { dialog } = useMutationForm({
    schema: containerSchema,
    values: preselected,
    mutation: useCreateContainer(),
    toVariables: (values) => ({
      name: values.name,
      is_public: values.is_public,
      ...(values.storage_policy
        ? { storage_policy: values.storage_policy }
        : {}),
    }),
    successMessage: (_container, values) => `Container ${values.name} created.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Create container"
      submitLabel="Create container"
    >
      <TextInput name="name" label="Container name" isRequired />
      {policies.length > 1 && (
        <SelectInput
          name="storage_policy"
          label="Storage policy"
          options={policies.map((p) => ({ id: p.name, label: p.name }))}
        />
      )}
      <SwitchInput
        name="is_public"
        label="Public access (anyone with the URL can read the objects)"
      />
    </FormDialog>
  );
}

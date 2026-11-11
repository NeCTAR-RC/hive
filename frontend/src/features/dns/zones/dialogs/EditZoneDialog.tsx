// Edit zone (designate-dashboard zone forms): contact email, TTL and
// description.
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Zone } from "../../../../lib/api/types/dns";
import { maxLength } from "../../../../lib/validation";
import { useUpdateZone } from "../../api";
import { ttlSeconds } from "../../ttl";

const editSchema = z.object({
  email: z.string().trim().email("Enter a valid contact email address"),
  ttl: ttlSeconds,
  description: maxLength(160),
});

/** Changes a zone's contact email, default TTL and description. */
export function EditZoneDialog({
  zone,
  onClose,
}: {
  zone: Zone;
  onClose: () => void;
}) {
  const { NumberInput, TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof editSchema>>();
  const { dialog } = useMutationForm({
    schema: editSchema,
    defaultValues: {
      email: zone.email ?? "",
      ttl: zone.ttl ?? undefined,
      description: zone.description ?? "",
    },
    mutation: useUpdateZone(),
    toVariables: (values) => ({
      id: zone.id,
      email: values.email,
      ...(values.ttl !== undefined ? { ttl: values.ttl } : {}),
      description: values.description,
    }),
    successMessage: `Zone ${zone.name} has been updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog {...dialog} title={`Edit ${zone.name}`} submitLabel="Save">
      <TextInput name="email" label="Contact email" type="email" isRequired />
      <NumberInput
        name="ttl"
        label="Default TTL"
        addon="seconds"
        minValue={0}
      />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}

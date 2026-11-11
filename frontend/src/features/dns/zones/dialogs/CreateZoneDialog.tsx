// Create zone (designate-dashboard zone forms): name (the trailing dot
// added when left off), contact email, TTL, description, type and masters.
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { isHostName } from "../../../../lib/net";
import { maxLength, tooLongMessage } from "../../../../lib/validation";
import { useCreateZone } from "../../api";
import { ZONE_TYPES } from "../../status";
import { ttlSeconds } from "../../ttl";

/** The zone name with its final dot, which the user may leave off. */
function absoluteZoneName(name: string): string {
  return name.endsWith(".") ? name : `${name}.`;
}

const createSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the zone name")
      .transform(absoluteZoneName)
      .refine((name) => name.length <= 254, {
        message: tooLongMessage(253),
      })
      .refine(isHostName, {
        message:
          "Use letters, digits and hyphens, with dots between the parts, such as example.com",
      }),
    email: z.string().trim().email("Enter a valid contact email address"),
    ttl: ttlSeconds,
    description: maxLength(160),
    type: z.enum(["PRIMARY", "SECONDARY"]),
    masters: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "SECONDARY" && !values.masters) {
      ctx.addIssue({
        code: "custom",
        path: ["masters"],
        message: "A secondary zone needs at least one master server",
      });
    }
  });

/**
 * Creates a primary zone, or a secondary zone that copies its records from
 * the master servers given.
 */
export function CreateZoneDialog({ onClose }: { onClose: () => void }) {
  const { NumberInput, SelectInput, TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof createSchema>>();
  const { form, dialog } = useMutationForm({
    schema: createSchema,
    defaultValues: {
      name: "",
      email: "",
      ttl: 3600,
      description: "",
      type: "PRIMARY",
      masters: "",
    },
    mutation: useCreateZone(),
    toVariables: (values) => ({
      name: values.name,
      email: values.email,
      ...(values.ttl !== undefined ? { ttl: values.ttl } : {}),
      ...(values.description ? { description: values.description } : {}),
      type: values.type,
      ...(values.type === "SECONDARY"
        ? {
            masters: values.masters
              .split(/[\s,]+/)
              .map((m) => m.trim())
              .filter(Boolean),
          }
        : {}),
    }),
    successMessage: (zone) => `Zone ${zone.name} is being created.`,
    onDone: onClose,
  });
  const type = useWatch({ control: form.control, name: "type" });
  return (
    <FormDialog {...dialog} title="Create zone" submitLabel="Create zone">
      <TextInput
        name="name"
        label="Zone name"
        description="The domain, such as example.com. The final dot is added for you."
        isRequired
      />
      <TextInput
        name="email"
        label="Contact email"
        type="email"
        description="Published in the zone's SOA record."
        isRequired
      />
      <NumberInput
        name="ttl"
        label="Default TTL"
        addon="seconds"
        minValue={0}
      />
      <TextAreaInput name="description" label="Description" />
      <SelectInput
        name="type"
        label="Type"
        options={ZONE_TYPES}
        description="A primary zone is managed here. A secondary zone copies its records from master servers."
      />
      {type === "SECONDARY" && (
        <TextAreaInput
          name="masters"
          label="Master servers"
          description="One IP address per line."
          isRequired
        />
      )}
    </FormDialog>
  );
}

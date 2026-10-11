// Create and edit zones (designate-dashboard zone forms): name with a
// trailing dot, contact email, TTL, description, type and masters.
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  NumberInput,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { Zone } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useCreateZone, useUpdateZone } from "./api";
import { ZONE_TYPES } from "./status";

const createSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "Enter the zone name")
      .max(255)
      .regex(/\.$/, "The zone name must end with a dot, such as example.com."),
    email: z.string().trim().email("Enter a valid contact email address"),
    ttl: z.number().int().min(0).optional(),
    description: z.string().trim().max(160),
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

export function CreateZoneDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const create = useCreateZone(projectId);
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      email: "",
      ttl: 3600,
      description: "",
      type: "PRIMARY",
      masters: "",
    },
  });
  const type = useWatch({ control: form.control, name: "type" });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
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
      },
      {
        onSuccess: (zone) => {
          notify.success(`Zone ${zone.name} is being created.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create zone"
      submitLabel="Create zone"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput
        control={form.control}
        name="name"
        label="Zone name"
        description="The domain, ending with a dot, such as example.com."
        isRequired
      />
      <TextInput
        control={form.control}
        name="email"
        label="Contact email"
        type="email"
        description="Published in the zone's SOA record."
        isRequired
      />
      <NumberInput
        control={form.control}
        name="ttl"
        label="Default TTL"
        addon="seconds"
        minValue={0}
      />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      <SelectInput
        control={form.control}
        name="type"
        label="Type"
        options={ZONE_TYPES}
        description="A primary zone is managed here. A secondary zone copies its records from master servers."
      />
      {type === "SECONDARY" && (
        <TextAreaInput
          control={form.control}
          name="masters"
          label="Master servers"
          description="One IP address per line."
          rows={3}
          isRequired
        />
      )}
    </FormDialog>
  );
}

const editSchema = z.object({
  email: z.string().trim().email("Enter a valid contact email address"),
  ttl: z.number().int().min(0).optional(),
  description: z.string().trim().max(160),
});

export function EditZoneDialog({
  projectId,
  zone,
  onClose,
}: {
  projectId: string;
  zone: Zone;
  onClose: () => void;
}) {
  const update = useUpdateZone(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      email: zone.email ?? "",
      ttl: zone.ttl ?? undefined,
      description: zone.description ?? "",
    },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      {
        id: zone.id,
        email: values.email,
        ...(values.ttl !== undefined ? { ttl: values.ttl } : {}),
        description: values.description,
      },
      {
        onSuccess: () => {
          notify.success(`Zone ${zone.name} has been updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${zone.name}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput
        control={form.control}
        name="email"
        label="Contact email"
        type="email"
        isRequired
      />
      <NumberInput
        control={form.control}
        name="ttl"
        label="Default TTL"
        addon="seconds"
        minValue={0}
      />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
    </FormDialog>
  );
}

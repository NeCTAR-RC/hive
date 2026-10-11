// Create and edit record sets (designate-dashboard record set form): type,
// name under the zone, TTL, description and one record per line.
import { useQuery } from "@tanstack/react-query";
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
import type { RecordSet, Zone } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useCreateRecordSet, useUpdateRecordSet, zonesQuery } from "./api";
import { RECORD_HINTS } from "./status";

function splitRecords(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const createSchema = z.object({
  type: z.string().min(1, "Choose a record type"),
  name: z.string().trim().max(255),
  records: z.string().refine((v) => splitRecords(v).length > 0, {
    message: "Enter at least one record",
  }),
  ttl: z.number().int().min(0).optional(),
  description: z.string().trim().max(160),
});

export function CreateRecordSetDialog({
  projectId,
  zone,
  onClose,
}: {
  projectId: string;
  zone: Zone;
  onClose: () => void;
}) {
  const zones = useQuery(zonesQuery(projectId));
  const create = useCreateRecordSet(projectId);
  const types = zones.data?.record_types ?? ["A", "AAAA", "CNAME", "MX", "TXT"];
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      type: "A",
      name: "",
      records: "",
      ttl: undefined,
      description: "",
    },
  });
  const type = useWatch({ control: form.control, name: "type" });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        zoneId: zone.id,
        name: values.name,
        type: values.type,
        records: splitRecords(values.records),
        ...(values.ttl !== undefined ? { ttl: values.ttl } : {}),
        ...(values.description ? { description: values.description } : {}),
      },
      {
        onSuccess: (created) => {
          notify.success(`Record set ${created.name} is being created.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create record set"
      submitLabel="Create record set"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <SelectInput
        control={form.control}
        name="type"
        label="Type"
        options={types.map((t) => ({ id: t, label: t }))}
        isRequired
      />
      <TextInput
        control={form.control}
        name="name"
        label="Name"
        description={`Relative to ${zone.name}, such as www. Leave blank for the zone itself.`}
      />
      <TextAreaInput
        control={form.control}
        name="records"
        label="Records"
        description={`One per line. ${RECORD_HINTS[type] ?? ""}`}
        rows={3}
        monospace
        isRequired
      />
      <NumberInput
        control={form.control}
        name="ttl"
        label="TTL"
        addon="seconds"
        minValue={0}
        description="Leave blank to use the zone default."
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

const editSchema = z.object({
  records: z.string().refine((v) => splitRecords(v).length > 0, {
    message: "Enter at least one record",
  }),
  ttl: z.number().int().min(0).optional(),
  description: z.string().trim().max(160),
});

export function EditRecordSetDialog({
  projectId,
  zone,
  recordset,
  onClose,
}: {
  projectId: string;
  zone: Zone;
  recordset: RecordSet;
  onClose: () => void;
}) {
  const update = useUpdateRecordSet(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      records: recordset.records.join("\n"),
      ttl: recordset.ttl ?? undefined,
      description: recordset.description ?? "",
    },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      {
        zoneId: zone.id,
        id: recordset.id,
        records: splitRecords(values.records),
        ...(values.ttl !== undefined ? { ttl: values.ttl } : {}),
        description: values.description,
      },
      {
        onSuccess: () => {
          notify.success(`Record set ${recordset.name} is being updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${recordset.name}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <p>{recordset.type} record set. The name and type cannot be changed.</p>
      <TextAreaInput
        control={form.control}
        name="records"
        label="Records"
        description={`One per line. ${RECORD_HINTS[recordset.type ?? ""] ?? ""}`}
        rows={3}
        monospace
        isRequired
      />
      <NumberInput
        control={form.control}
        name="ttl"
        label="TTL"
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

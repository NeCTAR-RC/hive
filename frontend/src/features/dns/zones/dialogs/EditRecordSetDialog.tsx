// Edit record set (designate-dashboard record set form): records, TTL
// and description; the name and type are fixed.
import { useMemo } from "react";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { RecordSet, Zone } from "../../../../lib/api/types/dns";
import { maxLength } from "../../../../lib/validation";
import { useUpdateRecordSet } from "../../api";
import {
  recordSetUpdateBody,
  recordsError,
  recordsHint,
  splitRecords,
} from "../../records";
import { ttlSeconds } from "../../ttl";

/** The edit form for a record set of `type`: its records must fit it. */
function editSchema(type: string) {
  return z
    .object({
      records: z.string(),
      ttl: ttlSeconds,
      description: maxLength(160),
    })
    .superRefine((values, ctx) => {
      const message = recordsError(type, splitRecords(values.records));
      if (message) ctx.addIssue({ code: "custom", path: ["records"], message });
    });
}

/**
 * Changes a record set's records, TTL and description; the records are
 * checked against the record set's type. Clearing the TTL returns the
 * record set to the zone's default.
 */
export function EditRecordSetDialog({
  zone,
  recordset,
  onClose,
}: {
  zone: Zone;
  recordset: RecordSet;
  onClose: () => void;
}) {
  const type = recordset.type ?? "";
  const schema = useMemo(() => editSchema(type), [type]);
  const { NumberInput, TextAreaInput } =
    fieldsFor<z.infer<ReturnType<typeof editSchema>>>();
  const { dialog } = useMutationForm({
    schema,
    defaultValues: {
      records: recordset.records.join("\n"),
      ttl: recordset.ttl ?? undefined,
      description: recordset.description ?? "",
    },
    mutation: useUpdateRecordSet(),
    toVariables: (values) => ({
      zoneId: zone.id,
      id: recordset.id,
      ...recordSetUpdateBody(values),
    }),
    successMessage: `Record set ${recordset.name} is being updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog {...dialog} title={`Edit ${recordset.name}`} submitLabel="Save">
      <p>{recordset.type} record set. The name and type cannot be changed.</p>
      <TextAreaInput
        name="records"
        label="Records"
        description={recordsHint(type)}
        isRequired
      />
      <NumberInput
        name="ttl"
        label="TTL"
        addon="seconds"
        minValue={0}
        description="Leave blank to use the zone default."
      />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}

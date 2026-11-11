// Create record set (designate-dashboard record set form): type, name
// under the zone, TTL, description and one record per line.
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert, Button } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { RecordSet, Zone } from "../../../../lib/api/types/dns";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import { recordSetsQuery, useCreateRecordSet, zonesQuery } from "../../api";
import {
  absoluteName,
  duplicateRecordSet,
  recordsError,
  recordsHint,
  splitRecords,
  withArticle,
} from "../../records";
import { ttlSeconds } from "../../ttl";
import { availableRecordSetActions } from "../../status";

const createSchema = z
  .object({
    type: z.string().min(1, "Choose a record type"),
    name: maxLength(255),
    records: z.string(),
    ttl: ttlSeconds,
    description: maxLength(160),
  })
  .superRefine((values, ctx) => {
    const message = recordsError(values.type, splitRecords(values.records));
    if (message) ctx.addIssue({ code: "custom", path: ["records"], message });
  });

/**
 * Creates a record set in the zone. The records hint and check follow the
 * chosen type; a blank TTL uses the zone default. A name and type the zone
 * already has cannot be created again (Designate refuses the duplicate):
 * the dialog says so and offers to edit the existing record set instead.
 */
export function CreateRecordSetDialog({
  zone,
  onEditInstead,
  onClose,
}: {
  zone: Zone;
  /** Opens the edit dialog on the record set this one would duplicate. */
  onEditInstead: (recordset: RecordSet) => void;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const zones = useQuery(zonesQuery(projectId));
  const recordsets = useQuery(recordSetsQuery(projectId, zone.id));
  const types = zones.data?.record_types ?? ["A", "AAAA", "CNAME", "MX", "TXT"];
  const { NumberInput, SelectInput, TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof createSchema>>();
  const { form, dialog } = useMutationForm({
    schema: createSchema,
    defaultValues: {
      type: "A",
      name: "",
      records: "",
      ttl: undefined,
      description: "",
    },
    mutation: useCreateRecordSet(),
    toVariables: (values) => ({
      zoneId: zone.id,
      name: values.name,
      type: values.type,
      records: splitRecords(values.records),
      ...(values.ttl !== undefined ? { ttl: values.ttl } : {}),
      ...(values.description ? { description: values.description } : {}),
    }),
    successMessage: (created) => `Record set ${created.name} is being created.`,
    onDone: onClose,
  });
  const type = useWatch({ control: form.control, name: "type" });
  const name = useWatch({ control: form.control, name: "name" });
  const existing = duplicateRecordSet(
    recordsets.data?.items ?? [],
    zone.name,
    name,
    type,
  );
  // The SOA and apex NS record sets are the DNS service's own: say why
  // rather than offer an edit that cannot run.
  const editOffer =
    existing &&
    availableRecordSetActions(existing).find((offer) => offer.id === "edit");
  return (
    <FormDialog
      {...dialog}
      title="Create record set"
      submitLabel="Create record set"
      isSubmitDisabled={existing !== undefined}
    >
      <SelectInput
        name="type"
        label="Type"
        options={types.map((t) => ({ id: t, label: t }))}
        isRequired
      />
      <TextInput
        name="name"
        label="Name"
        description={`Relative to ${zone.name}, such as www. Leave blank for the zone itself.`}
      />
      {existing && (
        <Alert tone="warning" role="status">
          {absoluteName(zone.name, name)} already has {withArticle(type)} record
          set.{" "}
          {editOffer?.isDisabled ? (
            `${editOffer.disabledReason ?? "It cannot be edited now"}.`
          ) : (
            <Button variant="link" onPress={() => onEditInstead(existing)}>
              Edit it instead?
            </Button>
          )}
        </Alert>
      )}
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

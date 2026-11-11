// The update instance metadata dialog.
import { z } from "zod";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { KeyValueFields } from "../../../../components/Form/KeyValueFields";
import {
  keyValueRecord,
  keyValueSchema,
} from "../../../../components/Form/keyValue";
import { useInstanceAction, type InstanceActionVariables } from "../../api";
import type { InstanceDialogProps } from "./props";

const metadataSchema = z.object({ entries: keyValueSchema });

/** Edits the instance's metadata as key and value rows, sent as a whole. */
export function MetadataDialog({ instance, onClose }: InstanceDialogProps) {
  const { dialog } = useMutationForm({
    schema: metadataSchema,
    defaultValues: {
      entries: Object.entries(instance.metadata).map(([key, value]) => ({
        key,
        value,
      })),
    },
    mutation: useInstanceAction(),
    toVariables: (values): InstanceActionVariables => ({
      instanceId: instance.id,
      body: {
        action: "update-metadata",
        metadata: keyValueRecord(values.entries),
      },
    }),
    successMessage: `Metadata of ${instance.name} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Update metadata of ${instance.name}`}
      submitLabel="Save"
      size="lg"
    >
      <KeyValueFields
        name="entries"
        addLabel="Add metadata"
        emptyText="No metadata is set."
      />
    </FormDialog>
  );
}

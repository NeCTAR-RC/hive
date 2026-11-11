// The update metadata dialog of a volume or a volume snapshot (Horizon's
// metadata modal on both tables).
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { KeyValueFields } from "../../../../components/Form/KeyValueFields";
import { keyValueRecord } from "../../../../components/Form/keyValue";
import { useSetMetadata, type MetadataTarget } from "../../api";
import { metadataSchema } from "./schema";

/**
 * Edits the metadata of a volume or a snapshot as key and value rows; the
 * rows are sent as a whole, so a removed row removes its key.
 */
export function UpdateMetadataDialog({
  target,
  name,
  metadata,
  onClose,
}: {
  target: MetadataTarget;
  /** The volume's or snapshot's name, for the title and the toast. */
  name: string;
  metadata: Record<string, string>;
  onClose: () => void;
}) {
  const { dialog } = useMutationForm({
    schema: metadataSchema,
    defaultValues: {
      entries: Object.entries(metadata).map(([key, value]) => ({
        key,
        value,
      })),
    },
    mutation: useSetMetadata(),
    toVariables: (values) => ({
      ...target,
      metadata: keyValueRecord(values.entries),
    }),
    successMessage: `Metadata of ${name} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Update metadata of ${name}`}
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

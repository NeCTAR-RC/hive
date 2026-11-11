// The share metadata dialog (manila-ui shares/forms.py).
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Share } from "../../../../lib/api/types/shares";
import { useSetShareMetadata } from "../../api";
import { formatMetadata, METADATA_HINT } from "../request";

const metadataSchema = z.object({ metadata: z.string() });

/**
 * Replaces a share's metadata with the key=value lines in the field: the
 * field opens with the current pairs, and a key left out is removed.
 */
export function MetadataDialog({
  share,
  onClose,
}: {
  share: Share;
  onClose: () => void;
}) {
  const { TextAreaInput } = fieldsFor<z.infer<typeof metadataSchema>>();
  const { dialog } = useMutationForm({
    schema: metadataSchema,
    defaultValues: { metadata: formatMetadata(share.metadata) },
    mutation: useSetShareMetadata(),
    toVariables: (values) => ({ id: share.id, metadata: values.metadata }),
    successMessage: `Metadata of ${share.name || share.id} has been updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit metadata of ${share.name || share.id}`}
      submitLabel="Save"
    >
      <TextAreaInput
        name="metadata"
        label="Metadata"
        description={`${METADATA_HINT} Keys left out are removed.`}
      />
    </FormDialog>
  );
}

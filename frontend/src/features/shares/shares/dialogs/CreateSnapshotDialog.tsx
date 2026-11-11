// The create share snapshot dialog (manila-ui shares/forms.py).
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Share } from "../../../../lib/api/types/shares";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import { shareOptionsQuery, shareQuery, useCreateSnapshot } from "../../api";

const snapshotSchema = z.object({
  name: maxLength(255).min(1, "Enter a snapshot name"),
  description: maxLength(255),
});

/**
 * Snapshots a share as it is now. A project out of snapshot quota is told
 * why above the form.
 */
export function CreateSnapshotDialog({
  share,
  onClose,
}: {
  share: Share;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(shareOptionsQuery(projectId));
  const detail = useQuery(shareQuery(projectId, share.id));
  const { TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof snapshotSchema>>();
  const { dialog } = useMutationForm({
    schema: snapshotSchema,
    defaultValues: {
      name: `${share.name || share.id}-snapshot`,
      description: "",
    },
    mutation: useCreateSnapshot(),
    toVariables: (values) => ({
      share_id: share.id,
      name: values.name,
      ...(values.description ? { description: values.description } : {}),
    }),
    successMessage: (_snapshot, values) =>
      `Snapshot ${values.name} is being created.`,
    onDone: onClose,
  });
  const blocked = options.data && !options.data.can_snapshot;
  return (
    <FormDialog
      {...dialog}
      title={`Create snapshot of ${share.name || share.id}`}
      submitLabel="Create snapshot"
      isSubmitDisabled={Boolean(blocked)}
    >
      {blocked && (
        <Alert tone="warning" role="status">
          {options.data?.snapshot_reason}
        </Alert>
      )}
      <p>
        The snapshot captures the share's {detail.data?.size ?? share.size} GiB
        as they are now.
      </p>
      <TextInput name="name" label="Snapshot name" isRequired />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}

// The edit share dialog (manila-ui shares/forms.py).
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Share } from "../../../../lib/api/types/shares";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import { shareOptionsQuery, useUpdateShare } from "../../api";

const editSchema = z.object({
  name: maxLength(255).min(1, "Enter a share name"),
  description: maxLength(255),
  is_public: z.boolean(),
});

/**
 * Changes a share's name, description and visibility to other projects.
 * The visibility switch shows where members may make a share public, or
 * on a share that already is (so it can be made private again), and is
 * sent only when it changed: Manila refuses `is_public` true from a
 * member even when nothing changes.
 */
export function EditShareDialog({
  share,
  onClose,
}: {
  share: Share;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(shareOptionsQuery(projectId));
  const canSetPublic =
    share.is_public || options.data?.public_shares_allowed === true;
  const { SwitchInput, TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof editSchema>>();
  const { dialog } = useMutationForm({
    schema: editSchema,
    defaultValues: {
      name: share.name ?? "",
      description: share.description ?? "",
      is_public: share.is_public,
    },
    mutation: useUpdateShare(),
    toVariables: ({ is_public, ...values }) => ({
      id: share.id,
      ...values,
      ...(is_public !== share.is_public ? { is_public } : {}),
    }),
    successMessage: (_updated, values) =>
      `Share ${values.name} has been updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit ${share.name || share.id}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Share name" isRequired />
      <TextAreaInput name="description" label="Description" />
      {canSetPublic && (
        <SwitchInput
          name="is_public"
          label="Make visible to users from all projects"
        />
      )}
    </FormDialog>
  );
}

// The create share group dialog (manila-ui share_groups forms.py).
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import {
  shareGroupSnapshotsQuery,
  shareOptionsQuery,
  useCreateShareGroup,
} from "../../api";
import { createShareGroupBody } from "../request";

const createSchema = z
  .object({
    name: maxLength(255).min(1, "Enter a name"),
    description: maxLength(255),
    snapshot_id: z.string(),
    share_group_type_id: z.string(),
    share_types: z.array(z.string()),
    availability_zone: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.snapshot_id && !values.share_group_type_id) {
      ctx.addIssue({
        code: "custom",
        path: ["share_group_type_id"],
        message: "Choose a share group type",
      });
    }
  });

/**
 * Creates a share group, empty or from an available share group snapshot
 * (`snapshotId`, preselected when the snapshots page links here). An empty
 * group needs a group type, and may limit its shares to some of the types
 * that group type allows; changing the group type clears the types ticked
 * under the previous one.
 */
export function CreateShareGroupDialog({
  snapshotId,
  onClose,
}: {
  snapshotId: string | null;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(shareOptionsQuery(projectId));
  const snapshots = useQuery(shareGroupSnapshotsQuery(projectId));
  const { CheckboxesInput, SelectInput, TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof createSchema>>();
  const { form, dialog } = useMutationForm({
    schema: createSchema,
    defaultValues: {
      name: "",
      description: "",
      snapshot_id: snapshotId ?? "",
      share_group_type_id: "",
      share_types: [],
      availability_zone: "",
    },
    mutation: useCreateShareGroup(),
    toVariables: createShareGroupBody,
    successMessage: (_group, values) =>
      `Share group ${values.name} is being created.`,
    onDone: onClose,
  });
  const [chosenSnapshot, groupType] = useWatch({
    control: form.control,
    name: ["snapshot_id", "share_group_type_id"],
  });
  const data = options.data;
  const groupTypes = data?.share_group_types ?? [];
  const allowedTypes =
    groupTypes.find((g) => g.id === groupType)?.share_types ?? [];
  const availableSnapshots = (snapshots.data?.items ?? []).filter(
    (s) => (s.status ?? "").toLowerCase() === "available",
  );
  return (
    <FormDialog
      {...dialog}
      title="Create share group"
      submitLabel="Create share group"
    >
      {options.isPending ? (
        <SkeletonLines lines={5} />
      ) : (
        <>
          <TextInput name="name" label="Name" isRequired />
          <TextAreaInput name="description" label="Description" />
          {availableSnapshots.length > 0 && (
            <SelectInput
              name="snapshot_id"
              label="Source"
              options={[
                { id: "", label: "No source, empty share group" },
                ...availableSnapshots.map((s) => ({
                  id: s.id,
                  label: `Snapshot ${s.name || s.id}`,
                })),
              ]}
            />
          )}
          {!chosenSnapshot && (
            <>
              <SelectInput
                name="share_group_type_id"
                label="Share group type"
                options={groupTypes.map((g) => ({
                  id: g.id,
                  label: g.name || g.id,
                }))}
                isRequired
                onValueChange={() =>
                  form.setValue("share_types", [], { shouldDirty: true })
                }
              />
              {allowedTypes.length > 0 && (
                <CheckboxesInput
                  name="share_types"
                  label="Share types"
                  description="Shares in the group may use these types."
                  options={allowedTypes.map((id) => ({
                    id,
                    label:
                      data?.share_types.find((t) => t.id === id)?.name ?? id,
                  }))}
                />
              )}
            </>
          )}
          <SelectInput
            name="availability_zone"
            label="Availability zone"
            options={[
              { id: "", label: "Any" },
              ...(data?.availability_zones ?? []).map((z) => ({
                id: z,
                label: z,
              })),
            ]}
          />
        </>
      )}
    </FormDialog>
  );
}

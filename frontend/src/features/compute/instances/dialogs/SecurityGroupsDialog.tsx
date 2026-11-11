// The edit instance security groups dialog.
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { securityGroupsQuery } from "../../../network/api";
import { useInstanceAction } from "../../api";
import type { InstanceDialogProps } from "./props";
import { securityGroupChanges, type GroupChanges } from "./requests";

const groupsSchema = z.object({ groups: z.array(z.string()) });

/**
 * Chooses the security groups applied to every port of the instance. Saving
 * adds and removes only the groups that changed, one request each.
 */
export function SecurityGroupsDialog({
  instance,
  onClose,
}: InstanceDialogProps) {
  const projectId = useProjectId();
  const groups = useQuery(securityGroupsQuery(projectId));
  const action = useInstanceAction();
  // One request per group added or removed, run in turn as one save, so
  // the dialog shows one pending state and the first failure.
  const save = useMutation({
    mutationFn: async ({ added, removed }: GroupChanges) => {
      for (const name of added) {
        await action.mutateAsync({
          instanceId: instance.id,
          body: { action: "add-security-group", security_group: name },
        });
      }
      for (const name of removed) {
        await action.mutateAsync({
          instanceId: instance.id,
          body: { action: "remove-security-group", security_group: name },
        });
      }
    },
  });
  const { CheckboxesInput } = fieldsFor<z.infer<typeof groupsSchema>>();
  const { dialog } = useMutationForm({
    schema: groupsSchema,
    defaultValues: { groups: instance.security_groups },
    mutation: save,
    toVariables: (values) =>
      securityGroupChanges(instance.security_groups, values.groups),
    successMessage: `Security groups of ${instance.name} updated.`,
    onDone: onClose,
  });
  const options = (groups.data?.items ?? []).map((group) => ({
    id: group.name,
    label: group.description
      ? `${group.name}: ${group.description}`
      : group.name,
  }));
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? groups.error}
      title={`Security groups of ${instance.name}`}
      submitLabel="Save"
      size="lg"
    >
      {groups.isPending ? (
        <p>Loading security groups...</p>
      ) : (
        <CheckboxesInput
          name="groups"
          label="Security groups"
          description="Applied to every port of the instance."
          options={options}
        />
      )}
    </FormDialog>
  );
}

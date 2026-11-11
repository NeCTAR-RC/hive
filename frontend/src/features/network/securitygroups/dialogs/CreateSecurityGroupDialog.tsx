// Create a security group.
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { SecurityGroup } from "../../../../lib/api/types/network";
import { useCreateSecurityGroup } from "../../api";
import { groupSchema, type GroupValues } from "./schema";

/**
 * The create security group dialog: a name and a description, and a word
 * on what a new group allows. `onCreated` receives the new group.
 */
export function CreateSecurityGroupDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (group: SecurityGroup) => void;
}) {
  const { TextInput } = fieldsFor<GroupValues>();
  const { dialog } = useMutationForm({
    schema: groupSchema,
    defaultValues: { name: "", description: "" },
    mutation: useCreateSecurityGroup(),
    toVariables: (values) => values,
    successMessage: (group) => `Security group ${group.name} created.`,
    onSuccess: (group) => onCreated?.(group),
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Create security group"
      submitLabel="Create security group"
    >
      <p>
        A new group allows all outbound traffic and no inbound traffic. Add
        rules to it afterwards.
      </p>
      <TextInput name="name" label="Name" isRequired />
      <TextInput name="description" label="Description" />
    </FormDialog>
  );
}

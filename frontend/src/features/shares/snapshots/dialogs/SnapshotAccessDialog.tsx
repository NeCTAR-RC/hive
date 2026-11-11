// The add snapshot access rule dialog (manila-ui share_snapshots/forms.py).
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { ShareSnapshot } from "../../../../lib/api/types/shares";
import { useSnapshotAllowAccess } from "../../api";
import {
  ACCESS_TO_HINTS,
  accessRuleDefaults,
  accessToError,
  accessTypesFor,
} from "../../shares/access";
import { maxLength } from "../../../../lib/validation";

const ruleSchema = z
  .object({
    access_type: z.string().min(1, "Choose an access type"),
    access_to: maxLength(255).min(1, "Enter who to grant access to"),
  })
  .superRefine((values, ctx) => {
    const message = values.access_to
      ? accessToError(values.access_type, values.access_to)
      : null;
    if (message) ctx.addIssue({ code: "custom", path: ["access_to"], message });
  });

/**
 * Grants a client access to a mountable snapshot; snapshot rules have no
 * access level. The access types and checks follow the share's protocol,
 * as on the share's own rules.
 */
export function SnapshotAccessDialog({
  snapshot,
  onClose,
}: {
  snapshot: ShareSnapshot;
  onClose: () => void;
}) {
  const { SelectInput, TextInput } = fieldsFor<z.infer<typeof ruleSchema>>();
  const { form, dialog } = useMutationForm({
    schema: ruleSchema,
    defaultValues: {
      access_type: accessRuleDefaults(snapshot.share_proto).access_type,
      access_to: "",
    },
    mutation: useSnapshotAllowAccess(),
    toVariables: (values) => ({ snapshotId: snapshot.id, ...values }),
    successMessage: (_rule, values) =>
      `Access rule for ${values.access_to} is being added.`,
    onDone: onClose,
  });
  const type = useWatch({ control: form.control, name: "access_type" });
  return (
    <FormDialog
      {...dialog}
      title="Add snapshot access rule"
      submitLabel="Add rule"
    >
      <SelectInput
        name="access_type"
        label="Access type"
        options={accessTypesFor(snapshot.share_proto)}
        isRequired
      />
      <TextInput
        name="access_to"
        label="Access to"
        description={ACCESS_TO_HINTS[type]}
        isRequired
      />
    </FormDialog>
  );
}

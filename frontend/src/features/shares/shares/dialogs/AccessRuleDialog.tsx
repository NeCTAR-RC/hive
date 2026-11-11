// The add access rule dialog (manila-ui shares/forms.py).
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Share } from "../../../../lib/api/types/shares";
import { useAllowAccess } from "../../api";
import { ACCESS_LEVELS } from "../../status";
import {
  ACCESS_TO_HINTS,
  accessRuleDefaults,
  accessToError,
  accessTypesFor,
} from "../access";
import { maxLength } from "../../../../lib/validation";

const ruleSchema = z
  .object({
    access_type: z.string().min(1, "Choose an access type"),
    access_to: maxLength(255).min(1, "Enter who to grant access to"),
    access_level: z.string().min(1, "Choose an access level"),
  })
  .superRefine((values, ctx) => {
    const message = values.access_to
      ? accessToError(values.access_type, values.access_to)
      : null;
    if (message) ctx.addIssue({ code: "custom", path: ["access_to"], message });
  });

/**
 * Grants a client access to a share. Only the access types the share's
 * protocol supports are offered, starting at the first; the help and the
 * check on "Access to" follow the chosen type, and the level starts at
 * read and write.
 */
export function AccessRuleDialog({
  share,
  onClose,
}: {
  share: Share;
  onClose: () => void;
}) {
  const { SelectInput, TextInput } = fieldsFor<z.infer<typeof ruleSchema>>();
  const { form, dialog } = useMutationForm({
    schema: ruleSchema,
    defaultValues: accessRuleDefaults(share.protocol),
    mutation: useAllowAccess(),
    toVariables: (values) => ({ shareId: share.id, ...values }),
    successMessage: (_rule, values) =>
      `Access rule for ${values.access_to} is being added.`,
    onDone: onClose,
  });
  const type = useWatch({ control: form.control, name: "access_type" });
  return (
    <FormDialog {...dialog} title="Add access rule" submitLabel="Add rule">
      <SelectInput
        name="access_type"
        label="Access type"
        options={accessTypesFor(share.protocol)}
        isRequired
      />
      <TextInput
        name="access_to"
        label="Access to"
        description={ACCESS_TO_HINTS[type]}
        isRequired
      />
      <SelectInput
        name="access_level"
        label="Access level"
        options={ACCESS_LEVELS}
        isRequired
      />
    </FormDialog>
  );
}

// Edit user (trove-dashboard databases/forms.py EditUserForm): a new
// name, password or host for one user of an instance.
import { useMemo } from "react";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { DbUser } from "../../../../lib/api/types/databases";
import { maxLength } from "../../../../lib/validation";
import { useUpdateUser } from "../../api";
import { passwordError, PASSWORD_MIN_LENGTH, userNameError } from "../names";

/** The host field's text for a Trove host: blank stands for any host. */
const hostText = (host: string) => (host === "%" ? "" : host);

/** The form; a new name or password follows the datastore's rules. */
function editSchema(datastore: string | null) {
  return z
    .object({
      name: maxLength(128).min(1, "Enter a user name"),
      password: maxLength(255, { trim: false }),
      host: maxLength(255),
    })
    .superRefine((values, ctx) => {
      const nameMessage = values.name
        ? userNameError(datastore, values.name)
        : null;
      if (nameMessage) {
        ctx.addIssue({ code: "custom", path: ["name"], message: nameMessage });
      }
      const passwordMessage = values.password
        ? passwordError(datastore, values.password)
        : null;
      if (passwordMessage) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message: passwordMessage,
        });
      }
    });
}

/**
 * Changes a user's name, password or allowed host. The name and host
 * start at the current ones and the password blank; only what changed is
 * sent, and a dialog with no change just closes. The library's text field
 * has no show/hide toggle for a password as shipped, so none is offered.
 */
export function EditUserDialog({
  instanceId,
  datastore,
  user,
  onClose,
}: {
  instanceId: string;
  datastore: string | null;
  user: DbUser;
  onClose: () => void;
}) {
  const schema = useMemo(() => editSchema(datastore), [datastore]);
  const { TextInput } = fieldsFor<z.infer<ReturnType<typeof editSchema>>>();
  const name = user.name ?? "";
  const { dialog } = useMutationForm({
    schema,
    defaultValues: { name, password: "", host: hostText(user.host) },
    mutation: useUpdateUser(),
    toVariables: (values) => {
      const host = values.host || "%";
      const changes = {
        ...(values.name !== name ? { name: values.name } : {}),
        ...(values.password ? { password: values.password } : {}),
        ...(host !== user.host ? { host } : {}),
      };
      return Object.keys(changes).length
        ? { instanceId, user, ...changes }
        : null;
    },
    successMessage: (updated) => `Updated user ${updated.name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog {...dialog} title={`Edit user ${name}`} submitLabel="Save">
      <TextInput name="name" label="User name" autoComplete="off" isRequired />
      <TextInput
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        description={`Leave blank to keep the current password. At least ${PASSWORD_MIN_LENGTH} characters.`}
      />
      <TextInput
        name="host"
        label="Allowed host"
        description="Leave blank to allow the user from any host."
      />
    </FormDialog>
  );
}

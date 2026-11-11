// Create user (trove-dashboard databases/forms.py): a user with
// an optional host and initial access to databases.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import { dbDatabasesQuery, useCreateUser } from "../../api";
import { passwordError, PASSWORD_MIN_LENGTH, userNameError } from "../names";

/** The form; the name and password follow the datastore's rules. */
function userSchema(datastore: string | null) {
  return z
    .object({
      name: maxLength(128).min(1, "Enter a user name"),
      password: maxLength(255, { trim: false }).min(1, "Enter a password"),
      host: maxLength(255),
      databases: z.array(z.string()),
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
 * Creates a user on the instance; a blank host allows any host, and the
 * databases to grant are offered once the instance has some. The name
 * and password are checked against the instance's datastore.
 */
export function CreateUserDialog({
  instanceId,
  datastore,
  onClose,
}: {
  instanceId: string;
  datastore: string | null;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const databases = useQuery(dbDatabasesQuery(projectId, instanceId));
  const schema = useMemo(() => userSchema(datastore), [datastore]);
  const { CheckboxesInput, TextInput } =
    fieldsFor<z.infer<ReturnType<typeof userSchema>>>();
  const { dialog } = useMutationForm({
    schema,
    defaultValues: { name: "", password: "", host: "", databases: [] },
    mutation: useCreateUser(),
    toVariables: (values) => ({
      instanceId,
      name: values.name,
      password: values.password,
      ...(values.host ? { host: values.host } : {}),
      ...(values.databases.length ? { databases: values.databases } : {}),
    }),
    successMessage: (_user, values) => `Created user ${values.name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog {...dialog} title="Create user" submitLabel="Create user">
      <TextInput name="name" label="User name" autoComplete="off" isRequired />
      <TextInput
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        isRequired
      />
      <TextInput
        name="host"
        label="Allowed host"
        description="Leave blank to allow the user from any host."
      />
      {databases.isPending ? (
        <SkeletonLines lines={2} />
      ) : (databases.data?.items.length ?? 0) > 0 ? (
        <CheckboxesInput
          name="databases"
          label="Initial access to databases"
          options={(databases.data?.items ?? []).map((d) => ({
            id: d.name ?? "",
            label: d.name ?? "",
          }))}
        />
      ) : null}
    </FormDialog>
  );
}

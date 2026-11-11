// Create database (trove-dashboard databases/forms.py): a name
// with an optional character set and collation.
import { useMemo } from "react";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { maxLength } from "../../../../lib/validation";
import { useCreateDatabase } from "../../api";
import { databaseNameError } from "../names";

/** The form; the name follows the datastore's rule. */
function databaseSchema(datastore: string | null) {
  return z
    .object({
      name: maxLength(128).min(1, "Enter a database name"),
      character_set: maxLength(64),
      collate: maxLength(64),
    })
    .superRefine((values, ctx) => {
      const message = values.name
        ? databaseNameError(datastore, values.name)
        : null;
      if (message) ctx.addIssue({ code: "custom", path: ["name"], message });
    });
}

/** Creates a database on the instance, named as its datastore allows. */
export function CreateDatabaseDialog({
  instanceId,
  datastore,
  onClose,
}: {
  instanceId: string;
  datastore: string | null;
  onClose: () => void;
}) {
  const schema = useMemo(() => databaseSchema(datastore), [datastore]);
  const { TextInput } = fieldsFor<z.infer<ReturnType<typeof databaseSchema>>>();
  const { dialog } = useMutationForm({
    schema,
    defaultValues: { name: "", character_set: "", collate: "" },
    mutation: useCreateDatabase(),
    toVariables: (values) => ({
      instanceId,
      name: values.name,
      ...(values.character_set ? { character_set: values.character_set } : {}),
      ...(values.collate ? { collate: values.collate } : {}),
    }),
    successMessage: (_database, values) => `Created database ${values.name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Create database"
      submitLabel="Create database"
    >
      <TextInput name="name" label="Database name" isRequired />
      <TextInput
        name="character_set"
        label="Character set"
        description="Optional, such as utf8mb4."
      />
      <TextInput
        name="collate"
        label="Collation"
        description="Optional, such as utf8mb4_general_ci."
      />
    </FormDialog>
  );
}

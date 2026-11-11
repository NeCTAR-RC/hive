// The create (generate) key pair dialog, shared by the Key Pairs panel and
// the launch wizard.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { downloadText } from "../../../../lib/download";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { keyPairsQuery, useCreateKeyPair } from "../../api";
import type { KeyPairDialogProps } from "./props";
import { newKeyPairNameSchema } from "./schema";

/** The create form for a project whose key pairs are named `existing`. */
function createSchema(existing: readonly string[]) {
  return z.object({ name: newKeyPairNameSchema(existing) });
}

type CreateForm = z.infer<ReturnType<typeof createSchema>>;

/**
 * Generates a new SSH key pair. The private key downloads once, as
 * `<name>.pem`, since Nova cannot return it again, and is kept nowhere
 * else. A name already in the project's list is refused before the request.
 */
export function CreateKeyPairDialog({
  onClose,
  onCreated,
}: KeyPairDialogProps) {
  const projectId = useProjectId();
  const keyPairs = useQuery(keyPairsQuery(projectId));
  const schema = useMemo(
    () => createSchema((keyPairs.data?.items ?? []).map((k) => k.name)),
    [keyPairs.data],
  );
  const { TextInput } = fieldsFor<CreateForm>();
  const { dialog } = useMutationForm({
    schema,
    defaultValues: { name: "" },
    mutation: useCreateKeyPair(),
    toVariables: (values) => ({ name: values.name, type: "ssh" as const }),
    successMessage: (keyPair) =>
      keyPair.private_key
        ? `Key pair ${keyPair.name} created. The private key has been downloaded; it cannot be retrieved again.`
        : `Key pair ${keyPair.name} created.`,
    onSuccess: (keyPair) => {
      if (keyPair.private_key)
        downloadText(`${keyPair.name}.pem`, keyPair.private_key);
      // The caller gets the key pair without its private key.
      onCreated?.({
        name: keyPair.name,
        type: keyPair.type,
        fingerprint: keyPair.fingerprint,
        public_key: keyPair.public_key,
      });
    },
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Create key pair"
      submitLabel="Create key pair"
    >
      <p>
        A new SSH key pair is generated for you. The private key downloads once,
        now; keep it safe, it cannot be downloaded again.
      </p>
      <TextInput name="name" label="Key pair name" isRequired />
    </FormDialog>
  );
}

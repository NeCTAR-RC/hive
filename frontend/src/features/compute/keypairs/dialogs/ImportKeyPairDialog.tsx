// The import public key dialog, shared by the Key Pairs panel and the
// launch wizard.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { FileInput } from "../../../../components/Form/FileInput";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { keyPairsQuery, useCreateKeyPair } from "../../api";
import type { KeyPairDialogProps } from "./props";
import { newKeyPairNameSchema } from "./schema";

/** The import form for a project whose key pairs are named `existing`. */
function importSchema(existing: readonly string[]) {
  return z.object({
    name: newKeyPairNameSchema(existing),
    public_key: publicKeySchema,
  });
}

const publicKeySchema = z
  .string()
  .trim()
  .min(1, "Paste the public key")
  .refine(
    (value) => /^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp\d+|sk-)/.test(value),
    "That does not look like an OpenSSH public key",
  );

type ImportForm = z.infer<ReturnType<typeof importSchema>>;

/**
 * Imports the user's own OpenSSH public key as a key pair, pasted or
 * loaded from the key file (Horizon's "Load Public Key from a file"). A
 * name already in the project's list is refused before the request.
 */
export function ImportKeyPairDialog({
  onClose,
  onCreated,
}: KeyPairDialogProps) {
  const projectId = useProjectId();
  const keyPairs = useQuery(keyPairsQuery(projectId));
  const schema = useMemo(
    () => importSchema((keyPairs.data?.items ?? []).map((k) => k.name)),
    [keyPairs.data],
  );
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const { TextAreaInput, TextInput } = fieldsFor<ImportForm>();
  const { form, dialog } = useMutationForm({
    schema,
    defaultValues: { name: "", public_key: "" },
    mutation: useCreateKeyPair(),
    toVariables: (values) => ({
      name: values.name,
      public_key: values.public_key,
      type: "ssh" as const,
    }),
    successMessage: (keyPair) => `Key pair ${keyPair.name} imported.`,
    onSuccess: (keyPair) => onCreated?.(keyPair),
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Import public key"
      submitLabel="Import key pair"
      size="lg"
    >
      <TextInput name="name" label="Key pair name" isRequired />
      <FileInput
        label="Load public key from a file"
        value={keyFile}
        onChange={(file) => {
          setKeyFile(file);
          if (!file) return;
          void file.text().then((text) => {
            form.setValue("public_key", text.trim(), {
              shouldValidate: true,
              shouldDirty: true,
            });
          });
        }}
        description="Choose your .pub file; its contents fill the box below."
        accept={[".pub", ".txt"]}
      />
      <TextAreaInput
        name="public_key"
        label="Public key"
        description="The contents of your public key file, usually ~/.ssh/id_ed25519.pub or ~/.ssh/id_rsa.pub."
        isRequired
      />
    </FormDialog>
  );
}

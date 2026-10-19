// Create (generate) and import dialogs for key pairs, shared by the Key
// Pairs panel and the launch wizard.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import { TextAreaInput, TextInput } from "../../../components/Form/fields";
import type { KeyPair } from "../../../lib/api/types";
import { downloadText } from "../../../lib/download";
import { notify } from "../../../lib/notify";
import { useCreateKeyPair } from "../api";

const NAME = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(255, "At most 255 characters")
  .regex(
    /^[\w.\- ]+$/,
    "Letters, numbers, spaces, dots, dashes and underscores only",
  );

const createSchema = z.object({ name: NAME });
const importSchema = z.object({
  name: NAME,
  public_key: z
    .string()
    .trim()
    .min(1, "Paste the public key")
    .refine(
      (value) => /^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp\d+|sk-)/.test(value),
      "That does not look like an OpenSSH public key",
    ),
});

type CreateForm = z.infer<typeof createSchema>;
type ImportForm = z.infer<typeof importSchema>;

export function CreateKeyPairDialog({
  projectId,
  isOpen,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (keyPair: KeyPair) => void;
}) {
  const create = useCreateKeyPair(projectId);
  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "" },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      { name: values.name, type: "ssh" },
      {
        onSuccess: (keyPair) => {
          if (keyPair.private_key) {
            downloadText(`${keyPair.name}.pem`, keyPair.private_key);
            notify.success(
              `Key pair ${keyPair.name} created. The private key has been downloaded; it cannot be retrieved again.`,
            );
          } else {
            notify.success(`Key pair ${keyPair.name} created.`);
          }
          // Hand the private key to the download only: drop it from the
          // mutation state and from what the caller receives.
          create.reset();
          form.reset();
          onOpenChange(false);
          onCreated?.({ ...keyPair, private_key: null });
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          form.reset();
          create.reset();
        }
        onOpenChange(open);
      }}
      title="Create key pair"
      submitLabel="Create key pair"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <p>
        A new SSH key pair is generated for you. The private key downloads once,
        now; keep it safe, it cannot be downloaded again.
      </p>
      <TextInput
        control={form.control}
        name="name"
        label="Key pair name"
        isRequired
      />
    </FormDialog>
  );
}

export function ImportKeyPairDialog({
  projectId,
  isOpen,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (keyPair: KeyPair) => void;
}) {
  const create = useCreateKeyPair(projectId);
  const form = useForm<ImportForm>({
    resolver: zodResolver(importSchema),
    defaultValues: { name: "", public_key: "" },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      { name: values.name, public_key: values.public_key, type: "ssh" },
      {
        onSuccess: (keyPair) => {
          notify.success(`Key pair ${keyPair.name} imported.`);
          form.reset();
          onOpenChange(false);
          onCreated?.(keyPair);
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) form.reset();
        onOpenChange(open);
      }}
      title="Import public key"
      submitLabel="Import key pair"
      size="lg"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput
        control={form.control}
        name="name"
        label="Key pair name"
        isRequired
      />
      <TextAreaInput
        control={form.control}
        name="public_key"
        label="Public key"
        description="The contents of your public key file, usually ~/.ssh/id_ed25519.pub or ~/.ssh/id_rsa.pub."
        isRequired
        rows={5}
        monospace
      />
    </FormDialog>
  );
}

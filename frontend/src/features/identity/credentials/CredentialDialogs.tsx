// Create a Keystone credential of your own (Horizon identity/credentials
// forms.py:22-70 with the user fixed to yourself).
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import { SelectInput, TextAreaInput } from "../../../components/Form/fields";
import type { CredentialType, ProjectRef } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useCreateCredential } from "../api";

const TYPES: { id: CredentialType; label: string }[] = [
  { id: "totp", label: "TOTP" },
  { id: "ec2", label: "EC2" },
  { id: "cert", label: "Certificate" },
];

const schema = z.object({
  type: z.enum(["totp", "ec2", "cert"]),
  project_id: z.string(),
  blob: z.string().trim().min(1, "Enter the credential data"),
});

type FormValues = z.infer<typeof schema>;

export function CreateCredentialDialog({
  projects,
  currentProjectId,
  isOpen,
  onOpenChange,
}: {
  projects: ProjectRef[];
  currentProjectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateCredential();
  const defaults: FormValues = {
    type: "totp",
    project_id: currentProjectId,
    blob: "",
  };
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        type: values.type,
        blob: values.blob,
        project_id: values.project_id || null,
      },
      {
        onSuccess: () => {
          notify.success("Credential created.");
          form.reset(defaults);
          onOpenChange(false);
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) form.reset(defaults);
        onOpenChange(open);
      }}
      title="Create credential"
      submitLabel="Create credential"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <SelectInput
        control={form.control}
        name="type"
        label="Type"
        options={TYPES}
        isRequired
      />
      <SelectInput
        control={form.control}
        name="project_id"
        label="Project"
        description="Optional for TOTP credentials."
        options={[
          { id: "", label: "No project" },
          ...projects.map((p) => ({ id: p.id, label: p.name })),
        ]}
      />
      <TextAreaInput
        control={form.control}
        name="blob"
        label="Data"
        description="The credential data, such as a TOTP seed or a certificate."
        isRequired
        rows={3}
        monospace
      />
    </FormDialog>
  );
}

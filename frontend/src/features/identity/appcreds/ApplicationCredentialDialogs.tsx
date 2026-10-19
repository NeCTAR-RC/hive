// Create form (Horizon application_credentials/forms.py:42-73 with the
// Nectar expiry prefill) and the one-time secret dialog with its downloads.
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, Dialog, Modal } from "@ardc-ui/react";
import { CodeBlock } from "../../../components/CodeBlock/CodeBlock";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  CheckboxesInput,
  DateInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../../components/Form/fields";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import type { ApplicationCredential } from "../../../lib/api/types";
import { downloadText } from "../../../lib/download";
import { notify } from "../../../lib/notify";
import { appCredentialOptionsQuery, useCreateAppCredential } from "../api";
import { appCredCloudsYaml, appCredFilename, appCredOpenrc } from "./files";

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(255),
    description: z.string().trim().max(1000, "At most 1000 characters"),
    secret: z.string().max(255, "At most 255 characters"),
    expiration_date: z.string(),
    expiration_time: z
      .string()
      .trim()
      .regex(/^(\d{2}:\d{2}(:\d{2})?)?$/, "Use HH:MM, such as 17:30"),
    roles: z.array(z.string()),
    access_rules: z.string().trim(),
    unrestricted: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.access_rules) {
      try {
        const parsed: unknown = JSON.parse(values.access_rules);
        if (!Array.isArray(parsed)) throw new Error("not a list");
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["access_rules"],
          message: "Access rules must be a JSON list of rules.",
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

export function CreateApplicationCredentialDialog({
  projectId,
  isOpen,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (credential: ApplicationCredential) => void;
}) {
  const options = useQuery({
    ...appCredentialOptionsQuery(projectId),
    enabled: isOpen,
  });
  const create = useCreateAppCredential();
  const defaults: FormValues = {
    name: "",
    description: "",
    secret: "",
    expiration_date: options.data?.default_expiration_date ?? "",
    expiration_time: "",
    roles: [],
    access_rules: "",
    unrestricted: false,
  };
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: defaults,
    resetOptions: { keepDirtyValues: true },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        name: values.name,
        ...(values.description ? { description: values.description } : {}),
        ...(values.secret ? { secret: values.secret } : {}),
        ...(values.expiration_date
          ? { expiration_date: values.expiration_date }
          : {}),
        ...(values.expiration_time
          ? { expiration_time: values.expiration_time }
          : {}),
        roles: values.roles,
        ...(values.access_rules ? { access_rules: values.access_rules } : {}),
        unrestricted: values.unrestricted,
      },
      {
        onSuccess: (credential) => {
          notify.success(`Application credential ${credential.name} created.`);
          // The secret goes to the one-time dialog only; clear it from the
          // mutation state (and the form's typed secret) straight away.
          create.reset();
          form.reset(defaults);
          onOpenChange(false);
          onCreated(credential);
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          form.reset(defaults);
          create.reset();
        }
        onOpenChange(open);
      }}
      title="Create application credential"
      submitLabel="Create application credential"
      size="lg"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput
        control={form.control}
        name="name"
        label="Name"
        isRequired
        maxLength={255}
      />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      <TextInput
        control={form.control}
        name="secret"
        label="Secret"
        description="Leave blank to have one generated for you."
        type="password"
        autoComplete="new-password"
        maxLength={255}
      />
      <DateInput
        control={form.control}
        name="expiration_date"
        label="Expiration date"
        description="The default is 3 months from today. Without an expiration date the credential never expires, which is not recommended."
      />
      <TextInput
        control={form.control}
        name="expiration_time"
        label="Expiration time"
        description="HH:MM in UTC. Leave blank for the start of the day."
        placeholder="00:00"
      />
      {options.data && options.data.roles.length > 0 && (
        <CheckboxesInput
          control={form.control}
          name="roles"
          label="Roles"
          description="Leave all unticked to grant every role you hold on this project."
          options={options.data.roles.map((role) => ({
            id: role,
            label: role,
          }))}
        />
      )}
      <TextAreaInput
        control={form.control}
        name="access_rules"
        label="Access rules"
        description='Optional JSON list restricting the credential to API calls, such as [{"service": "compute", "method": "GET", "path": "/v2.1/servers"}].'
        rows={3}
        monospace
      />
      <SwitchInput
        control={form.control}
        name="unrestricted"
        label="Unrestricted (dangerous): allow creating further credentials and trusts"
      />
    </FormDialog>
  );
}

export function SecretDialog({
  projectId,
  credential,
  onClose,
}: {
  projectId: string;
  credential: ApplicationCredential | null;
  onClose: () => void;
}) {
  const options = useQuery({
    ...appCredentialOptionsQuery(projectId),
    enabled: credential !== null,
  });
  const secret = credential?.secret ?? "";
  const fileInput = credential && {
    id: credential.id,
    name: credential.name,
    secret,
    authUrl: options.data?.auth_url ?? "",
    region: options.data?.region ?? "",
  };
  return (
    <Modal
      isOpen={credential !== null}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog
        title="Application credential created"
        closeLabel="Close"
        actions={
          <>
            {fileInput && (
              <>
                <Button
                  variant="secondary"
                  onPress={() =>
                    downloadText(
                      appCredFilename(fileInput.name, "-openrc.sh"),
                      appCredOpenrc(fileInput),
                      "text/x-shellscript",
                    )
                  }
                  isDisabled={!options.data}
                >
                  Download openrc file
                </Button>
                <Button
                  variant="secondary"
                  onPress={() =>
                    downloadText(
                      "clouds.yaml",
                      appCredCloudsYaml(fileInput),
                      "application/x-yaml",
                    )
                  }
                  isDisabled={!options.data}
                >
                  Download clouds.yaml
                </Button>
              </>
            )}
            <Button slot="close">Close</Button>
          </>
        }
      >
        {credential && (
          <>
            <Alert tone="warning" role="status">
              Copy the secret or download a file now. It will not be available
              after closing this dialog.
            </Alert>
            <KeyValueList
              items={[
                { label: "ID", value: <code>{credential.id}</code> },
                { label: "Name", value: credential.name },
                {
                  label: "Secret",
                  value: <CodeBlock text={secret} label="Secret" wrap />,
                },
              ]}
            />
          </>
        )}
      </Dialog>
    </Modal>
  );
}

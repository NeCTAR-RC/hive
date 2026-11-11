// The create application credential dialog (Horizon
// application_credentials/forms.py:42-73 with the Nectar expiry prefill).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { ApplicationCredentialCreated } from "../../../../lib/api/types/identity";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import { appCredentialOptionsQuery, useCreateAppCredential } from "../../api";

const schema = z
  .object({
    name: maxLength(255).min(1, "Enter a name"),
    description: maxLength(1000),
    secret: maxLength(255, { trim: false }),
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

/**
 * Creates an application credential, with the expiry prefilled from the
 * Nectar default once the options load, and hands the new credential to
 * the page so its secret can be shown once.
 */
export function CreateApplicationCredentialDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Receives the new credential, so the page can show its secret once. */
  onCreated: (credential: ApplicationCredentialCreated) => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(appCredentialOptionsQuery(projectId));
  // The Nectar default expiry fills in once the options load.
  const defaults = useMemo<FormValues>(
    () => ({
      name: "",
      description: "",
      secret: "",
      expiration_date: options.data?.default_expiration_date ?? "",
      expiration_time: "",
      roles: [],
      access_rules: "",
      unrestricted: false,
    }),
    [options.data],
  );
  const { CheckboxesInput, DateInput, SwitchInput, TextAreaInput, TextInput } =
    fieldsFor<FormValues>();
  const { dialog } = useMutationForm({
    schema,
    values: defaults,
    mutation: useCreateAppCredential(),
    toVariables: (values) => ({
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
    }),
    successMessage: (credential) =>
      `Application credential ${credential.name} created.`,
    onSuccess: (credential) => onCreated(credential),
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Create application credential"
      submitLabel="Create application credential"
      size="lg"
    >
      <TextInput name="name" label="Name" isRequired maxLength={255} />
      <TextAreaInput name="description" label="Description" />
      <TextInput
        name="secret"
        label="Secret"
        description="Leave blank to have one generated for you."
        type="password"
        autoComplete="new-password"
        maxLength={255}
      />
      <DateInput
        name="expiration_date"
        label="Expiration date"
        description="The default is 3 months from today. Without an expiration date the credential never expires, which is not recommended."
      />
      <TextInput
        name="expiration_time"
        label="Expiration time"
        description="HH:MM in UTC. Leave blank for the start of the day."
        placeholder="00:00"
      />
      {options.data && options.data.roles.length > 0 && (
        <CheckboxesInput
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
        name="access_rules"
        label="Access rules"
        description='Optional JSON list restricting the credential to API calls, such as [{"service": "compute", "method": "GET", "path": "/v2.1/servers"}].'
      />
      <SwitchInput
        name="unrestricted"
        label="Unrestricted (dangerous): allow creating further credentials and trusts"
      />
    </FormDialog>
  );
}

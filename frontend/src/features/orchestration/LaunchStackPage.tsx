// Launch stack, as heat-dashboard's two steps: pick the template (file,
// pasted text or URL) and an optional environment, validate it, then fill
// the stack name, timeout, rollback and the generated parameters.
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button } from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { FileInput } from "../../components/Form/FileInput";
import {
  NumberInput,
  RadioInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { Panel } from "../../components/Panel/Panel";
import type { ParameterSpec, TemplateSource } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { useCreateStack, useValidateTemplate } from "./api";
import { ParameterFields } from "./ParameterFields";
import { defaultValue, parameterValues, parametersSchema } from "./status";
import styles from "./Orchestration.module.scss";

const sourceSchema = z
  .object({
    source: z.enum(["text", "url"]),
    template: z.string(),
    template_url: z.string().trim(),
    environment: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.source === "text" && !values.template.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["template"],
        message: "Paste a template or choose a file",
      });
    }
    if (values.source === "url" && !/^https?:\/\//.test(values.template_url)) {
      ctx.addIssue({
        code: "custom",
        path: ["template_url"],
        message: "Enter an http or https URL",
      });
    }
  });
type SourceValues = z.infer<typeof sourceSchema>;

const detailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a stack name")
    .max(255)
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_.-]*$/,
      "Start with a letter; use letters, numbers, dots, dashes and underscores",
    ),
  timeout_mins: z.number().int().min(1, "At least 1 minute").max(10080),
  rollback: z.boolean(),
});

export function LaunchStackPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const validate = useValidateTemplate();
  const create = useCreateStack(projectId);
  const [source, setSource] = useState<TemplateSource | null>(null);
  const [specs, setSpecs] = useState<ParameterSpec[] | null>(null);
  const [description, setDescription] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Launch stack"
        crumbs={[
          { label: "Project" },
          { label: "Orchestration" },
          { label: "Stacks", href: "/orchestration/stacks" },
        ]}
      />
      {specs === null || source === null ? (
        <TemplateStep
          isPending={validate.isPending}
          error={validate.error}
          onValidate={(body) =>
            validate.mutate(body, {
              onSuccess: (result) => {
                setSource(body);
                setSpecs(result.parameters);
                setDescription(result.description);
              },
            })
          }
        />
      ) : (
        <DetailsStep
          specs={specs}
          description={description}
          isPending={create.isPending}
          error={create.error}
          onBack={() => {
            setSpecs(null);
            create.reset();
          }}
          onLaunch={(values, parameters) =>
            create.mutate(
              {
                ...source,
                name: values.name,
                parameters,
                timeout_mins: values.timeout_mins,
                rollback: values.rollback,
              },
              {
                onSuccess: (created) => {
                  notify.success(`Stack ${created.name} is being created.`);
                  void navigate({ to: "/orchestration/stacks" });
                },
              },
            )
          }
        />
      )}
    </>
  );
}

export function TemplateStep({
  isPending,
  error,
  onValidate,
  initial,
  submitLabel = "Next",
}: {
  isPending: boolean;
  error: unknown;
  onValidate: (body: TemplateSource) => void;
  initial?: Partial<SourceValues>;
  submitLabel?: string;
}) {
  const form = useForm<SourceValues>({
    resolver: zodResolver(sourceSchema),
    mode: "onTouched",
    defaultValues: {
      source: "text",
      template: "",
      template_url: "",
      environment: "",
      ...initial,
    },
  });
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [environmentFile, setEnvironmentFile] = useState<File | null>(null);
  const source = useWatch({ control: form.control, name: "source" });

  const readFile = (file: File | null, field: "template" | "environment") => {
    if (!file) return;
    void file.text().then((text) => {
      form.setValue(field, text, { shouldValidate: true });
    });
  };

  const submit = form.handleSubmit((values) => {
    const body: TemplateSource = {};
    if (values.source === "text") body.template = values.template;
    else body.template_url = values.template_url;
    if (values.environment.trim()) body.environment = values.environment;
    onValidate(body);
  });

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <Panel title="Template" headingLevel={2}>
        <div className={styles.fields}>
          <RadioInput
            control={form.control}
            name="source"
            label="Template source"
            options={[
              { id: "text", label: "File or direct input" },
              { id: "url", label: "URL" },
            ]}
          />
          {source === "text" ? (
            <>
              <FileInput
                label="Template file"
                value={templateFile}
                onChange={(file) => {
                  setTemplateFile(file);
                  readFile(file, "template");
                }}
                description="A HOT template in YAML or JSON. Its contents are loaded into the box below."
                accept={[".yaml", ".yml", ".json", ".template"]}
              />
              <TextAreaInput
                control={form.control}
                name="template"
                label="Template"
                rows={12}
                monospace
                isRequired
              />
            </>
          ) : (
            <TextInput
              control={form.control}
              name="template_url"
              label="Template URL"
              type="url"
              isRequired
              description="Heat fetches the template from this address."
            />
          )}
        </div>
      </Panel>
      <Panel title="Environment" headingLevel={2}>
        <div className={styles.fields}>
          <FileInput
            label="Environment file"
            value={environmentFile}
            onChange={(file) => {
              setEnvironmentFile(file);
              readFile(file, "environment");
            }}
            description="Optional. Parameter values and resource registry overrides."
            accept={[".yaml", ".yml", ".json", ".env"]}
          />
          <TextAreaInput
            control={form.control}
            name="environment"
            label="Environment"
            rows={6}
            monospace
          />
        </div>
      </Panel>
      {error ? (
        <ErrorState error={error} title="The template did not validate" />
      ) : null}
      <div className={styles.buttons}>
        {isPending ? (
          <Button state="loading" loadingText="Validating..." isDisabled>
            {submitLabel}
          </Button>
        ) : (
          <Button type="submit">{submitLabel}</Button>
        )}
      </div>
    </form>
  );
}

function DetailsStep({
  specs,
  description,
  isPending,
  error,
  onBack,
  onLaunch,
}: {
  specs: ParameterSpec[];
  description: string | null;
  isPending: boolean;
  error: unknown;
  onBack: () => void;
  onLaunch: (
    values: z.infer<typeof detailsSchema>,
    parameters: Record<string, unknown>,
  ) => void;
}) {
  const schema = useMemo(
    () => detailsSchema.extend({ parameters: parametersSchema(specs) }),
    [specs],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      timeout_mins: 60,
      rollback: false,
      parameters: Object.fromEntries(
        specs.map((spec) => [spec.name, defaultValue(spec)]),
      ),
    },
  });
  const submit = form.handleSubmit((values) => {
    onLaunch(
      {
        name: values.name,
        timeout_mins: values.timeout_mins,
        rollback: values.rollback,
      },
      parameterValues(specs, values.parameters as Record<string, string>),
    );
  });
  return (
    <form onSubmit={submit} noValidate className={styles.layout}>
      <div className={styles.form}>
        {description && (
          <Alert tone="info" role="status">
            {description}
          </Alert>
        )}
        <Panel title="Stack" headingLevel={2}>
          <div className={styles.fields}>
            <TextInput
              control={form.control}
              name="name"
              label="Stack name"
              isRequired
            />
            <NumberInput
              control={form.control}
              name="timeout_mins"
              label="Creation timeout"
              addon="minutes"
              minValue={1}
              isRequired
            />
            <SwitchInput
              control={form.control}
              name="rollback"
              label="Roll back on failure"
            />
          </div>
        </Panel>
        <ParameterFields control={form.control} specs={specs} />
        {error ? (
          <ErrorState error={error} title="Could not launch the stack" />
        ) : null}
        <div className={styles.buttons}>
          <Button variant="secondary" onPress={onBack} isDisabled={isPending}>
            Back
          </Button>
          {isPending ? (
            <Button state="loading" loadingText="Launching..." isDisabled>
              Launch
            </Button>
          ) : (
            <Button type="submit">Launch</Button>
          )}
        </div>
      </div>
      <Panel title="About" headingLevel={2} className={styles.summary}>
        <p className={styles.muted}>
          Heat creates the resources in the template together and tracks them as
          one stack. Parameters without a value use the template default.
        </p>
      </Panel>
    </form>
  );
}

// The template step of launching or changing a stack (heat-dashboard's
// "Select Template"): a file, pasted text or URL, and an optional
// environment. Shared by the launch page and the change-template dialog.
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@ardc-ui/react";
import { loadingProps } from "../../components/buttonState";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { FileInput } from "../../components/Form/FileInput";
import {
  RadioInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { Panel } from "../../components/Panel/Panel";
import type { TemplateSource } from "../../lib/api/types";
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
  initial?: Partial<SourceValues> | undefined;
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
        <Button
          type="submit"
          isPending={isPending}
          {...loadingProps(isPending, "Validating...")}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

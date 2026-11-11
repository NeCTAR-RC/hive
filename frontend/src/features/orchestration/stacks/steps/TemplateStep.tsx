// The template step of launch stack and change template: the template as a
// file, pasted text or a URL, and an optional environment.
import { useEffect, useState } from "react";
import { useForm, useFormState, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { loadingProps } from "../../../../components/buttonState";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { FileInput } from "../../../../components/Form/FileInput";
import { Form } from "../../../../components/Form/Form";
import { fieldsFor } from "../../../../components/Form/fields";
import { Panel } from "../../../../components/Panel/Panel";
import type { TemplateSource } from "../../../../lib/api/types/orchestration";
import { templateSource } from "../request";
import styles from "../../Orchestration.module.scss";

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

/**
 * Collects a template source and hands it to `onValidate`; the caller sends
 * it to Heat's validate and moves on once it passes. A chosen file's text
 * is loaded into the matching box, so the user can check it first.
 */
export function TemplateStep({
  isPending,
  error,
  onValidate,
  initial,
  submitLabel = "Next",
  onDirtyChange,
  cancelTo,
}: {
  isPending: boolean;
  error: unknown;
  onValidate: (body: TemplateSource) => void;
  initial?: Partial<SourceValues>;
  submitLabel?: string;
  /** Hears whether the user has changed the form, for a leave guard. */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Where a Cancel button goes, on a page; a dialog has its own close. */
  cancelTo?: string;
}) {
  const { RadioInput, TextAreaInput, TextInput } = fieldsFor<SourceValues>();
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
  const { isDirty } = useFormState({ control: form.control });
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const readFile = (file: File | null, field: "template" | "environment") => {
    if (!file) return;
    void file.text().then((text) => {
      form.setValue(field, text, { shouldValidate: true, shouldDirty: true });
    });
  };

  return (
    <Form
      form={form}
      onValid={(values) => onValidate(templateSource(values))}
      className={styles.form}
    >
      <div className={styles.groups}>
        <Panel title="Template" headingLevel={2}>
          <div className={styles.fields}>
            <RadioInput
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
                <TextAreaInput name="template" label="Template" isRequired />
              </>
            ) : (
              <TextInput
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
            <TextAreaInput name="environment" label="Environment" />
          </div>
        </Panel>
        {error ? (
          <ErrorState error={error} title="The template did not validate" />
        ) : null}
      </div>
      <div className={styles.buttons}>
        <Button type="submit" {...loadingProps(isPending, "Validating...")}>
          {submitLabel}
        </Button>
        {cancelTo !== undefined && (
          <AppLink variant="secondary" href={cancelTo} isDisabled={isPending}>
            Cancel
          </AppLink>
        )}
      </div>
    </Form>
  );
}

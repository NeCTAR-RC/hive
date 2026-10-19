// Launch stack, as heat-dashboard's two steps: pick the template (file,
// pasted text or URL) and an optional environment, validate it, then fill
// the stack name, timeout, rollback and the generated parameters.
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, StepItem, Stepper } from "@ardc-ui/react";
import { loadingProps } from "../../components/buttonState";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import {
  NumberInput,
  SwitchInput,
  TextInput,
} from "../../components/Form/fields";
import { Panel } from "../../components/Panel/Panel";
import type { ParameterSpec, TemplateSource } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { useCreateStack, useValidateTemplate } from "./api";
import { ParameterFields } from "./ParameterFields";
import { TemplateStep } from "./TemplateStep";
import {
  defaultValue,
  parameterValues,
  parametersSchema,
  templateSourceValues,
} from "./status";
import styles from "./Orchestration.module.scss";

const detailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a stack name")
    .max(255, "At most 255 characters")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_.-]*$/,
      "Start with a letter; use letters, numbers, dots, dashes and underscores",
    ),
  timeout_mins: z
    .number("Enter a number of minutes")
    .int("Enter a whole number of minutes")
    .min(1, "At least 1 minute")
    .max(10080, "At most 10080 minutes (a week)"),
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
  const onDetails = specs !== null && source !== null;
  const back = () => {
    setSpecs(null);
    create.reset();
  };

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
      <Stepper
        activeStep={onDetails ? "details" : "template"}
        onActiveStepChange={(key) => {
          if (key === "template") back();
        }}
        allowsJumping
        aria-label="Launch stack steps"
      >
        <StepItem id="template" title="Select template">
          {/* The Stepper remounts a step on every visit, so the template
              step starts from what was validated last. */}
          <TemplateStep
            initial={source ? templateSourceValues(source) : undefined}
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
        </StepItem>
        <StepItem id="details" title="Launch stack">
          {onDetails && source && specs && (
            <DetailsStep
              specs={specs}
              description={description}
              isPending={create.isPending}
              error={create.error}
              onBack={back}
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
        </StepItem>
      </Stepper>
    </>
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
          <Button
            type="submit"
            isPending={isPending}
            {...loadingProps(isPending, "Launching...")}
          >
            Launch
          </Button>
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

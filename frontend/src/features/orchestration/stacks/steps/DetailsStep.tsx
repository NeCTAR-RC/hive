// The second step of launch stack: the stack name, timeout and rollback,
// and the parameters generated from the validated template.
import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { loadingProps } from "../../../../components/buttonState";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { fieldsFor } from "../../../../components/Form/fields";
import { Panel } from "../../../../components/Panel/Panel";
import type { ParameterSpec } from "../../../../lib/api/types/orchestration";
import {
  defaultValue,
  parameterValues,
  parametersSchema,
  timeoutMinutes,
} from "../../status";
import { ParameterFields } from "../ParameterFields";
import styles from "../../Orchestration.module.scss";
import { maxLength } from "../../../../lib/validation";

const detailsSchema = z.object({
  name: maxLength(255)
    .min(1, "Enter a stack name")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_.-]*$/,
      "Start with a letter; use letters, numbers, dots, dashes and underscores",
    ),
  timeout_mins: timeoutMinutes,
  rollback: z.boolean(),
});

/**
 * Names the stack and fills the template's parameters, starting from their
 * defaults, then hands the settings and parameter values to `onLaunch`.
 */
export function DetailsStep({
  specs,
  description,
  isPending,
  error,
  onBack,
  onLaunch,
  cancelTo,
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
  /** Where Cancel goes: the stacks list. */
  cancelTo: string;
}) {
  const schema = useMemo(
    () => detailsSchema.extend({ parameters: parametersSchema(specs) }),
    [specs],
  );
  type Values = z.infer<typeof schema>;
  const { NumberInput, SwitchInput, TextInput } = fieldsFor<Values>();
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
      parameterValues(specs, values.parameters),
    );
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className={styles.layout}>
        <div className={styles.form}>
          <div className={styles.groups}>
            {description && (
              <Alert tone="info" role="status">
                {description}
              </Alert>
            )}
            <Panel title="Stack" headingLevel={2}>
              <div className={styles.fields}>
                <TextInput name="name" label="Stack name" isRequired />
                <NumberInput
                  name="timeout_mins"
                  label="Creation timeout"
                  addon="minutes"
                  minValue={1}
                  isRequired
                />
                <SwitchInput name="rollback" label="Roll back on failure" />
              </div>
            </Panel>
            <ParameterFields specs={specs} />
            {error ? (
              <ErrorState error={error} title="Could not launch the stack" />
            ) : null}
          </div>
          <div className={styles.buttons}>
            <Button variant="secondary" onPress={onBack} isDisabled={isPending}>
              Back
            </Button>
            <Button type="submit" {...loadingProps(isPending, "Launching...")}>
              Launch
            </Button>
            <AppLink variant="secondary" href={cancelTo} isDisabled={isPending}>
              Cancel
            </AppLink>
          </div>
        </div>
        <Panel title="About" headingLevel={2} className={styles.summary}>
          <p className={styles.muted}>
            Heat creates the resources in the template together and tracks them
            as one stack. Parameters without a value use the template default.
          </p>
        </Panel>
      </form>
    </FormProvider>
  );
}

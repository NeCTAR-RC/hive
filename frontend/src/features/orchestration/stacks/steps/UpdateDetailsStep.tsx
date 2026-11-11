// The second step of change template: the timeout, rollback and the
// parameters, prefilled from the stack's current values.
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@ardc-ui/react";
import { loadingProps } from "../../../../components/buttonState";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { Form } from "../../../../components/Form/Form";
import { fieldsFor } from "../../../../components/Form/fields";
import type {
  ParameterSpec,
  StackDetail,
} from "../../../../lib/api/types/orchestration";
import {
  defaultValue,
  parameterValues,
  parametersSchema,
  timeoutMinutes,
} from "../../status";
import { ParameterFields } from "../ParameterFields";
import styles from "../../Orchestration.module.scss";

const detailsSchema = z.object({
  timeout_mins: timeoutMinutes,
  rollback: z.boolean(),
});

/**
 * The new template's parameters and the stack's settings, starting from
 * what the stack runs with now. A hidden (`no_echo`) value is never read
 * back, so it starts from the template default.
 */
export function UpdateDetailsStep({
  stack,
  specs,
  isPending,
  error,
  onBack,
  onSubmit,
}: {
  stack: StackDetail;
  specs: ParameterSpec[];
  isPending: boolean;
  error: unknown;
  onBack: () => void;
  onSubmit: (
    values: z.infer<typeof detailsSchema>,
    parameters: Record<string, unknown>,
  ) => void;
}) {
  const schema = useMemo(
    () => detailsSchema.extend({ parameters: parametersSchema(specs) }),
    [specs],
  );
  type Values = z.infer<typeof schema>;
  const { NumberInput, SwitchInput } = fieldsFor<Values>();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      timeout_mins: stack.timeout_mins ?? 60,
      rollback: stack.disable_rollback === false,
      parameters: Object.fromEntries(
        specs.map((spec) => {
          const current = stack.parameters[spec.name];
          return [
            spec.name,
            current === undefined || spec.no_echo
              ? defaultValue(spec)
              : typeof current === "string"
                ? current
                : JSON.stringify(current),
          ];
        }),
      ),
    },
  });
  const submit = (values: Values) =>
    onSubmit(
      { timeout_mins: values.timeout_mins, rollback: values.rollback },
      parameterValues(specs, values.parameters),
    );
  return (
    <Form form={form} onValid={submit} className={styles.groups}>
      <div className={styles.fields}>
        <NumberInput
          name="timeout_mins"
          label="Update timeout"
          addon="minutes"
          minValue={1}
          isRequired
        />
        <SwitchInput name="rollback" label="Roll back on failure" />
      </div>
      <ParameterFields specs={specs} headingLevel={3} variant="group" />
      {error ? (
        <ErrorState error={error} title="Could not update the stack" />
      ) : null}
      <div className={styles.buttons}>
        <Button variant="secondary" onPress={onBack} isDisabled={isPending}>
          Back
        </Button>
        <Button type="submit" {...loadingProps(isPending, "Updating...")}>
          Update
        </Button>
      </div>
    </Form>
  );
}

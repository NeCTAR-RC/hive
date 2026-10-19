// Change stack template: a new template or environment is validated, then
// the parameters form is prefilled from the stack's current values.
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Dialog, Modal } from "@ardc-ui/react";
import { loadingProps } from "../../components/buttonState";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { NumberInput, SwitchInput } from "../../components/Form/fields";
import type {
  ParameterSpec,
  StackDetail,
  TemplateSource,
} from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useUpdateStack, useValidateTemplate } from "./api";
import { ParameterFields } from "./ParameterFields";
import { TemplateStep } from "./TemplateStep";
import {
  defaultValue,
  parameterValues,
  parametersSchema,
  templateSourceValues,
} from "./status";
import styles from "./Orchestration.module.scss";

export function UpdateStackDialog({
  projectId,
  stack,
  onClose,
}: {
  projectId: string;
  stack: StackDetail;
  onClose: () => void;
}) {
  const validate = useValidateTemplate();
  const update = useUpdateStack(projectId);
  const [source, setSource] = useState<TemplateSource | null>(null);
  const [specs, setSpecs] = useState<ParameterSpec[] | null>(null);
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && !update.isPending && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog title={`Change template of ${stack.name}`} closeLabel="Close">
        {specs === null || source === null ? (
          <TemplateStep
            isPending={validate.isPending}
            error={validate.error}
            submitLabel="Next"
            initial={source ? templateSourceValues(source) : undefined}
            onValidate={(body) =>
              validate.mutate(body, {
                onSuccess: (result) => {
                  setSource(body);
                  setSpecs(result.parameters);
                },
              })
            }
          />
        ) : (
          <UpdateDetails
            stack={stack}
            specs={specs}
            isPending={update.isPending}
            error={update.error}
            onBack={() => setSpecs(null)}
            onSubmit={(values, parameters) =>
              update.mutate(
                {
                  id: stack.id,
                  ...source,
                  parameters,
                  timeout_mins: values.timeout_mins,
                  rollback: values.rollback,
                },
                {
                  onSuccess: () => {
                    notify.success(`Stack ${stack.name} is being updated.`);
                    onClose();
                  },
                },
              )
            }
          />
        )}
      </Dialog>
    </Modal>
  );
}

const detailsSchema = z.object({
  timeout_mins: z
    .number("Enter a number of minutes")
    .int("Enter a whole number of minutes")
    .min(1, "At least 1 minute")
    .max(10080, "At most 10080 minutes (a week)"),
  rollback: z.boolean(),
});

function UpdateDetails({
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
  const submit = form.handleSubmit((values) =>
    onSubmit(
      { timeout_mins: values.timeout_mins, rollback: values.rollback },
      parameterValues(specs, values.parameters as Record<string, string>),
    ),
  );
  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <div className={styles.fields}>
        <NumberInput
          control={form.control}
          name="timeout_mins"
          label="Update timeout"
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
      <ParameterFields control={form.control} specs={specs} />
      {error ? (
        <ErrorState error={error} title="Could not update the stack" />
      ) : null}
      <div className={styles.buttons}>
        <Button variant="secondary" onPress={onBack} isDisabled={isPending}>
          Back
        </Button>
        <Button
          type="submit"
          isPending={isPending}
          {...loadingProps(isPending, "Updating...")}
        >
          Update
        </Button>
      </div>
    </form>
  );
}

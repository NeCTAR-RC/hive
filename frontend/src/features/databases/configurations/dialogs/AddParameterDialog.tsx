// Add parameter (trove-dashboard database_configurations forms.py): a
// value checked against the datastore's parameter spec.
import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type {
  DbConfigurationDetail,
  DbParameterSpec,
} from "../../../../lib/api/types/databases";
import { useSetConfigurationValues } from "../../api";
import {
  parameterInputs,
  parameterKind,
  parameterValue,
  parameterValueError,
  valuesWith,
  valueStrings,
} from "../values";

/**
 * The form: a parameter and one typed input for its value (`text`,
 * `number` or `flag`, by the parameter's kind). The value must suit the
 * chosen parameter's spec.
 */
function parameterSchema(parameters: DbParameterSpec[]) {
  return z
    .object({
      name: z.string("Choose a parameter").min(1, "Choose a parameter"),
      text: z.string(),
      number: z.number().optional(),
      flag: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const spec = parameters.find((p) => p.name === values.name);
      if (!spec) return;
      const kind = parameterKind(spec.type);
      if (kind === "boolean") return;
      const path = kind === "string" ? "text" : "number";
      const value = parameterValue(kind, values);
      const message = value
        ? parameterValueError(spec, value)
        : "Enter a value";
      if (message) ctx.addIssue({ code: "custom", path: [path], message });
    });
}

/**
 * Sets one parameter of the group. The parameter is picked from a list the
 * user narrows by typing, and its value is entered in the input its type
 * takes: a switch for a boolean, a number field held to the spec's range,
 * text otherwise. The hint under the parameter names its type, range and
 * whether it needs a restart. A parameter the group already sets starts
 * from its current value, and the dialog then changes it.
 */
export function AddParameterDialog({
  configuration,
  onClose,
}: {
  configuration: DbConfigurationDetail;
  onClose: () => void;
}) {
  const schema = useMemo(
    () => parameterSchema(configuration.parameters),
    [configuration.parameters],
  );
  const current = useMemo(
    () => valueStrings(configuration.values),
    [configuration.values],
  );
  const { ComboboxInput, NumberInput, SwitchInput, TextInput } =
    fieldsFor<z.infer<ReturnType<typeof parameterSchema>>>();
  const { form, dialog } = useMutationForm({
    schema,
    defaultValues: { name: "", ...parameterInputs(undefined) },
    mutation: useSetConfigurationValues(),
    toVariables: (values) => {
      const spec = configuration.parameters.find((p) => p.name === values.name);
      return {
        id: configuration.id,
        values: valuesWith(
          configuration.values,
          values.name,
          parameterValue(parameterKind(spec?.type), values),
        ),
      };
    },
    successMessage: (_result, values) => `Set ${values.name}.`,
    onDone: onClose,
  });
  const chosen = useWatch({ control: form.control, name: "name" });
  const spec = configuration.parameters.find((p) => p.name === chosen);
  const kind = parameterKind(spec?.type);
  const value = current[chosen];
  const hint = spec
    ? [
        value !== undefined ? `Currently ${value}.` : null,
        spec.type ? `Type ${spec.type}.` : null,
        spec.min !== null || spec.max !== null
          ? `Range ${spec.min ?? "any"} to ${spec.max ?? "any"}.`
          : null,
        spec.restart_required ? "Needs a restart." : null,
      ]
        .filter(Boolean)
        .join(" ")
    : undefined;
  // Each pick starts the value inputs from that parameter's value in force.
  const startFrom = (name: string) => {
    const inputs = parameterInputs(current[name]);
    form.setValue("text", inputs.text);
    form.setValue("number", inputs.number);
    form.setValue("flag", inputs.flag);
  };
  return (
    <FormDialog
      {...dialog}
      title="Add parameter"
      submitLabel={value !== undefined ? "Change value" : "Add parameter"}
    >
      <ComboboxInput
        name="name"
        label="Parameter"
        options={configuration.parameters.map((p) => ({
          id: p.name ?? "",
          label: p.name ?? "",
        }))}
        onValueChange={startFrom}
        isRequired
        {...(hint ? { description: hint } : {})}
      />
      {kind === "boolean" ? (
        <SwitchInput name="flag" label="Value" />
      ) : kind === "string" ? (
        <TextInput name="text" label="Value" isRequired />
      ) : (
        <NumberInput
          name="number"
          label="Value"
          isRequired
          {...(typeof spec?.min === "number" ? { minValue: spec.min } : {})}
          {...(typeof spec?.max === "number" ? { maxValue: spec.max } : {})}
          {...(kind === "integer" ? { step: 1 } : {})}
        />
      )}
    </FormDialog>
  );
}

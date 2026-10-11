// The generated parameters form heat-dashboard builds from the validate
// response: strings, numbers, lists and JSON as text, allowed values as a
// select, booleans as a select, hidden values as password fields.
import type { Control, FieldValues } from "react-hook-form";
import { Panel } from "../../components/Panel/Panel";
import {
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import type { ParameterSpec } from "../../lib/api/types";
import { groupParameters } from "./status";
import styles from "./Orchestration.module.scss";

export function ParameterFields<T extends FieldValues>({
  control,
  specs,
}: {
  control: Control<T>;
  specs: ParameterSpec[];
}) {
  const groups = groupParameters(specs);
  if (specs.length === 0) {
    return <p className={styles.muted}>This template has no parameters.</p>;
  }
  return (
    <>
      {groups.map((group) => (
        <Panel
          key={group.label ?? "ungrouped"}
          title={group.label ?? "Parameters"}
          headingLevel={3}
        >
          <div className={styles.fields}>
            {group.specs.map((spec) => (
              <ParameterField key={spec.name} control={control} spec={spec} />
            ))}
          </div>
        </Panel>
      ))}
    </>
  );
}

function ParameterField<T extends FieldValues>({
  control,
  spec,
}: {
  control: Control<T>;
  spec: ParameterSpec;
}) {
  const name = `parameters.${spec.name}` as Parameters<
    typeof TextInput<T>
  >[0]["name"];
  const hints = [
    spec.description,
    spec.custom_constraint ? `Constraint: ${spec.custom_constraint}` : null,
    spec.min_value !== null || spec.max_value !== null
      ? `Range ${spec.min_value ?? "any"} to ${spec.max_value ?? "any"}`
      : null,
  ].filter(Boolean);
  const description = hints.length ? hints.join(". ") : undefined;
  const common = {
    control,
    name,
    label: spec.label,
    isRequired: spec.required,
    ...(description ? { description } : {}),
  };
  if (spec.allowed_values && spec.allowed_values.length > 0) {
    return (
      <SelectInput
        {...common}
        options={spec.allowed_values.map((v) => ({
          id: String(v),
          label: String(v),
        }))}
      />
    );
  }
  if (spec.type === "boolean") {
    return (
      <SelectInput
        {...common}
        options={[
          { id: "true", label: "True" },
          { id: "false", label: "False" },
        ]}
      />
    );
  }
  if (spec.type === "json") {
    return <TextAreaInput {...common} rows={4} monospace />;
  }
  if (spec.no_echo) {
    return <TextInput {...common} type="password" autoComplete="off" />;
  }
  return <TextInput {...common} />;
}

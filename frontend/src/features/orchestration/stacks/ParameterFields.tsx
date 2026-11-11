// The generated parameters form heat-dashboard builds from the validate
// response: strings, numbers, lists and JSON as text, allowed values as a
// select, booleans as a select, hidden values as password fields, and a
// constraint naming the project's resources (key pairs, flavours, images,
// networks, subnets, volumes) as a select of them.
import { useId, type ReactNode } from "react";
import { Panel } from "../../../components/Panel/Panel";
import { fieldsFor } from "../../../components/Form/fields";
import type { ParameterSpec } from "../../../lib/api/types/orchestration";
import { groupParameters } from "../status";
import { ConstraintField } from "./ConstraintField";
import { constraintHint, isSourced } from "./constraints";
import styles from "../Orchestration.module.scss";

/**
 * The fields of each parameter group. On a page (`variant="panel"`) each
 * group is a panel; inside a dialog (`variant="group"`) it is a plain field
 * group under a heading, since the dialog is the surface already. Titles
 * are h2 on a page; inside a dialog, whose own title is the h2, pass
 * `headingLevel={3}`. The fields bind to the `parameters` record of the
 * enclosing form (see `ParameterValues`).
 */
export function ParameterFields({
  specs,
  headingLevel = 2,
  variant = "panel",
}: {
  specs: ParameterSpec[];
  headingLevel?: 2 | 3;
  variant?: "panel" | "group";
}) {
  const groups = groupParameters(specs);
  if (specs.length === 0) {
    return <p className={styles.muted}>This template has no parameters.</p>;
  }
  return (
    <>
      {groups.map((group) => {
        const title = group.label ?? "Parameters";
        const fields = (
          <div className={styles.fields}>
            {group.specs.map((spec) => (
              <ParameterField key={spec.name} spec={spec} />
            ))}
          </div>
        );
        return variant === "panel" ? (
          <Panel
            key={group.label ?? "ungrouped"}
            title={title}
            headingLevel={headingLevel}
          >
            {fields}
          </Panel>
        ) : (
          <FieldGroup
            key={group.label ?? "ungrouped"}
            title={title}
            headingLevel={headingLevel}
          >
            {fields}
          </FieldGroup>
        );
      })}
    </>
  );
}

/** A titled group of fields without chrome, named by its heading. */
function FieldGroup({
  title,
  headingLevel,
  children,
}: {
  title: string;
  headingLevel: 2 | 3;
  children: ReactNode;
}) {
  const id = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} className={styles.group}>
      <Heading id={id} className={styles.groupTitle}>
        {title}
      </Heading>
      {children}
    </section>
  );
}

/**
 * The part of a form the parameter fields edit: each template parameter
 * as text under `parameters`, keyed by its name (see `parametersSchema`).
 */
type ParameterValues = { parameters: Record<string, string> };

function ParameterField({ spec }: { spec: ParameterSpec }) {
  const { SelectInput, TextAreaInput, TextInput } =
    fieldsFor<ParameterValues>();
  const name = `parameters.${spec.name}` as const;
  const hints = [
    spec.description,
    spec.custom_constraint ? constraintHint(spec.custom_constraint) : null,
    spec.min_value !== null || spec.max_value !== null
      ? `Range ${spec.min_value ?? "any"} to ${spec.max_value ?? "any"}`
      : null,
  ].filter(Boolean);
  const description = hints.length ? hints.join(". ") : undefined;
  const common = {
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
  if (spec.type === "string" && isSourced(spec.custom_constraint)) {
    return (
      <ConstraintField constraint={spec.custom_constraint} field={common} />
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
    return <TextAreaInput {...common} />;
  }
  if (spec.no_echo) {
    return <TextInput {...common} type="password" autoComplete="off" />;
  }
  return <TextInput {...common} />;
}

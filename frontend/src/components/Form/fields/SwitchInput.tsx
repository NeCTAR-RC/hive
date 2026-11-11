import { Switch } from "@ardc-ui/react";
import type { FieldValues } from "react-hook-form";
import type { BindingProps } from "./props";
import { useBoundField } from "./useBoundField";

export type SwitchInputProps<T extends FieldValues> = Omit<
  BindingProps<T, boolean | undefined>,
  "description" | "isRequired"
>;

/**
 * An on-off switch. Off is `false`. A switch is never invalid, so it has
 * no help text or message; its label is its text.
 */
export function SwitchInput<T extends FieldValues = never>({
  name,
  label,
  isDisabled,
}: SwitchInputProps<T>) {
  const { value, onChange, fieldProps } = useBoundField<T>(name);
  return (
    <Switch
      name={fieldProps.name}
      isSelected={Boolean(value)}
      onChange={onChange}
      onBlur={fieldProps.onBlur}
      isDisabled={isDisabled}
    >
      {label}
    </Switch>
  );
}

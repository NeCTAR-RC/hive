import { NumberField } from "@ardc-ui/react";
import type { FieldValues } from "react-hook-form";
import { fieldChrome } from "./fieldChrome";
import type { BindingProps } from "./props";
import { useBoundField } from "./useBoundField";

export interface NumberInputProps<T extends FieldValues> extends BindingProps<
  T,
  number | null | undefined
> {
  minValue?: number;
  maxValue?: number;
  step?: number;
  /** A unit shown beside the input, such as "GB". */
  addon?: string;
}

/**
 * A number field. Empty is `undefined`: the library reports a cleared
 * field as NaN, which never reaches the form.
 */
export function NumberInput<T extends FieldValues = never>({
  name,
  label,
  description,
  isRequired,
  isDisabled,
  minValue,
  maxValue,
  step,
  addon,
}: NumberInputProps<T>) {
  const { value, onChange, fieldProps, errorMessage } = useBoundField<T>(name);
  const chrome = fieldChrome({ label, description, errorMessage });
  return (
    <NumberField
      {...fieldProps}
      value={typeof value === "number" ? value : NaN}
      onChange={(next) => onChange(Number.isNaN(next) ? undefined : next)}
      isRequired={isRequired}
      isDisabled={isDisabled}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      addon={addon}
    >
      {chrome.label}
      {chrome.description}
      {chrome.error}
    </NumberField>
  );
}

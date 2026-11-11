import { RadioGroup, RadioGroupItem } from "@ardc-ui/react";
import type { FieldValues } from "react-hook-form";
import { fieldChrome } from "./fieldChrome";
import type { BindingProps, ChoiceProps } from "./props";
import { useBoundField } from "./useBoundField";

export interface RadioInputProps<T extends FieldValues>
  extends BindingProps<T, string | null | undefined>, ChoiceProps {}

/** A single choice from options shown side by side. Nothing chosen is `null`. */
export function RadioInput<T extends FieldValues = never>({
  name,
  label,
  description,
  isRequired,
  isDisabled,
  options,
  onValueChange,
}: RadioInputProps<T>) {
  const { value, onChange, fieldProps, errorMessage } = useBoundField<T>(name);
  const chrome = fieldChrome({ label, description, errorMessage });
  return (
    <RadioGroup
      {...fieldProps}
      value={typeof value === "string" ? value : null}
      onChange={(next) => {
        onChange(next);
        onValueChange?.(next);
      }}
      isRequired={isRequired}
      isDisabled={isDisabled}
    >
      {chrome.label}
      {chrome.description}
      {options.map((option) => (
        <RadioGroupItem
          key={option.id}
          value={option.id}
          isDisabled={option.isDisabled}
        >
          {option.label}
        </RadioGroupItem>
      ))}
      {chrome.error}
    </RadioGroup>
  );
}
